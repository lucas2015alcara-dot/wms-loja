import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function fmtData(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: "não autenticado" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: perfil } = await admin
      .from("perfis")
      .select("papel")
      .eq("id", userData.user.id)
      .single();
    if (!perfil || perfil.papel !== "admin") {
      return json({ error: "acesso restrito a admin" }, 403);
    }

    const { data: cfg } = await admin
      .from("config_secretos")
      .select("valor")
      .eq("chave", "olist_token")
      .maybeSingle();
    const token = cfg?.valor;
    if (!token) {
      return json({ error: "token do Olist não configurado" }, 400);
    }

    const hoje = new Date();
    const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);

    const buscaBody = new URLSearchParams({
      token,
      formato: "json",
      dataInicial: fmtData(seteDiasAtras),
      dataFinal: fmtData(hoje),
    });

    const buscaResp = await fetch("https://api.tiny.com.br/api2/pedidos.pesquisa.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buscaBody,
    });
    const buscaJson = await buscaResp.json();

    if (buscaJson?.retorno?.status !== "OK") {
      return json(
        { error: "Olist retornou erro na busca de pedidos", detalhe: buscaJson?.retorno ?? buscaJson },
        502,
      );
    }

    const pedidosOlist = (buscaJson.retorno.pedidos || []).map((p: any) => p.pedido);

    let importados = 0;
    let jaExistentes = 0;
    let semItensValidos = 0;
    let cancelados = 0;
    const canceladosNoWms: string[] = [];
    const avisos: string[] = [];
    const produtosNovos = new Set<string>();
    const erros: string[] = [];

    for (const p of pedidosOlist) {
      const idExterno = String(p.numero_ecommerce || p.numero || p.id);

      // pedido cancelado no Olist não entra no WMS ("Cancelado", "cancelado"... qualquer grafia)
      if (String(p.situacao || "").toLowerCase().includes("cancel")) {
        cancelados++;
        // v6: se já estava no WMS e ainda não foi expedido, cancela no WMS também
        const { data: noWms } = await admin
          .from("pedidos")
          .select("id,status,itens_pedido(qtd_separada)")
          .eq("id_externo", idExterno)
          .maybeSingle();
        if (noWms && noWms.status !== "cancelado" && noWms.status !== "expedido") {
          const separadas = (noWms.itens_pedido || []).reduce(
            (s: number, i: any) => s + Math.max(0, i.qtd_separada || 0),
            0,
          );
          const { error: erroCanc } = await admin
            .from("pedidos")
            .update({
              status: "cancelado",
              status_antes_cancelar: noWms.status,
              cancelado_em: new Date().toISOString(),
              cancelado_por: null,
              motivo_cancelamento: "Cancelado no Olist (sincronização)",
              reservado_por: null,
              reservado_em: null,
            })
            .eq("id", noWms.id)
            .neq("status", "expedido");
          if (erroCanc) {
            erros.push(`pedido ${idExterno}: cancelado no Olist, mas falhou ao cancelar no WMS (${erroCanc.message})`);
          } else {
            canceladosNoWms.push(idExterno);
            if (separadas > 0) {
              avisos.push(`${idExterno}: ${separadas} un. já separadas — devolver à prateleira e lançar pela Transferência`);
            }
          }
        } else if (noWms && noWms.status === "expedido") {
          avisos.push(`${idExterno}: cancelado no Olist, mas já foi EXPEDIDO no WMS — verificar devolução`);
        }
        continue;
      }

      const { data: existente } = await admin
        .from("pedidos")
        .select("id")
        .eq("id_externo", idExterno)
        .maybeSingle();
      if (existente) {
        jaExistentes++;
        continue;
      }

      const obterBody = new URLSearchParams({ token, formato: "json", id: String(p.id) });
      const obterResp = await fetch("https://api.tiny.com.br/api2/pedido.obter.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: obterBody,
      });
      const obterJson = await obterResp.json();
      const detalhe = obterJson?.retorno?.pedido;
      if (!detalhe) {
        erros.push(`pedido ${idExterno}: não foi possível obter detalhes`);
        continue;
      }

      const itensOlist = (detalhe.itens || []).map((it: any) => it.item);
      const itensValidos: { produto_id: string; qtd: number }[] = [];

      for (const it of itensOlist) {
        const codigo = it?.codigo;
        if (!codigo) continue;

        let produtoId: string | null = null;
        const { data: produto } = await admin
          .from("produtos")
          .select("id")
          .eq("sku", codigo)
          .maybeSingle();

        if (produto) {
          produtoId = produto.id;
        } else {
          const nome = (it?.descricao || codigo).toString().slice(0, 200);
          const { data: criado, error: erroCriar } = await admin
            .from("produtos")
            .insert({ sku: codigo, nome })
            .select("id")
            .single();
          if (criado) {
            produtoId = criado.id;
            produtosNovos.add(`${codigo} — ${nome}`);
          } else if (erroCriar?.code === "23505") {
            // outra sincronização (outro admin) cadastrou esse SKU ao mesmo tempo — usa o que já existe
            const { data: jaCriado } = await admin
              .from("produtos")
              .select("id")
              .eq("sku", codigo)
              .maybeSingle();
            if (!jaCriado) {
              erros.push(`SKU ${codigo}: falha ao cadastrar produto (${erroCriar?.message})`);
              continue;
            }
            produtoId = jaCriado.id;
          } else {
            erros.push(`SKU ${codigo}: falha ao cadastrar produto (${erroCriar?.message})`);
            continue;
          }
        }

        const qtd = Math.max(1, Math.round(Number(it.quantidade) || 1));
        itensValidos.push({ produto_id: produtoId, qtd });
      }

      if (itensValidos.length === 0) {
        semItensValidos++;
        continue;
      }

      const { data: novoPedido, error: erroPedido } = await admin
        .from("pedidos")
        .insert({ id_externo: idExterno, canal: "olist", status: "a_separar" })
        .select()
        .single();
      if (erroPedido || !novoPedido) {
        if (erroPedido?.code === "23505") {
          // outra sincronização (outro admin) importou esse pedido ao mesmo tempo — não é erro
          jaExistentes++;
        } else {
          erros.push(`pedido ${idExterno}: erro ao gravar (${erroPedido?.message})`);
        }
        continue;
      }

      const { error: erroItens } = await admin
        .from("itens_pedido")
        .insert(itensValidos.map((it) => ({ ...it, pedido_id: novoPedido.id })));
      if (erroItens) {
        // não deixa pedido sem itens no WMS: desfaz e tenta de novo na próxima sincronização
        await admin.from("pedidos").delete().eq("id", novoPedido.id);
        erros.push(`pedido ${idExterno}: erro ao gravar itens (${erroItens.message}) — será importado na próxima sincronização`);
        continue;
      }

      importados++;
    }

    return json({
      periodo: { de: fmtData(seteDiasAtras), ate: fmtData(hoje) },
      encontrados_no_olist: pedidosOlist.length,
      importados,
      ja_existentes: jaExistentes,
      sem_itens_reconhecidos: semItensValidos,
      cancelados_ignorados: cancelados,
      cancelados_no_wms: canceladosNoWms,
      avisos,
      produtos_cadastrados_automaticamente: Array.from(produtosNovos),
      erros,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
