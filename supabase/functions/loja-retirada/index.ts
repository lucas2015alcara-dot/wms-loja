import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Retirada da loja (Parte 1): produto saiu da prateleira → estoque sai no Olist na hora.
// Ações: inicio | buscar | registrar | devolver
// Pedido criado pela API v3 (permite escolher depósito e vendedor); baixa/estorno de estoque pela v2
// (a v3 recusou lancar-estoque com 403) — a v2 lança a partir do depósito gravado no pedido.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const V2 = "https://api.tiny.com.br/api2";
const V3 = "https://api.tiny.com.br/public-api/v3";
const TOKEN = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const erro = (m: string, s = 400) => json({ error: m }, s);

// situações v3 → status da retirada
const SIT_VENDIDA = [1, 3, 4, 5, 6, 7];
const SIT_CANCELADA = 2;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!u?.user) return erro("não autenticado", 401);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: perfil } = await db.from("perfis").select("nome,papel,ativo").eq("id", u.user.id).single();
    if (!perfil || perfil.ativo === false) return erro("login desativado", 403);

    const segredo = async (k: string) => (await db.from("config_secretos").select("valor").eq("chave", k).maybeSingle()).data?.valor || "";
    const gravar = (k: string, v: string) => db.from("config_secretos").upsert({ chave: k, valor: v, atualizado_em: new Date().toISOString() });
    const config = async (k: string) => (await db.from("config_wms").select("valor").eq("chave", k).maybeSingle()).data?.valor || "";

    const tokenV2 = await segredo("olist_token");
    if (!tokenV2) return erro("token do Olist não configurado", 500);

    // ---- API v2 ----
    async function v2(metodo: string, params: Record<string, string>) {
      const body = new URLSearchParams({ token: tokenV2, formato: "json", ...params });
      const r = await fetch(`${V2}/${metodo}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      const j = await r.json().catch(() => ({}));
      const ret = j?.retorno ?? {};
      if (String(ret.codigo_erro) === "6") throw new Error("O Olist pediu uma pausa (muitas consultas seguidas). Tente de novo em 1 minuto.");
      return ret;
    }
    const errosV2 = (ret: any) => (ret?.erros || []).map((e: any) => e?.erro || JSON.stringify(e)).join("; ") || "erro desconhecido";

    // ---- API v3 (renova o acesso se estiver para vencer) ----
    let tokenV3 = "";
    async function acessoV3() {
      if (tokenV3) return tokenV3;
      const expira = new Date(await segredo("olist_v3_access_expira") || 0).getTime();
      tokenV3 = await segredo("olist_v3_access_token");
      if (!tokenV3) throw new Error("O WMS não está conectado à API nova do Olist.");
      if (expira - Date.now() < 3 * 60 * 1000) {
        const r = await fetch(TOKEN, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token", client_id: await segredo("olist_v3_client_id"),
            client_secret: await segredo("olist_v3_client_secret"), refresh_token: await segredo("olist_v3_refresh_token"),
          }),
        });
        const t = await r.json().catch(() => ({}));
        if (!r.ok || !t.access_token) throw new Error("A conexão com o Olist expirou. Peça ao admin para conectar de novo.");
        tokenV3 = t.access_token;
        await gravar("olist_v3_access_token", t.access_token);
        if (t.refresh_token) await gravar("olist_v3_refresh_token", t.refresh_token);
        await gravar("olist_v3_access_expira", new Date(Date.now() + (Number(t.expires_in) || 14400) * 1000).toISOString());
      }
      return tokenV3;
    }
    async function v3(metodo: string, caminho: string, corpo?: unknown) {
      const r = await fetch(`${V3}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${await acessoV3()}`, ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
      const txt = await r.text();
      let dados: any = null;
      try { dados = txt ? JSON.parse(txt) : null; } catch { dados = txt; }
      return { ok: r.ok, status: r.status, dados };
    }
    const msgV3 = (r: any) => {
      const d = r.dados;
      if (d && typeof d === "object") return [d.mensagem, ...(d.detalhes || []).map((x: any) => `${x.campo}: ${x.mensagem}`)].filter(Boolean).join(" — ") || `HTTP ${r.status}`;
      return `HTTP ${r.status}`;
    };

    const depositos: { id: string; nome: string }[] = JSON.parse((await config("loja_depositos")) || "[]");
    async function vendedores() {
      const r = await v2("vendedores.pesquisa.php", { pesquisa: "" });
      return (r.vendedores || []).map((x: any) => x.vendedor)
        .filter((v: any) => String(v.situacao || "").toLowerCase().startsWith("ativ"))
        .map((v: any) => ({ id: String(v.id), nome: String(v.nome || "").trim() }))
        .sort((a: any, b: any) => a.nome.localeCompare(b.nome));
    }
    async function saldoPorDeposito(produtoId: string) {
      const r = await v3("GET", `/estoque/${produtoId}`);
      if (!r.ok) throw new Error("Não consegui ler o estoque no Olist: " + msgV3(r));
      // usa saldo − reservado: o campo "disponivel" da v3 vem 0 sem a extensão de reservas
      const porId: Record<string, number> = {};
      (r.dados?.depositos || []).forEach((d: any) => { porId[String(d.id)] = (Number(d.saldo) || 0) - (Number(d.reservado) || 0); });
      return { nome: String(r.dados?.nome || "").trim(), codigo: String(r.dados?.codigo || ""), porId };
    }

    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao || "");

    // ------------------------------------------------------------------ inicio
    if (acao === "inicio") {
      // atualiza retiradas abertas conforme o pedido no Olist (vendida / cancelada lá)
      const { data: abertas } = await db.from("retiradas_loja").select("id,olist_pedido_id").eq("status", "aberta").order("criado_em").limit(15);
      for (const a of abertas || []) {
        if (!a.olist_pedido_id) continue;
        const r = await v3("GET", `/pedidos/${a.olist_pedido_id}`);
        if (!r.ok) continue;
        const sit = Number(r.dados?.situacao);
        if (SIT_VENDIDA.includes(sit)) await db.from("retiradas_loja").update({ status: "vendida", fechado_em: new Date().toISOString(), fechado_por_nome: "Olist" }).eq("id", a.id);
        else if (sit === SIT_CANCELADA) await db.from("retiradas_loja").update({ status: "cancelada_olist", fechado_em: new Date().toISOString(), fechado_por_nome: "Olist" }).eq("id", a.id);
      }
      const { data: lista } = await db.from("retiradas_loja").select("*").order("criado_em", { ascending: false }).limit(60);
      let vend: any[] = [];
      let avisoVend = "";
      try { vend = await vendedores(); } catch (e) { avisoVend = String((e as Error).message || e); }
      return json({ depositos, vendedores: vend, aviso: avisoVend, retiradas: lista || [] });
    }

    // ------------------------------------------------------------------ buscar
    if (acao === "buscar") {
      const termo = String(body.termo || "").trim();
      if (termo.length < 2) return erro("Digite pelo menos 2 letras ou o código.");
      let rp = await v2("produtos.pesquisa.php", { pesquisa: termo, situacao: "A" });
      // código de barras: o Olist pode ter salvo com ou sem o zero à esquerda
      if (rp.status !== "OK" && /^\d{8,14}$/.test(termo)) {
        const alt = termo.startsWith("0") ? termo.replace(/^0+/, "") : "0" + termo;
        rp = await v2("produtos.pesquisa.php", { pesquisa: alt, situacao: "A" });
      }
      const todos = rp.status === "OK" ? (rp.produtos || []).map((x: any) => x.produto) : [];
      const lista = todos.slice(0, 8);
      const ids = lista.map((p: any) => String(p.id));
      const { data: cache } = ids.length ? await db.from("catalogo_cache").select("olist_id,foto").in("olist_id", ids) : { data: [] };
      const foto: Record<string, string> = {};
      (cache || []).forEach((c: any) => { if (c.foto) foto[c.olist_id] = c.foto; });
      const produtos = [];
      for (const p of lista) {
        let saldos: Record<string, number> = {};
        try { saldos = (await saldoPorDeposito(String(p.id))).porId; } catch { /* mostra sem saldo */ }
        produtos.push({
          id: String(p.id), codigo: p.codigo || "", nome: String(p.nome || "").trim(), preco: Number(p.preco) || 0,
          foto: foto[String(p.id)] || null,
          saldos: depositos.map((d) => ({ id: d.id, nome: d.nome, saldo: saldos[d.id] ?? 0 })),
        });
      }
      return json({ produtos, mais: todos.length > 8 });
    }

    // ------------------------------------------------------------------ registrar
    if (acao === "registrar") {
      const produtoId = String(body.produto_id || "");
      const quantidade = Number(body.quantidade);
      const depositoId = String(body.deposito_id || "");
      const vendedorId = String(body.vendedor_id || "");
      const obs = String(body.obs || "").trim().slice(0, 200);
      if (!produtoId) return erro("Escolha o produto.");
      if (!(quantidade > 0) || !Number.isInteger(quantidade) || quantidade > 50) return erro("Quantidade inválida.");
      const dep = depositos.find((d) => d.id === depositoId);
      if (!dep) return erro("Escolha de qual depósito o produto saiu.");
      const vend = (await vendedores()).find((v: any) => v.id === vendedorId);
      if (!vend) return erro("Escolha o vendedor.");

      const est = await saldoPorDeposito(produtoId);
      const saldo = est.porId[depositoId] ?? 0;
      if (saldo < quantidade && !body.forcar) {
        return json({ aviso: "saldo", saldo, deposito: dep.nome });
      }
      // preço de venda padrão (o vendedor ajusta no Olist ao finalizar)
      const pr = await v3("GET", `/produtos/${produtoId}`);
      const preco = Number(pr.dados?.precos?.preco ?? pr.dados?.preco) || 0;
      const nomeProduto = est.nome || String(pr.dados?.descricao || "");
      const contato = Number(await config("loja_contato_balcao")) || undefined;

      const criado = await v3("POST", "/pedidos", {
        ...(contato ? { idContato: contato } : {}),
        deposito: { id: Number(depositoId) },
        vendedor: { id: Number(vendedorId) },
        situacao: 0,
        observacoesInternas: `RESERVA LOJA via WMS — registrado por ${perfil.nome || "?"}${obs ? " — " + obs : ""}`.slice(0, 100),
        itens: [{ produto: { id: Number(produtoId), tipo: "P" }, quantidade, valorUnitario: preco }],
      });
      if (!criado.ok || !criado.dados?.id) return erro("O Olist recusou o pedido: " + msgV3(criado));
      const pedidoId = String(criado.dados.id);
      const pedidoNum = String(criado.dados.numeroPedido || "");
      await v3("POST", `/pedidos/${pedidoId}/marcadores`, [{ descricao: "RESERVA LOJA" }]);

      const lanc = await v2("pedido.lancar.estoque.php", { id: pedidoId });
      if (lanc.status !== "OK") {
        await v2("pedido.alterar.situacao.php", { id: pedidoId, situacao: "cancelado" });
        return erro(`O pedido ${pedidoNum} foi criado mas o Olist não baixou o estoque (${errosV2(lanc)}). Cancelei o pedido; nada mudou no estoque.`);
      }
      const { data: linha, error } = await db.from("retiradas_loja").insert({
        criado_por: u.user.id, criado_por_nome: perfil.nome || "",
        vendedor_id: vend.id, vendedor_nome: vend.nome,
        produto_id: produtoId, produto_codigo: est.codigo, produto_nome: nomeProduto,
        quantidade, valor_unitario: preco, deposito_id: dep.id, deposito_nome: dep.nome, obs: obs || null,
        olist_pedido_id: pedidoId, olist_pedido_numero: pedidoNum, status: "aberta",
      }).select().single();
      if (error) return erro(`Estoque baixado no Olist (pedido ${pedidoNum}), mas não consegui salvar no WMS: ${error.message}. Avise o admin.`, 500);
      return json({ ok: true, retirada: linha });
    }

    // ------------------------------------------------------------------ devolver
    if (acao === "devolver") {
      const id = String(body.id || "");
      const { data: r } = await db.from("retiradas_loja").select("*").eq("id", id).maybeSingle();
      if (!r) return erro("Retirada não encontrada.", 404);
      if (r.status !== "aberta") return erro("Essa retirada já foi encerrada.");
      // confere se o pedido ainda está em aberto no Olist
      const ped = await v3("GET", `/pedidos/${r.olist_pedido_id}`);
      const sit = Number(ped.dados?.situacao);
      if (ped.ok && SIT_VENDIDA.includes(sit)) {
        await db.from("retiradas_loja").update({ status: "vendida", fechado_em: new Date().toISOString(), fechado_por_nome: "Olist" }).eq("id", id);
        return erro(`O pedido ${r.olist_pedido_numero} já foi finalizado no Olist — não dá para devolver por aqui.`);
      }
      if (!(ped.ok && sit === SIT_CANCELADA)) {
        const est = await v2("pedido.estornar.estoque.php", { id: r.olist_pedido_id });
        if (est.status !== "OK") return erro("O Olist não devolveu o estoque: " + errosV2(est));
        const c = await v3("PUT", `/pedidos/${r.olist_pedido_id}/situacao`, { situacao: SIT_CANCELADA });
        if (!c.ok) await v2("pedido.alterar.situacao.php", { id: r.olist_pedido_id, situacao: "cancelado" });
      }
      await db.from("retiradas_loja").update({
        status: "devolvida", fechado_em: new Date().toISOString(), fechado_por: u.user.id, fechado_por_nome: perfil.nome || "",
      }).eq("id", id);
      return json({ ok: true });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    return erro(String((e as Error)?.message || e), 500);
  }
});
