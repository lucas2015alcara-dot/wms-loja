import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Busca no Olist (API v2) a nota fiscal de um pedido do WMS. Qualquer login ativo pode consultar.
// Entrada: { pedido_id }  →  { status: "ok" | "sem_nota" | "nao_encontrado" | "nao_olist", ... }
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const API = "https://api.tiny.com.br/api2";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

async function tiny(metodo: string, token: string, params: Record<string, string>) {
  const body = new URLSearchParams({ token, formato: "json", ...params });
  const r = await fetch(`${API}/${metodo}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  return j?.retorno ?? {};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!u?.user) return json({ error: "não autenticado" }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: perfil } = await admin.from("perfis").select("ativo").eq("id", u.user.id).single();
    if (!perfil || perfil.ativo === false) return json({ error: "login desativado" }, 403);

    const { pedido_id } = await req.json().catch(() => ({}));
    if (!pedido_id) return json({ error: "pedido não informado" }, 400);
    const { data: ped } = await admin.from("pedidos").select("id,id_externo,canal,olist_id").eq("id", pedido_id).maybeSingle();
    if (!ped) return json({ error: "pedido não encontrado no WMS" }, 404);
    if (ped.canal !== "olist") return json({ status: "nao_olist" });

    const { data: cfg } = await admin.from("config_secretos").select("valor").eq("chave", "olist_token").maybeSingle();
    const token = cfg?.valor;
    if (!token) return json({ error: "token do Olist não configurado" }, 500);

    // 1) id do pedido no Olist (guardado na sincronização; senão, procura pelo nº)
    let olistId = ped.olist_id as string | null;
    if (!olistId) {
      const alvo = String(ped.id_externo);
      const tentativas: Record<string, string>[] = [{ numeroEcommerce: alvo }];
      if (/^\d+$/.test(alvo)) tentativas.push({ numero: alvo });
      tentativas.push({ pesquisa: alvo });
      for (const t of tentativas) {
        const r = await tiny("pedidos.pesquisa.php", token, t);
        const achado = (r.pedidos || []).map((x: any) => x.pedido)
          .find((p: any) => String(p.numero_ecommerce || "") === alvo || String(p.numero) === alvo);
        if (achado) { olistId = String(achado.id); break; }
      }
      if (!olistId) return json({ status: "nao_encontrado" });
      await admin.from("pedidos").update({ olist_id: olistId }).eq("id", ped.id);
    }

    // 2) nota vinculada ao pedido
    const rp = await tiny("pedido.obter.php", token, { id: olistId });
    const idNota = String(rp?.pedido?.id_nota_fiscal || "");
    if (!idNota || idNota === "0") return json({ status: "sem_nota", situacao_pedido: rp?.pedido?.situacao || "" });

    // 3) dados da nota + link do PDF (+ protocolo, quando autorizada)
    const rn = await tiny("nota.fiscal.obter.php", token, { id: idNota });
    const nf = rn?.nota_fiscal || {};
    const desc = String(nf.descricao_situacao || "");
    const chave = String(nf.chave_acesso || "").replace(/\D/g, "");
    const autorizada = /autoriz|emitida/i.test(desc) && chave.length === 44;
    let link = "";
    const rl = await tiny("nota.fiscal.obter.link.php", token, { id: idNota });
    if (rl?.status === "OK") link = rl.link_nfe || "";
    let protocolo = "", dataProtocolo = "";
    if (autorizada) {
      // este método devolve XML (não JSON): lê como texto
      const rx = await fetch(`${API}/nota.fiscal.obter.xml.php`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, id: idNota }),
      });
      const xml = await rx.text().catch(() => "");
      protocolo = (xml.match(/<nProt>(\d+)<\/nProt>/) || [])[1] || "";
      dataProtocolo = (xml.match(/<dhRecbto>([^<]+)<\/dhRecbto>/) || [])[1] || "";
    }
    const end = (c: any) => c ? {
      nome: c.nome_destinatario || c.nome || "", cpf_cnpj: c.cpf_cnpj || "", ie: c.ie || "",
      endereco: c.endereco || "", numero: c.numero || "", complemento: c.complemento || "",
      bairro: c.bairro || "", cep: c.cep || "", cidade: c.cidade || "", uf: c.uf || "",
    } : null;
    const obs = String(nf.obs || "").split(/\r?\n/).map((l: string) => l.trim())
      .filter((l: string) => l && !/^\d+([.,]\d+)?$/.test(l)).join("\n");

    return json({
      status: "ok",
      autorizada,
      numero: nf.numero || "",
      serie: nf.serie || "",
      data_emissao: nf.data_emissao || "",
      situacao: desc,
      chave: autorizada ? chave : "",
      protocolo, data_protocolo: dataProtocolo,
      valor: nf.valor_nota || "",
      cliente: end(nf.cliente),
      entrega: end(nf.endereco_entrega) || end(nf.cliente),
      itens: (nf.itens || []).map((x: any) => x.item || x).map((i: any) => ({
        codigo: i.codigo || "", descricao: i.descricao || "", unidade: i.unidade || "",
        quantidade: i.quantidade || "", valor_unitario: i.valor_unitario || "", valor_total: i.valor_total || "",
      })),
      obs,
      link,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
