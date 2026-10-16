import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Sincronização de pedidos Olist → WMS (v7, 16/10/2026).
// Quem pode chamar:
//   • admin logado (botão "Sincronizar") → origem "manual"
//   • agendamento do banco (pg_cron), com o cabeçalho x-chave-cron → origem "auto",
//     só roda se config_wms.sync_auto_olist = 'ligada'
// verify_jwt = false nesta função: a checagem de quem chama é feita aqui dentro.
// Novidades da v7: lê todas as páginas do Olist (antes só a 1ª, até 100 pedidos),
// uma sincronização por vez (trava no banco), registro em public.sincronizacoes,
// limite de pedidos novos por rodada e pausa entre chamadas (limite da API do Olist).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const API = "https://api.tiny.com.br/api2";
const MAX_PAGINAS = 20;          // 20 × 100 = até 2.000 pedidos em 7 dias
const MAX_NOVOS_POR_RODADA = 60; // o resto entra na próxima rodada (5 min depois)
const PAUSA_MS = 350;            // entre chamadas ao Olist, para não estourar o limite por minuto

function fmtData(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chamarOlist(metodo: string, params: Record<string, string>) {
  const resp = await fetch(`${API}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, formato: "json" }),
  });
  return await resp.json().catch(() => ({}));
}
// o Olist responde "API Bloqueada" / "Excedido o número de acessos" quando passa do limite
function limiteEstourado(r: any) {
  const txt = JSON.stringify(r?.retorno?.erros || r?.retorno || "").toLowerCase();
  return txt.includes("bloquead") || txt.includes("excedid") || String(r?.retorno?.codigo_erro || "") === "6";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const lerSecreto = async (chave: string) =>
    (await admin.from("config_secretos").select("valor").eq("chave", chave).maybeSingle()).data?.valor || "";

  // ---------- quem está chamando ----------
  let origem: "auto" | "manual";
  let usuarioId: string | null = null;
  const chaveCron = req.headers.get("x-chave-cron");
  if (chaveCron !== null) {
    const esperada = await lerSecreto("sync_chave_cron");
    if (!esperada || chaveCron !== esperada) return json({ error: "chave inválida" }, 401);
    const { data: flag } = await admin.from("config_wms").select("valor").eq("chave", "sync_auto_olist").maybeSingle();
    if (flag?.valor !== "ligada") return json({ pulado: "sincronização automática desligada" });
    origem = "auto";
  } else {
    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) return json({ error: "não autenticado" }, 401);
    const { data: perfil } = await admin.from("perfis").select("papel,ativo").eq("id", userData.user.id).single();
    if (!perfil || perfil.papel !== "admin" || perfil.ativo === false) return json({ error: "acesso restrito a admin" }, 403);
    origem = "manual";
    usuarioId = userData.user.id;
  }

  // ---------- uma por vez ----------
  const { data: syncId, error: erroTrava } = await admin.rpc("sync_iniciar", { p_origem: origem, p_usuario: usuarioId });
  if (erroTrava) return json({ error: "falha ao registrar a sincronização: " + erroTrava.message }, 500);
  if (!syncId) return json({ ocupado: true, error: "Já tem uma sincronização rodando. Tente de novo em instantes." }, 409);

  const finalizar = async (campos: Record<string, unknown>) => {
    await admin.from("sincronizacoes").update({ ...campos, terminado_em: new Date().toISOString() }).eq("id", syncId);
  };

  try {
    const token = await lerSecreto("olist_token");
    if (!token) {
      await finalizar({ erro: "token do Olist não configurado" });
      return json({ error: "token do Olist não configurado" }, 400);
    }

    const hoje = new Date();
    const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ---------- 1) todas as páginas da pesquisa ----------
    const pedidosOlist: any[] = [];
    let paginas = 0;
    let totalPaginas = 1;
    for (let pagina = 1; pagina <= Math.min(totalPaginas, MAX_PAGINAS); pagina++) {
      if (pagina > 1) await esperar(PAUSA_MS);
      const r = await chamarOlist("pedidos.pesquisa.php", {
        token, dataInicial: fmtData(seteDiasAtras), dataFinal: fmtData(hoje), pagina: String(pagina),
      });
      if (r?.retorno?.status !== "OK") {
        // "nenhum registro encontrado" na 1ª página não é erro: só não há pedidos no período
        const semRegistros = JSON.stringify(r?.retorno || "").toLowerCase().includes("não retornou registros") ||
          String(r?.retorno?.codigo_erro || "") === "20";
        if (pagina === 1 && semRegistros) break;
        const msg = limiteEstourado(r) ? "limite de chamadas do Olist atingido — tenta de novo na próxima rodada" : "Olist retornou erro na busca de pedidos";
        await finalizar({ paginas, encontrados: pedidosOlist.length, erro: msg, resumo: { detalhe: r?.retorno ?? r } });
        return json({ error: msg, detalhe: r?.retorno ?? r }, 502);
      }
      paginas++;
      totalPaginas = Math.max(1, Number(r.retorno.numero_paginas) || 1);
      for (const x of r.retorno.pedidos || []) pedidosOlist.push(x.pedido);
    }

    // ---------- 2) o que já existe no WMS (uma consulta só) ----------
    const idsExternos = pedidosOlist.map((p) => String(p.numero_ecommerce || p.numero || p.id));
    const existentes = new Map<string, { id: string; status: string; separadas: number }>();
    for (let i = 0; i < idsExternos.length; i += 200) {
      const lote = idsExternos.slice(i, i + 200);
      const { data } = await admin.from("pedidos").select("id,id_externo,status,itens_pedido(qtd_separada)").in("id_externo", lote);
      for (const p of data || []) {
        const sep = (p.itens_pedido || []).reduce((s: number, it: any) => s + Math.max(0, it.qtd_separada || 0), 0);
        existentes.set(p.id_externo, { id: p.id, status: p.status, separadas: sep });
      }
    }

    let importados = 0, jaExistentes = 0, semItensValidos = 0, cancelados = 0, deixadosParaDepois = 0;
    let parouPorLimite = false;
    const canceladosNoWms: string[] = [];
    const avisos: string[] = [];
    const produtosNovos = new Set<string>();
    const erros: string[] = [];

    for (const p of pedidosOlist) {
      const idExterno = String(p.numero_ecommerce || p.numero || p.id);
      const noWms = existentes.get(idExterno);

      // ---------- cancelado no Olist ----------
      if (String(p.situacao || "").toLowerCase().includes("cancel")) {
        cancelados++;
        if (noWms && noWms.status !== "cancelado" && noWms.status !== "expedido") {
          const { error: erroCanc } = await admin.from("pedidos").update({
            status: "cancelado", status_antes_cancelar: noWms.status, cancelado_em: new Date().toISOString(),
            cancelado_por: null, motivo_cancelamento: "Cancelado no Olist (sincronização)", reservado_por: null, reservado_em: null,
          }).eq("id", noWms.id).neq("status", "expedido");
          if (erroCanc) {
            erros.push(`pedido ${idExterno}: cancelado no Olist, mas falhou ao cancelar no WMS (${erroCanc.message})`);
          } else {
            canceladosNoWms.push(idExterno);
            if (noWms.separadas > 0) avisos.push(`${idExterno}: ${noWms.separadas} un. já separadas — devolver à prateleira e lançar pela Transferência`);
          }
        } else if (noWms && noWms.status === "expedido") {
          avisos.push(`${idExterno}: cancelado no Olist, mas já foi EXPEDIDO no WMS — verificar devolução`);
        }
        continue;
      }

      if (noWms) { jaExistentes++; continue; }
      if (parouPorLimite || importados + semItensValidos >= MAX_NOVOS_POR_RODADA) { deixadosParaDepois++; continue; }

      // ---------- pedido novo: busca os itens ----------
      await esperar(PAUSA_MS);
      const obterJson = await chamarOlist("pedido.obter.php", { token, id: String(p.id) });
      if (limiteEstourado(obterJson)) { parouPorLimite = true; deixadosParaDepois++; continue; }
      const detalhe = obterJson?.retorno?.pedido;
      if (!detalhe) { erros.push(`pedido ${idExterno}: não foi possível obter detalhes`); continue; }

      const itensValidos: { produto_id: string; qtd: number }[] = [];
      for (const it of (detalhe.itens || []).map((x: any) => x.item)) {
        const codigo = it?.codigo;
        if (!codigo) continue;
        let produtoId: string | null = null;
        const { data: produto } = await admin.from("produtos").select("id").eq("sku", codigo).maybeSingle();
        if (produto) {
          produtoId = produto.id;
        } else {
          const nome = (it?.descricao || codigo).toString().slice(0, 200);
          const { data: criado, error: erroCriar } = await admin.from("produtos").insert({ sku: codigo, nome }).select("id").single();
          if (criado) {
            produtoId = criado.id;
            produtosNovos.add(`${codigo} — ${nome}`);
          } else if (erroCriar?.code === "23505") {
            const { data: jaCriado } = await admin.from("produtos").select("id").eq("sku", codigo).maybeSingle();
            if (!jaCriado) { erros.push(`SKU ${codigo}: falha ao cadastrar produto (${erroCriar?.message})`); continue; }
            produtoId = jaCriado.id;
          } else {
            erros.push(`SKU ${codigo}: falha ao cadastrar produto (${erroCriar?.message})`);
            continue;
          }
        }
        itensValidos.push({ produto_id: produtoId!, qtd: Math.max(1, Math.round(Number(it.quantidade) || 1)) });
      }
      if (itensValidos.length === 0) { semItensValidos++; continue; }

      const { data: novoPedido, error: erroPedido } = await admin.from("pedidos")
        .insert({ id_externo: idExterno, canal: "olist", status: "a_separar" }).select().single();
      if (erroPedido || !novoPedido) {
        if (erroPedido?.code === "23505") jaExistentes++;
        else erros.push(`pedido ${idExterno}: erro ao gravar (${erroPedido?.message})`);
        continue;
      }
      const { error: erroItens } = await admin.from("itens_pedido")
        .insert(itensValidos.map((it) => ({ ...it, pedido_id: novoPedido.id })));
      if (erroItens) {
        await admin.from("pedidos").delete().eq("id", novoPedido.id);
        erros.push(`pedido ${idExterno}: erro ao gravar itens (${erroItens.message}) — será importado na próxima sincronização`);
        continue;
      }
      importados++;
    }

    if (deixadosParaDepois > 0) {
      avisos.push(`${deixadosParaDepois} pedido(s) novo(s) ficaram para a próxima rodada` + (parouPorLimite ? " (limite de chamadas do Olist)" : ""));
    }

    const resultado = {
      origem,
      periodo: { de: fmtData(seteDiasAtras), ate: fmtData(hoje) },
      paginas,
      encontrados_no_olist: pedidosOlist.length,
      importados,
      ja_existentes: jaExistentes,
      sem_itens_reconhecidos: semItensValidos,
      cancelados_ignorados: cancelados,
      cancelados_no_wms: canceladosNoWms,
      pendentes_proxima_rodada: deixadosParaDepois,
      avisos,
      produtos_cadastrados_automaticamente: Array.from(produtosNovos),
      erros,
    };
    await finalizar({
      encontrados: pedidosOlist.length, paginas, importados, ja_existentes: jaExistentes,
      cancelados_no_wms: canceladosNoWms.length, erros: erros.length,
      resumo: { avisos, erros, cancelados_no_wms: canceladosNoWms, produtos_novos: Array.from(produtosNovos), pendentes: deixadosParaDepois },
    });
    return json(resultado);
  } catch (e) {
    await finalizar({ erro: String(e) });
    return json({ error: String(e) }, 500);
  }
});
