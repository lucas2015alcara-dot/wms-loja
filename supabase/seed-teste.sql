-- Dados de mentira para o ambiente de TESTE (wms-teste). NUNCA rodar na produção.
-- Pode rodar de novo quando quiser "zerar" o teste: apaga pedidos e repõe o estoque.

delete from public.alertas_estoque;
delete from public.eventos_tarefa;
delete from public.itens_pedido;
delete from public.devolucoes;
delete from public.pedidos;

insert into public.produtos (sku, nome) values
  ('0653969769473', 'Fan'),
  ('760532363614', 'kit fan'),
  ('6933412796220', 'ACESSORIO GPU VERTICAL DEEPCOOL PARA PLACA DE VIDEO ST500 AR'),
  ('023717', 'Adaptador USB Bluetooth Dongle CSR 4.0 /N'),
  ('6935364083830', 'Adaptador USB TP-Link Archer T3U MINI AC1300 Wireless Dual B'),
  ('4710483933387', 'Placa de vídeo')
on conflict (sku) do nothing;

insert into public.enderecos (codigo) values ('TESTE'), ('Rua 01 - PP3 - A2'), ('Rua 01 - PP4 - A2')
on conflict (codigo) do nothing;

insert into public.estoque_enderecos (produto_id, endereco_id, quantidade)
select p.id, e.id, 999 from public.produtos p, public.enderecos e where e.codigo = 'TESTE'
on conflict (produto_id, endereco_id) do update set quantidade = 999, atualizado_em = now();

-- 6 pedidos de exemplo: TST-001..003 = 1 Fan · TST-004 = Fan + kit fan · TST-005 = 3 kit fan · TST-006 = placa + adaptador
with novos as (
  insert into public.pedidos (id_externo, canal, status) values
    ('TST-001', 'mercado_livre', 'a_separar'), ('TST-002', 'mercado_livre', 'a_separar'),
    ('TST-003', 'shopee', 'a_separar'), ('TST-004', 'mercado_livre', 'a_separar'),
    ('TST-005', 'site_proprio', 'a_separar'), ('TST-006', 'mercado_livre', 'a_separar')
  returning id, id_externo
)
insert into public.itens_pedido (pedido_id, produto_id, qtd)
select n.id, p.id, x.qtd
from novos n
join (values
  ('TST-001', '0653969769473', 1), ('TST-002', '0653969769473', 1), ('TST-003', '0653969769473', 1),
  ('TST-004', '0653969769473', 1), ('TST-004', '760532363614', 1),
  ('TST-005', '760532363614', 3),
  ('TST-006', '4710483933387', 1), ('TST-006', '023717', 1)
) as x(pedido, sku, qtd) on x.pedido = n.id_externo
join public.produtos p on p.sku = x.sku;
