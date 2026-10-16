-- Filtro de canais da sincronização com o Olist (v8).
-- Só entra na fila o que é pedido de e-commerce para despachar. Vendas de balcão (loja física
-- vende pelo Olist), Retiradas (marcador RESERVA LOJA) e Full ficam fora. O que ficar na dúvida
-- vai para a lista "A revisar" do admin.
-- Regras ajustáveis em config_wms.sync_regras (JSON):
--   situacoes          situações do Olist que pedem separação (texto em minúsculas)
--   excluir_marcadores marcadores que tiram o pedido do WMS
--   excluir_clientes   nomes de cliente que indicam venda de balcão
--   excluir_envio      palavras na forma de envio / transportadora / marcadores que tiram o pedido (Full)
--   sem_canal          'revisar' (padrão) ou 'fila' (entra como canal "outro") quando o pedido tem
--                      número de e-commerce mas o Olist não diz de qual canal veio

insert into public.config_wms (chave, valor) values ('sync_regras', jsonb_build_object(
  'situacoes', jsonb_build_array('aprovado', 'preparando envio', 'faturado', 'pronto para envio'),
  'excluir_marcadores', jsonb_build_array('reserva loja'),
  'excluir_clientes', jsonb_build_array('cliente balcão', 'cliente balcao', 'consumidor final'),
  'excluir_envio', jsonb_build_array('full', 'fulfillment'),
  'sem_canal', 'revisar'
)::text)
on conflict (chave) do nothing;

-- Pedidos do Olist que NÃO entraram direto na fila (dúvida ou regra), para não reavaliar a cada 5 min
create table if not exists public.sync_triagem (
  olist_id        text primary key,
  numero          text,
  numero_ecommerce text,
  cliente         text,
  situacao        text,
  canal_sugerido  text,
  motivo          text not null,
  status          text not null check (status in ('revisar', 'ignorado_regra', 'ignorado_admin', 'importado_admin')),
  detectado_em    timestamptz not null default now(),
  decidido_por    uuid references public.perfis(id),
  decidido_em     timestamptz
);
create index if not exists sync_triagem_status_idx on public.sync_triagem (status, detectado_em desc);
alter table public.sync_triagem enable row level security;
create policy admin_le_triagem on public.sync_triagem for select to authenticated
  using (public.meu_papel() = 'admin');
create policy admin_ignora_triagem on public.sync_triagem for update to authenticated
  using (public.meu_papel() = 'admin')
  with check (public.meu_papel() = 'admin' and status in ('revisar', 'ignorado_admin'));

-- limpeza: triagem com mais de 30 dias (o Olist só é lido 7 dias para trás)
select cron.schedule('limpar-triagem', '40 6 * * *', $cron$
  delete from public.sync_triagem where detectado_em < now() - interval '30 days';
$cron$);
