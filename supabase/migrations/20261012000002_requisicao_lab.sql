-- Requisição de peças do laboratório (LAB 01, LAB 02...).
-- Fluxo: lab pede → vira pedido canal 'laboratorio' na fila de separação (com prioridade)
-- → cada unidade bipada gera uma transferência Vendas Avulsas → Kits no registro lab_transferencias
-- → separação completa = 'pronto_lab' → lab confirma o recebimento = 'entregue_lab'.
-- A integração com o Olist fica DESLIGADA (config_wms.lab_integracao_olist = 'desligada'):
-- as transferências ficam "aguardando_manual" e o admin marca quando fizer no Olist.
-- Depende de 20261012000001_requisicao_lab_enums.sql (valores novos dos enums).

create sequence if not exists public.lab_numero_seq;

create table if not exists public.lab_requisicoes (
  pedido_id   uuid primary key references public.pedidos(id) on delete cascade,
  numero      integer not null unique,
  solicitante uuid references public.perfis(id),
  montagem    text,
  criado_em   timestamptz not null default now(),
  pronto_em   timestamptz,
  pronto_por  uuid references public.perfis(id),
  recebido_em timestamptz,
  recebido_por uuid references public.perfis(id)
);

create table if not exists public.lab_transferencias (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references public.pedidos(id) on delete cascade,
  item_id       uuid references public.itens_pedido(id) on delete set null,
  produto_id    uuid not null references public.produtos(id),
  quantidade    integer not null check (quantidade > 0),
  origem        text not null,
  destino       text not null,
  status        text not null default 'aguardando_manual'
                check (status in ('aguardando_manual','aguardando_api','feita_api','feita_manual','erro')),
  tentativas    integer not null default 0,
  erro          text,
  criado_em     timestamptz not null default now(),
  criado_por    uuid references public.perfis(id),
  concluido_em  timestamptz,
  concluido_por uuid references public.perfis(id)
);
create index if not exists lab_transferencias_pedido_idx on public.lab_transferencias(pedido_id);
create index if not exists lab_transferencias_status_idx on public.lab_transferencias(status);

alter table public.lab_requisicoes enable row level security;
alter table public.lab_transferencias enable row level security;

-- leitura: qualquer login ativo vê as requisições (o separador precisa ver "para qual montagem")
create policy ler_lab_requisicoes on public.lab_requisicoes for select to authenticated
  using (public.meu_papel() is not null);
-- transferências: admin e laboratório
create policy ler_lab_transferencias on public.lab_transferencias for select to authenticated
  using (public.meu_papel() in ('admin','laboratorio'));
-- (sem insert/update direto: tudo pelas funções abaixo)

-- o laboratório enxerga só os pedidos do laboratório
create policy lab_ve_pedidos_lab on public.pedidos for select to authenticated
  using (public.meu_papel() = 'laboratorio' and canal = 'laboratorio');
create policy lab_ve_itens_lab on public.itens_pedido for select to authenticated
  using (public.meu_papel() = 'laboratorio' and exists (
    select 1 from public.pedidos p where p.id = itens_pedido.pedido_id and p.canal = 'laboratorio'));

-- configuração (integração desligada)
insert into public.config_wms (chave, valor) values
  ('lab_integracao_olist', 'desligada'),
  ('lab_deposito_origem', 'Vendas Avulsas'),
  ('lab_deposito_destino', 'Kits e PCs montados')
on conflict (chave) do nothing;

