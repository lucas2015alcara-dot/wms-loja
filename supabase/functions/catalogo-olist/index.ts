import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Catálogo da loja: busca produtos no Olist (API v2) — SÓ LEITURA.
// Entrada: { termo }  →  { produtos: [{ id, codigo, nome, preco, foto, fotos, saldos: {avulsas, vitrine, kits}, depositos }] }
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const API = "https://api.tiny.com.br/api2";
const MAX = 10;                       // produtos por busca (cada um custa 1–2 consultas no Olist)
const CACHE_HORAS = 24;               // nome/preço/fotos guardados por 24h; saldo é sempre na hora
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

class Bloqueado extends Error {}

async function tiny(metodo: string, token: string, params: Record<string, string>) {
  const body = new URLSearchParams({ token, formato: "json", ...params });
  const r = await fetch(`${API}/${metodo}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j = await r.json().catch(() => ({}));
  const ret = j?.retorno ?? {};
  if (String(ret.codigo_erro) === "6") throw new Bloqueado("limite de consultas do Olist atingido");
  return ret;
}

// roda tarefas com no máximo N ao mesmo tempo (para não estourar o limite do Olist)
async function emLotes<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; out[k] = await fn(itens[k]); }
  }));
  return out;
}

function grupo(nomeDeposito: string) {
  const n = nomeDeposito.toLowerCase();
  if (n.includes("vitrine")) return "vitrine";
  if (n.includes("avulsa")) return "avulsas";
  if (n.includes("kit") || n.includes("combo")) return "kits";
  return "";
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

    const { termo } = await req.json().catch(() => ({}));
    const busca = String(termo || "").trim();
    if (busca.length < 2) return json({ error: "Digite pelo menos 2 letras ou o código." }, 400);

    const { data: cfg } = await admin.from("config_secretos").select("valor").eq("chave", "olist_token").maybeSingle();
    const token = cfg?.valor;
    if (!token) return json({ error: "token do Olist não configurado" }, 500);

    // 1) pesquisa (nome, código ou GTIN), só ativos
    let rp = await tiny("produtos.pesquisa.php", token, { pesquisa: busca, situacao: "A" });
    // código de barras: o Olist pode ter salvo com ou sem o zero à esquerda
    if (rp.status !== "OK" && /^\d{8,14}$/.test(busca)) {
      const alt = busca.startsWith("0") ? busca.replace(/^0+/, "") : "0" + busca;
      rp = await tiny("produtos.pesquisa.php", token, { pesquisa: alt, situacao: "A" });
    }
    if (rp.status !== "OK") return json({ produtos: [], total: 0 });
    const todos = (rp.produtos || []).map((x: any) => x.produto);
    const lista = todos.slice(0, MAX);
    const ids = lista.map((p: any) => String(p.id));

    // 2) nome/preço/fotos: cache de 24h, senão produto.obter
    const { data: cache } = await admin.from("catalogo_cache").select("*").in("olist_id", ids);
    const porId: Record<string, any> = {};
    const limite = Date.now() - CACHE_HORAS * 3600 * 1000;
    (cache || []).forEach((c: any) => { if (new Date(c.atualizado_em).getTime() > limite) porId[c.olist_id] = c; });

    const faltam = ids.filter((id: string) => !porId[id]);
    const novos = await emLotes(faltam, 3, async (id: string) => {
      const r = await tiny("produto.obter.php", token, { id });
      const p = r?.produto;
      if (!p) return null;
      const fotos = [
        ...(p.anexos || []).map((a: any) => a.anexo),
        ...(p.imagens_externas || []).map((a: any) => a.imagem_externa?.url || a.url),
      ].filter((f: any) => typeof f === "string" && /^https:\/\//.test(f));
      return {
        olist_id: id, codigo: p.codigo || "", nome: String(p.nome || "").trim(),
        preco: Number(p.preco) || 0, preco_promocional: Number(p.preco_promocional) || 0,
        unidade: p.unidade || "", foto: fotos[0] || null, fotos, atualizado_em: new Date().toISOString(),
      };
    });
    const validos = novos.filter(Boolean) as any[];
    if (validos.length) await admin.from("catalogo_cache").upsert(validos);
    validos.forEach((c) => { porId[c.olist_id] = c; });

    // 3) saldo por depósito — sempre na hora
    const estoques = await emLotes(ids, 3, async (id: string) => {
      const r = await tiny("produto.obter.estoque.php", token, { id });
      return (r?.produto?.depositos || []).map((d: any) => d.deposito);
    });

    const produtos = lista.map((p: any, k: number) => {
      const c = porId[String(p.id)] || {};
      const deps = (estoques[k] || []).filter((d: any) => d && d.desconsiderar !== "S");
      const saldos: Record<string, number> = { avulsas: 0, vitrine: 0, kits: 0 };
      deps.forEach((d: any) => { const g = grupo(String(d.nome || "")); if (g) saldos[g] += Number(d.saldo) || 0; });
      return {
        id: String(p.id),
        codigo: c.codigo ?? p.codigo ?? "",
        nome: String(c.nome || p.nome || "").trim(),
        preco: Number(c.preco ?? p.preco) || 0,
        preco_promocional: Number(c.preco_promocional ?? p.preco_promocional) || 0,
        foto: c.foto || null,
        fotos: c.fotos || [],
        saldos,
        depositos: deps.map((d: any) => ({ nome: d.nome, saldo: Number(d.saldo) || 0 })),
      };
    });
    return json({ produtos, total: todos.length, mais: todos.length > MAX || Number(rp.numero_paginas) > 1 });
  } catch (e) {
    if (e instanceof Bloqueado) return json({ error: "O Olist pediu uma pausa (muitas consultas seguidas). Tente de novo em 1 minuto." }, 429);
    return json({ error: String(e) }, 500);
  }
});
