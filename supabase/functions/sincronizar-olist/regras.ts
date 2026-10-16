// Regras de triagem: decide se um pedido do Olist entra na fila do WMS.
// Sem dependências (dá para testar fora do Supabase).

export type Regras = {
  situacoes: string[];
  excluir_marcadores: string[];
  excluir_clientes: string[];
  excluir_envio: string[];
  sem_canal: "revisar" | "fila";
  dias?: number;
};

export const REGRAS_PADRAO: Regras = {
  situacoes: ["aprovado", "preparando envio", "faturado", "pronto para envio"],
  excluir_marcadores: ["reserva loja"],
  excluir_clientes: ["cliente balcão", "cliente balcao", "consumidor final"],
  excluir_envio: ["full", "fulfillment"],
  sem_canal: "revisar",
  dias: 7,
};

export function lerRegras(txt: string | null | undefined): Regras {
  try {
    const r = JSON.parse(txt || "{}");
    const lista = (v: unknown, padrao: string[]) =>
      Array.isArray(v) ? v.map((x) => String(x).toLowerCase().trim()).filter(Boolean) : padrao;
    return {
      situacoes: lista(r.situacoes, REGRAS_PADRAO.situacoes),
      excluir_marcadores: lista(r.excluir_marcadores, REGRAS_PADRAO.excluir_marcadores),
      excluir_clientes: lista(r.excluir_clientes, REGRAS_PADRAO.excluir_clientes),
      excluir_envio: lista(r.excluir_envio, REGRAS_PADRAO.excluir_envio),
      sem_canal: r.sem_canal === "fila" ? "fila" : "revisar",
      dias: Math.min(30, Math.max(1, Number(r.dias) || 7)),
    };
  } catch {
    return { ...REGRAS_PADRAO };
  }
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// 1ª peneira, só com o que vem na pesquisa (sem gastar chamada ao Olist)
// devolve null se pode seguir, ou o motivo de ficar fora (sem registrar: pode mudar depois)
export function triagemPesquisa(p: any, regras: Regras): string | null {
  const sit = norm(p?.situacao);
  if (!regras.situacoes.map(norm).includes(sit)) return "situacao";
  if (!String(p?.numero_ecommerce ?? "").trim()) return "balcao";
  return null;
}

// canal a partir do nome do e-commerce que o Olist informa
export function canalDoEcommerce(nome: unknown): string | null {
  const n = norm(nome);
  if (!n) return null;
  if (n.includes("mercado")) return "mercado_livre";
  if (n.includes("shopee")) return "shopee";
  return "site_proprio";
}

export type Decisao =
  | { acao: "importar"; canal: string }
  | { acao: "ignorar"; motivo: string; canal: string | null }
  | { acao: "revisar"; motivo: string; canal: string | null };

// 2ª peneira, com o pedido completo (pedido.obter)
export function triagemDetalhe(d: any, regras: Regras): Decisao {
  const marcadores = (d?.marcadores || []).map((m: any) => norm(m?.marcador?.descricao ?? m?.descricao));
  const canal = canalDoEcommerce(d?.ecommerce?.nomeEcommerce);

  const marc = regras.excluir_marcadores.map(norm).find((x) => marcadores.some((m: string) => m.includes(x)));
  if (marc) return { acao: "ignorar", motivo: `marcador "${marc}" (retirada/venda da loja)`, canal };

  const cliente = norm(d?.cliente?.nome);
  const cli = regras.excluir_clientes.map(norm).find((x) => cliente === x || cliente.startsWith(x));
  if (cli) return { acao: "ignorar", motivo: `cliente "${d?.cliente?.nome}" (venda de balcão)`, canal };

  const envio = [d?.forma_frete, d?.nome_transportador, d?.forma_envio_descricao, ...marcadores].map(norm).join(" | ");
  const env = regras.excluir_envio.map(norm).find((x) => new RegExp(`\\b${x}\\b`).test(envio));
  if (env) return { acao: "ignorar", motivo: `envio "${env}" (sai do estoque do marketplace)`, canal };

  if (canal) return { acao: "importar", canal };
  if (regras.sem_canal === "fila") return { acao: "importar", canal: "outro" };
  return { acao: "revisar", motivo: "tem número de pedido, mas o Olist não diz de qual canal veio", canal: null };
}
