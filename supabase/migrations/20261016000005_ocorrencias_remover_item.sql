-- WMS Pilchs — Ocorrências, fase 3 (parte 2)
-- Envio parcial com 0 unidades: tira o item inteiro do pedido.
-- Só é chamada de dentro de resolver_ocorrencia (admin, cliente autorizou); ninguém chama direto.
create or replace function public.ocorrencia_remover_item(p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.meu_papel() is distinct from 'admin' then raise exception 'apenas_admin'; end if;
  delete from itens_pedido where id = p_item_id;
end $$;
revoke execute on function public.ocorrencia_remover_item(uuid) from public, anon, authenticated;
