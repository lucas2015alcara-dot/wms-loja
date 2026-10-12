-- Requisição do laboratório — parte 1: valores novos dos enums.
-- Fica numa migração separada porque o Postgres não deixa usar um valor de enum
-- na mesma transação em que ele foi criado.
alter type public.papel_usuario add value if not exists 'laboratorio';
alter type public.canal_venda add value if not exists 'laboratorio';
alter type public.status_pedido add value if not exists 'pronto_lab';
alter type public.status_pedido add value if not exists 'entregue_lab';