-- ---------- criar requisição ----------
create or replace function public.lab_criar_requisicao(p_itens jsonb, p_montagem text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_num integer;
  v_codigo text;
  v_pedido uuid;
  v_it record;
  v_qtd_itens integer := 0;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  if public.meu_papel() is null or public.meu_papel() not in ('laboratorio','admin') then raise exception 'sem_permissao'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'sem_itens'; end if;
  if jsonb_array_length(p_itens) > 100 then raise exception 'itens_demais'; end if;

  v_num := nextval('public.lab_numero_seq');
  v_codigo := 'LAB ' || lpad(v_num::text, 2, '0');
  insert into public.pedidos (id_externo, canal, status) values (v_codigo, 'laboratorio', 'a_separar') returning id into v_pedido;

  for v_it in
    select (e->>'produto_id')::uuid as produto_id, sum(greatest(coalesce((e->>'qtd')::int, 0), 0))::int as qtd
      from jsonb_array_elements(p_itens) e group by 1
  loop
    if v_it.qtd <= 0 or v_it.qtd > 999 then raise exception 'quantidade_invalida'; end if;
    if not exists (select 1 from public.produtos where id = v_it.produto_id) then raise exception 'produto_invalido'; end if;
    insert into public.itens_pedido (pedido_id, produto_id, qtd) values (v_pedido, v_it.produto_id, v_it.qtd);
    v_qtd_itens := v_qtd_itens + 1;
  end loop;

  insert into public.lab_requisicoes (pedido_id, numero, solicitante, montagem)
  values (v_pedido, v_num, v_uid, nullif(left(trim(coalesce(p_montagem, '')), 200), ''));

  return jsonb_build_object('pedido_id', v_pedido, 'id_externo', v_codigo, 'itens', v_qtd_itens);
end $$;

-- ---------- lab cancela a própria requisição (só se nada foi separado ainda) ----------
create or replace function public.lab_cancelar_requisicao(p_pedido_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped record;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if public.meu_papel() is null or public.meu_papel() not in ('laboratorio','admin') then raise exception 'sem_permissao'; end if;
  select * into v_ped from public.pedidos where id = p_pedido_id for update;
  if not found or v_ped.canal <> 'laboratorio' then raise exception 'requisicao_nao_encontrada'; end if;
  if v_ped.status <> 'a_separar' then raise exception 'ja_em_andamento'; end if;
  if exists (select 1 from public.itens_pedido where pedido_id = p_pedido_id and qtd_separada > 0) then raise exception 'ja_em_andamento'; end if;
  update public.pedidos set status = 'cancelado', status_antes_cancelar = v_ped.status, cancelado_em = now(),
    cancelado_por = auth.uid(), motivo_cancelamento = 'Cancelada pelo laboratório', reservado_por = null, reservado_em = null
   where id = p_pedido_id;
end $$;

-- ---------- separação concluída → pronto para o laboratório ----------
create or replace function public.lab_concluir_separacao(p_pedido_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped record;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if public.meu_papel() is null or public.meu_papel() not in ('admin','operador','separador') then raise exception 'sem_permissao'; end if;
  select * into v_ped from public.pedidos where id = p_pedido_id for update;
  if not found or v_ped.canal <> 'laboratorio' then raise exception 'requisicao_nao_encontrada'; end if;
  if v_ped.status <> 'a_separar' then raise exception 'status_invalido'; end if;
  if exists (select 1 from public.itens_pedido where pedido_id = p_pedido_id and qtd_separada < qtd) then raise exception 'separacao_incompleta'; end if;
  update public.pedidos set status = 'pronto_lab', reservado_por = null, reservado_em = null where id = p_pedido_id;
  update public.lab_requisicoes set pronto_em = now(), pronto_por = auth.uid() where pedido_id = p_pedido_id;
end $$;

-- ---------- laboratório confirma o recebimento ----------
create or replace function public.lab_confirmar_recebimento(p_pedido_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ped record;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if public.meu_papel() is null or public.meu_papel() not in ('laboratorio','admin') then raise exception 'sem_permissao'; end if;
  select * into v_ped from public.pedidos where id = p_pedido_id for update;
  if not found or v_ped.canal <> 'laboratorio' then raise exception 'requisicao_nao_encontrada'; end if;
  if v_ped.status <> 'pronto_lab' then raise exception 'ainda_nao_separada'; end if;
  update public.pedidos set status = 'entregue_lab' where id = p_pedido_id;
  update public.lab_requisicoes set recebido_em = now(), recebido_por = auth.uid() where pedido_id = p_pedido_id;
end $$;

-- ---------- admin marca transferências feitas à mão no Olist ----------
create or replace function public.lab_marcar_transferencias(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if public.meu_papel() is distinct from 'admin' then raise exception 'apenas_admin'; end if;
  update public.lab_transferencias set status = 'feita_manual', concluido_em = now(), concluido_por = auth.uid()
   where id = any(p_ids) and status in ('aguardando_manual','erro');
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------- gatilho: cada unidade bipada vira uma transferência ----------
create or replace function public.lab_registrar_transferencia()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_canal public.canal_venda;
  v_status text;
  v_origem text;
  v_destino text;
  v_delta integer;
begin
  v_delta := coalesce(new.qtd_separada, 0) - coalesce(old.qtd_separada, 0);
  if v_delta = 0 then return new; end if;
  select canal into v_canal from public.pedidos where id = new.pedido_id;
  if v_canal is distinct from 'laboratorio' then return new; end if;

  v_status := case when (select valor from public.config_wms where chave = 'lab_integracao_olist') = 'ligada'
                   then 'aguardando_api' else 'aguardando_manual' end;
  v_origem  := coalesce((select valor from public.config_wms where chave = 'lab_deposito_origem'), 'Vendas Avulsas');
  v_destino := coalesce((select valor from public.config_wms where chave = 'lab_deposito_destino'), 'Kits e PCs montados');

  if v_delta > 0 then
    insert into public.lab_transferencias (pedido_id, item_id, produto_id, quantidade, origem, destino, status, criado_por)
    values (new.pedido_id, new.id, new.produto_id, v_delta, v_origem, v_destino, v_status, auth.uid());
  else
    -- bipagem desfeita: transferência de volta
    insert into public.lab_transferencias (pedido_id, item_id, produto_id, quantidade, origem, destino, status, criado_por)
    values (new.pedido_id, new.id, new.produto_id, -v_delta, v_destino, v_origem, v_status, auth.uid());
  end if;
  return new;
end $$;

create trigger lab_transferencia_ao_separar
  after update of qtd_separada on public.itens_pedido
  for each row execute function public.lab_registrar_transferencia();

-- ---------- gatilho: requisição cancelada com peças já transferidas → volta para Avulsas ----------
create or replace function public.lab_estornar_ao_cancelar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_origem text;
  v_destino text;
begin
  if new.canal is distinct from 'laboratorio' or new.status <> 'cancelado' or old.status = 'cancelado' then return new; end if;
  v_status := case when (select valor from public.config_wms where chave = 'lab_integracao_olist') = 'ligada'
                   then 'aguardando_api' else 'aguardando_manual' end;
  v_origem  := coalesce((select valor from public.config_wms where chave = 'lab_deposito_origem'), 'Vendas Avulsas');
  v_destino := coalesce((select valor from public.config_wms where chave = 'lab_deposito_destino'), 'Kits e PCs montados');
  insert into public.lab_transferencias (pedido_id, item_id, produto_id, quantidade, origem, destino, status, criado_por)
  select new.id, i.id, i.produto_id, i.qtd_separada, v_destino, v_origem, v_status, auth.uid()
    from public.itens_pedido i where i.pedido_id = new.id and i.qtd_separada > 0;
  return new;
end $$;

create trigger lab_estorno_cancelamento
  after update of status on public.pedidos
  for each row execute function public.lab_estornar_ao_cancelar();

-- ---------- contagem para o painel e o telão (só números) ----------
create or replace function public.contagem_lab()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'a_separar', (select count(*) from pedidos where canal = 'laboratorio' and status = 'a_separar'),
    'pronto',    (select count(*) from pedidos where canal = 'laboratorio' and status = 'pronto_lab'),
    'transf_pendentes', (select count(*) from lab_transferencias where status in ('aguardando_manual','aguardando_api','erro'))
  );
$$;

-- funções de gatilho não são chamadas direto
revoke execute on function public.lab_registrar_transferencia() from public, anon, authenticated;
revoke execute on function public.lab_estornar_ao_cancelar() from public, anon, authenticated;
-- as demais exigem login (o telão usa só contagem_lab)
revoke execute on function public.lab_criar_requisicao(jsonb, text) from public, anon;
revoke execute on function public.lab_cancelar_requisicao(uuid) from public, anon;
revoke execute on function public.lab_concluir_separacao(uuid) from public, anon;
revoke execute on function public.lab_confirmar_recebimento(uuid) from public, anon;
revoke execute on function public.lab_marcar_transferencias(uuid[]) from public, anon;
grant execute on function public.lab_criar_requisicao(jsonb, text) to authenticated;
grant execute on function public.lab_cancelar_requisicao(uuid) to authenticated;
grant execute on function public.lab_concluir_separacao(uuid) to authenticated;
grant execute on function public.lab_confirmar_recebimento(uuid) to authenticated;
grant execute on function public.lab_marcar_transferencias(uuid[]) to authenticated;
