import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Conexão OAuth 2 com a API v3 do Olist ERP.
// 1) Admin abre  .../olist-oauth?iniciar=<chave de início>  → vai para o login do Olist
// 2) Olist volta em .../olist-oauth?code=...&state=...      → troca o code pelos tokens e guarda em config_secretos
const AUTH = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth";
const TOKEN = "https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token";

// o Supabase entrega HTML de funções como texto puro, então a resposta é texto simples
function pagina(titulo: string, texto: string, ok: boolean) {
  return new Response(`${ok ? "OK" : "ERRO"} — ${titulo}\n\n${texto}\n`, {
    status: ok ? 200 : 400, headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ler = async (chave: string) =>
      (await admin.from("config_secretos").select("valor").eq("chave", chave).maybeSingle()).data?.valor || "";
    const gravar = (chave: string, valor: string) =>
      admin.from("config_secretos").upsert({ chave, valor, atualizado_em: new Date().toISOString() });

    const clientId = await ler("olist_v3_client_id");
    const clientSecret = await ler("olist_v3_client_secret");
    const redirect = `${url.origin}${url.pathname}`;
    if (!clientId || !clientSecret) {
      return pagina("Faltam as chaves", "Cadastre o Client ID e o Client Secret do aplicativo do Olist antes de conectar.", false);
    }

    // 3) Agendamento (pg_cron) chama .../olist-oauth?renovar=<chave cron> para manter o acesso vivo
    const renovar = url.searchParams.get("renovar");
    if (renovar !== null) {
      const chaveCron = await ler("olist_v3_chave_cron");
      if (!chaveCron || renovar !== chaveCron) return pagina("Link inválido", "Chave de renovação não confere.", false);
      const refresh = await ler("olist_v3_refresh_token");
      if (!refresh) return pagina("Sem conexão", "Conecte o Olist primeiro.", false);
      const r = await fetch(TOKEN, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refresh }),
      });
      const t = await r.json().catch(() => ({}));
      if (!r.ok || !t.access_token) return pagina("Falha ao renovar", String(t.error_description || t.error || r.status), false);
      const agora = Date.now();
      await gravar("olist_v3_access_token", t.access_token);
      if (t.refresh_token) await gravar("olist_v3_refresh_token", t.refresh_token);
      await gravar("olist_v3_access_expira", new Date(agora + (Number(t.expires_in) || 14400) * 1000).toISOString());
      if (t.refresh_expires_in !== undefined) await gravar("olist_v3_refresh_expira", new Date(agora + (Number(t.refresh_expires_in) || 86400) * 1000).toISOString());
      return pagina("Acesso renovado", "ok", true);
    }

    const iniciar = url.searchParams.get("iniciar");
    if (iniciar !== null) {
      const chaveInicio = await ler("olist_v3_chave_inicio");
      if (!chaveInicio || iniciar !== chaveInicio) return pagina("Link inválido", "Peça um link de conexão novo.", false);
      const state = crypto.randomUUID();
      await gravar("olist_v3_state", state);
      const destino = `${AUTH}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}` +
        `&scope=openid&response_type=code&state=${state}`;
      return Response.redirect(destino, 302);
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) return pagina("Nada a fazer", "Use o link de conexão enviado pelo Claude.", false);
    const esperado = await ler("olist_v3_state");
    if (!state || state !== esperado) return pagina("Conexão recusada", "O pedido de conexão expirou ou não confere. Use o link de conexão de novo.", false);

    const resp = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirect, code,
      }),
    });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok || !j.access_token) {
      return pagina("Falha ao conectar", "O Olist recusou a troca do código: " + (j.error_description || j.error || resp.status), false);
    }
    const agora = Date.now();
    await gravar("olist_v3_access_token", j.access_token);
    await gravar("olist_v3_refresh_token", j.refresh_token || "");
    await gravar("olist_v3_access_expira", new Date(agora + (Number(j.expires_in) || 14400) * 1000).toISOString());
    await gravar("olist_v3_refresh_expira", new Date(agora + (Number(j.refresh_expires_in) || 86400) * 1000).toISOString());
    await gravar("olist_v3_state", "");
    return pagina("Olist conectado ✓", "O WMS já pode usar a API nova do Olist. Pode fechar esta página.", true);
  } catch (e) {
    return pagina("Erro", String(e), false);
  }
});
