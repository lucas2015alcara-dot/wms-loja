import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Gestão de usuários do WMS — só admin. Ações: listar, criar, senha, papel, ativo, nome.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const PAPEIS = ["admin", "operador"];
const BAN_INATIVO = "876000h"; // ~100 anos

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}
const erro = (msg: string, status = 400) => json({ error: msg }, status);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: uErr } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (uErr || !u?.user) return erro("não autenticado", 401);
    const eu = u.user.id;

    const admin = createClient(url, service);
    const { data: meuPerfil } = await admin.from("perfis").select("papel,ativo").eq("id", eu).single();
    if (!meuPerfil || meuPerfil.papel !== "admin" || meuPerfil.ativo === false) return erro("acesso restrito a admin", 403);

    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao || "");

    async function outrosAdminsAtivos(excetoId: string) {
      const { count } = await admin.from("perfis").select("id", { count: "exact", head: true })
        .eq("papel", "admin").eq("ativo", true).neq("id", excetoId);
      return count || 0;
    }

    if (acao === "listar") {
      const { data: perfis, error } = await admin.from("perfis").select("id,nome,papel,ativo,criado_em").order("nome");
      if (error) return erro(error.message, 500);
      const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const porId: Record<string, any> = {};
      (lista?.users || []).forEach((x: any) => { porId[x.id] = x; });
      return json({
        eu,
        usuarios: (perfis || []).map((p: any) => ({
          ...p,
          email: porId[p.id]?.email || "",
          ultimo_acesso: porId[p.id]?.last_sign_in_at || null,
        })),
      });
    }

    if (acao === "criar") {
      const nome = String(body.nome || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const senha = String(body.senha || "");
      const papel = String(body.papel || "operador");
      if (nome.length < 2) return erro("Informe o nome.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro("E-mail inválido.");
      if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.");
      if (!PAPEIS.includes(papel)) return erro("Papel inválido.");
      const { data: criado, error } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true, user_metadata: { nome, papel },
      });
      if (error || !criado?.user) {
        const m = (error?.message || "").toLowerCase();
        return erro(m.includes("already") || m.includes("registered") ? "Já existe um login com esse e-mail." : "Não foi possível criar: " + (error?.message || ""));
      }
      // o gatilho lidar_novo_usuario cria o perfil; garante nome/papel/ativo
      await admin.from("perfis").upsert({ id: criado.user.id, nome, papel, ativo: true });
      return json({ ok: true, id: criado.user.id });
    }

    const id = String(body.id || "");
    if (!id) return erro("Usuário não informado.");
    const { data: alvo } = await admin.from("perfis").select("id,papel,ativo").eq("id", id).maybeSingle();
    if (!alvo) return erro("Usuário não encontrado.", 404);

    if (acao === "senha") {
      const senha = String(body.senha || "");
      if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres.");
      const { error } = await admin.auth.admin.updateUserById(id, { password: senha });
      if (error) return erro("Não foi possível trocar a senha: " + error.message);
      return json({ ok: true });
    }

    if (acao === "nome") {
      const nome = String(body.nome || "").trim();
      if (nome.length < 2) return erro("Informe o nome.");
      const { error } = await admin.from("perfis").update({ nome }).eq("id", id);
      if (error) return erro(error.message, 500);
      await admin.auth.admin.updateUserById(id, { user_metadata: { nome } });
      return json({ ok: true });
    }

    if (acao === "papel") {
      const papel = String(body.papel || "");
      if (!PAPEIS.includes(papel)) return erro("Papel inválido.");
      if (id === eu) return erro("Você não pode mudar o seu próprio papel.");
      if (alvo.papel === "admin" && papel !== "admin" && alvo.ativo && (await outrosAdminsAtivos(id)) < 1) {
        return erro("Precisa sobrar pelo menos um admin ativo.");
      }
      const { error } = await admin.from("perfis").update({ papel }).eq("id", id);
      if (error) return erro(error.message, 500);
      return json({ ok: true });
    }

    if (acao === "ativo") {
      const ativo = !!body.ativo;
      if (id === eu && !ativo) return erro("Você não pode desativar o seu próprio login.");
      if (!ativo && alvo.papel === "admin" && (await outrosAdminsAtivos(id)) < 1) {
        return erro("Precisa sobrar pelo menos um admin ativo.");
      }
      const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : BAN_INATIVO });
      if (e1) return erro("Não foi possível " + (ativo ? "reativar" : "desativar") + ": " + e1.message);
      const { error: e2 } = await admin.from("perfis").update({ ativo }).eq("id", id);
      if (e2) return erro(e2.message, 500);
      return json({ ok: true });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    return erro(String(e), 500);
  }
});
