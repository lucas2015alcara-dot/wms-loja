-- =====================================================================
-- WMS Pilchs — FOTO COMPLETA DO BANCO em 10/10/2026
-- Gerada a partir do projeto de produção (wms-separacao). Recria do zero:
-- tipos, tabelas, regras, índices, funções, gatilhos, permissões (RLS) e agendamento.
-- NÃO contém dados nem segredos. Usada para montar o ambiente de TESTE.
-- O histórico antigo (31 migrations de 25/09 a 08/10) continua guardado no Supabase de produção.
-- Mudanças novas no banco: criar um arquivo NOVO nesta pasta (nunca editar este).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------- tipos
create type public.canal_venda as enum ('mercado_livre','shopee','olist','site_proprio','outro');
create type public.motivo_devolucao as enum ('defeito','arrependimento','item_errado','outro');
create type public.papel_usuario as enum ('admin','separador','embalador','expedicao','operador');
create type public.status_devolucao as enum ('pendente','aprovada_estoque','aprovada_descarte','rejeitada');
create type public.status_pedido as enum ('a_separar','separado','embalado','expedido','cancelado');
create type public.tipo_evento as enum ('separacao','embalagem');

-- ---------------------------------------------------------------- tabelas
create table public.perfis (
  id uuid not null,
  nome text not null,
  papel papel_usuario not null,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null
);

create table public.produtos (
  id uuid default gen_random_uuid() not null,
  sku text not null,
  nome text not null,
  localizacao_rua text,
  localizacao_posicao text,
  criado_em timestamp with time zone default now() not null
);

create table public.pedidos (
  id uuid default gen_random_uuid() not null,
  id_externo text not null,
  canal canal_venda default 'outro'::canal_venda not null,
  status status_pedido default 'a_separar'::status_pedido not null,
  criado_em timestamp with time zone default now() not null,
  reservado_por uuid,
  reservado_em timestamp with time zone,
  expedido_em timestamp with time zone,
  cancelado_em timestamp with time zone,
  cancelado_por uuid,
  motivo_cancelamento text,
  status_antes_cancelar status_pedido,
  olist_id text,
  expedido_manual_por uuid,
  expedido_manual_motivo text
);

create table public.itens_pedido (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid not null,
  produto_id uuid not null,
  qtd integer not null,
  qtd_separada integer default 0 not null,
  qtd_embalada integer default 0 not null
);

create table public.eventos_tarefa (
  id uuid default gen_random_uuid() not null,
  usuario_id uuid not null,
  item_id uuid not null,
  tipo tipo_evento not null,
  iniciado_em timestamp with time zone default now() not null,
  finalizado_em timestamp with time zone
);

create table public.alertas_estoque (
  id uuid default gen_random_uuid() not null,
  item_id uuid not null,
  reportado_por uuid not null,
  resolvido boolean default false not null,
  criado_em timestamp with time zone default now() not null,
  origem text default 'separacao'::text not null
);

create table public.config_secretos (
  chave text not null,
  valor text not null,
  atualizado_em timestamp with time zone default now() not null
);

create table public.enderecos (
  id uuid default gen_random_uuid() not null,
  codigo text not null,
  ativo boolean default true not null,
  criado_em timestamp with time zone default now() not null
);

create table public.estoque_enderecos (
  id uuid default gen_random_uuid() not null,
  produto_id uuid not null,
  endereco_id uuid not null,
  quantidade integer default 0 not null,
  atualizado_em timestamp with time zone default now() not null
);

create table public.devolucoes (
  id uuid default gen_random_uuid() not null,
  pedido_id uuid,
  id_externo_pedido text,
  produto_id uuid not null,
  quantidade integer not null,
  motivo motivo_devolucao not null,
  motivo_obs text,
  status status_devolucao default 'pendente'::status_devolucao not null,
  endereco_destino_id uuid,
  registrado_por uuid,
  decidido_por uuid,
  criado_em timestamp with time zone default now() not null,
  decidido_em timestamp with time zone
);

create table public.olist_webhook_eventos (
  id uuid default gen_random_uuid() not null,
  recebido_em timestamp with time zone default now() not null,
  payload jsonb not null,
  processado boolean default false not null
);

create table public.inventario_contagens (
  id uuid default gen_random_uuid() not null,
  endereco_id uuid not null,
  produto_id uuid not null,
  qtd_sistema integer not null,
  qtd_contada integer not null,
  diferenca integer generated always as (qtd_contada - qtd_sistema) stored,
  usuario_id uuid,
  criado_em timestamp with time zone default now() not null
);

create table public.config_wms (
  chave text not null,
  valor text not null,
  atualizado_em timestamp with time zone default now() not null,
  atualizado_por uuid
);

create table public.catalogo_cache (
  olist_id text not null,
  codigo text,
  nome text,
  preco numeric,
  preco_promocional numeric,
  unidade text,
  foto text,
  fotos jsonb default '[]'::jsonb,
  atualizado_em timestamp with time zone default now() not null
);

create table public.retiradas_loja (
  id uuid default gen_random_uuid() not null,
  criado_em timestamp with time zone default now() not null,
  criado_por uuid,
  criado_por_nome text,
  vendedor_id text not null,
  vendedor_nome text not null,
  produto_id text not null,
  produto_codigo text,
  produto_nome text not null,
  quantidade numeric not null,
  valor_unitario numeric default 0 not null,
  deposito_id text not null,
  deposito_nome text not null,
  obs text,
  olist_pedido_id text,
  olist_pedido_numero text,
  status text default 'aberta'::text not null,
  erro text,
  fechado_em timestamp with time zone,
  fechado_por uuid,
  fechado_por_nome text
);

-- ---------------------------------------------------------------- chaves e regras
alter table public.alertas_estoque add constraint alertas_estoque_pkey PRIMARY KEY (id);
alter table public.catalogo_cache add constraint catalogo_cache_pkey PRIMARY KEY (olist_id);
alter table public.config_secretos add constraint config_secretos_pkey PRIMARY KEY (chave);
alter table public.config_wms add constraint config_wms_pkey PRIMARY KEY (chave);
alter table public.devolucoes add constraint devolucoes_pkey PRIMARY KEY (id);
alter table public.enderecos add constraint enderecos_pkey PRIMARY KEY (id);
alter table public.estoque_enderecos add constraint estoque_enderecos_pkey PRIMARY KEY (id);
alter table public.eventos_tarefa add constraint eventos_tarefa_pkey PRIMARY KEY (id);
alter table public.inventario_contagens add constraint inventario_contagens_pkey PRIMARY KEY (id);
alter table public.itens_pedido add constraint itens_pedido_pkey PRIMARY KEY (id);
alter table public.olist_webhook_eventos add constraint olist_webhook_eventos_pkey PRIMARY KEY (id);
alter table public.pedidos add constraint pedidos_pkey PRIMARY KEY (id);
alter table public.perfis add constraint perfis_pkey PRIMARY KEY (id);
alter table public.produtos add constraint produtos_pkey PRIMARY KEY (id);
alter table public.retiradas_loja add constraint retiradas_loja_pkey PRIMARY KEY (id);
alter table public.enderecos add constraint enderecos_codigo_key UNIQUE (codigo);
alter table public.estoque_enderecos add constraint estoque_enderecos_produto_id_endereco_id_key UNIQUE (produto_id, endereco_id);
alter table public.pedidos add constraint pedidos_canal_id_externo_key UNIQUE (canal, id_externo);
alter table public.produtos add constraint produtos_sku_key UNIQUE (sku);
alter table public.alertas_estoque add constraint alertas_estoque_origem_check CHECK ((origem = ANY (ARRAY['separacao'::text, 'embalagem'::text])));
alter table public.devolucoes add constraint devolucoes_quantidade_check CHECK ((quantidade > 0));
alter table public.estoque_enderecos add constraint estoque_enderecos_quantidade_check CHECK ((quantidade >= 0));
alter table public.itens_pedido add constraint itens_pedido_qtd_check CHECK ((qtd > 0));
alter table public.itens_pedido add constraint itens_pedido_qtd_embalada_check CHECK ((qtd_embalada >= 0));
alter table public.itens_pedido add constraint itens_pedido_qtd_separada_check CHECK ((qtd_separada >= 0));
alter table public.retiradas_loja add constraint retiradas_loja_quantidade_check CHECK ((quantidade > (0)::numeric));
alter table public.retiradas_loja add constraint retiradas_loja_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'vendida'::text, 'devolvida'::text, 'cancelada_olist'::text, 'erro'::text])));
alter table public.alertas_estoque add constraint alertas_estoque_item_id_fkey FOREIGN KEY (item_id) REFERENCES itens_pedido(id) ON DELETE CASCADE;
alter table public.alertas_estoque add constraint alertas_estoque_reportado_por_fkey FOREIGN KEY (reportado_por) REFERENCES perfis(id);
alter table public.config_wms add constraint config_wms_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES perfis(id);
alter table public.devolucoes add constraint devolucoes_decidido_por_fkey FOREIGN KEY (decidido_por) REFERENCES perfis(id);
alter table public.devolucoes add constraint devolucoes_endereco_destino_id_fkey FOREIGN KEY (endereco_destino_id) REFERENCES enderecos(id);
alter table public.devolucoes add constraint devolucoes_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id);
alter table public.devolucoes add constraint devolucoes_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id);
alter table public.devolucoes add constraint devolucoes_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES perfis(id);
alter table public.estoque_enderecos add constraint estoque_enderecos_endereco_id_fkey FOREIGN KEY (endereco_id) REFERENCES enderecos(id) ON DELETE CASCADE;
alter table public.estoque_enderecos add constraint estoque_enderecos_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE;
alter table public.eventos_tarefa add constraint eventos_tarefa_item_id_fkey FOREIGN KEY (item_id) REFERENCES itens_pedido(id) ON DELETE CASCADE;
alter table public.eventos_tarefa add constraint eventos_tarefa_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES perfis(id);
alter table public.inventario_contagens add constraint inventario_contagens_endereco_id_fkey FOREIGN KEY (endereco_id) REFERENCES enderecos(id);
alter table public.inventario_contagens add constraint inventario_contagens_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id);
alter table public.inventario_contagens add constraint inventario_contagens_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES perfis(id);
alter table public.itens_pedido add constraint itens_pedido_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE;
alter table public.itens_pedido add constraint itens_pedido_produto_id_fkey FOREIGN KEY (produto_id) REFERENCES produtos(id);
alter table public.pedidos add constraint pedidos_cancelado_por_fkey FOREIGN KEY (cancelado_por) REFERENCES perfis(id);
alter table public.pedidos add constraint pedidos_expedido_manual_por_fkey FOREIGN KEY (expedido_manual_por) REFERENCES perfis(id);
alter table public.pedidos add constraint pedidos_reservado_por_fkey FOREIGN KEY (reservado_por) REFERENCES perfis(id);
alter table public.perfis add constraint perfis_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.retiradas_loja add constraint retiradas_loja_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);
alter table public.retiradas_loja add constraint retiradas_loja_fechado_por_fkey FOREIGN KEY (fechado_por) REFERENCES auth.users(id);

-- ---------------------------------------------------------------- índices
CREATE INDEX alertas_estoque_item_id_idx ON public.alertas_estoque USING btree (item_id);
CREATE INDEX alertas_estoque_reportado_por_idx ON public.alertas_estoque USING btree (reportado_por);
CREATE INDEX alertas_estoque_resolvido_idx ON public.alertas_estoque USING btree (resolvido);
CREATE INDEX eventos_tarefa_item_id_idx ON public.eventos_tarefa USING btree (item_id);
CREATE INDEX eventos_tarefa_usuario_id_idx ON public.eventos_tarefa USING btree (usuario_id);
CREATE INDEX idx_estoque_enderecos_endereco ON public.estoque_enderecos USING btree (endereco_id);
CREATE INDEX idx_estoque_enderecos_produto ON public.estoque_enderecos USING btree (produto_id);
CREATE INDEX itens_pedido_pedido_id_idx ON public.itens_pedido USING btree (pedido_id);
CREATE INDEX itens_pedido_produto_id_idx ON public.itens_pedido USING btree (produto_id);
CREATE INDEX pedidos_status_idx ON public.pedidos USING btree (status);
CREATE INDEX retiradas_loja_status_idx ON public.retiradas_loja USING btree (status, criado_em DESC);

-- ---------------------------------------------------------------- funções
CREATE OR REPLACE FUNCTION public.meu_papel()
 RETURNS papel_usuario
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select papel from perfis where id = auth.uid() and ativo is true
$function$
;

CREATE OR REPLACE FUNCTION public.enderecamento_ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select valor = 'true' from public.config_wms where chave = 'enderecamento_ativo'), true) $function$
;

CREATE OR REPLACE FUNCTION public.bipar_endereco_sku(p_produto_id uuid, p_endereco_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_qtd integer;
begin
  if (select auth.uid()) is null then
    raise exception 'nao_autenticado';
  end if;

  select quantidade into v_qtd
    from public.estoque_enderecos
    where produto_id = p_produto_id and endereco_id = p_endereco_id
    for update;

  if v_qtd is null or v_qtd <= 0 then
    raise exception 'sem_estoque_nesse_endereco';
  end if;

  update public.estoque_enderecos
    set quantidade = quantidade - 1, atualizado_em = now()
    where produto_id = p_produto_id and endereco_id = p_endereco_id;

  return v_qtd - 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cancelar_pedido(p_pedido_id uuid, p_motivo text, p_senha text, p_endereco_devolucao uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_ped record;
  v_separadas integer;
  v_it record;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  if public.meu_papel() is distinct from 'admin' then raise exception 'apenas_admin'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 3 then raise exception 'motivo_obrigatorio'; end if;
  if not exists (
    select 1 from auth.users u
     where u.id = v_uid and u.encrypted_password is not null
       and u.encrypted_password = extensions.crypt(coalesce(p_senha, ''), u.encrypted_password)
  ) then raise exception 'senha_incorreta'; end if;

  select * into v_ped from public.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'pedido_nao_encontrado'; end if;
  if v_ped.status = 'cancelado' then raise exception 'ja_cancelado'; end if;
  if v_ped.status = 'expedido' then raise exception 'ja_expedido'; end if;

  select coalesce(sum(greatest(qtd_separada, 0)), 0) into v_separadas from public.itens_pedido where pedido_id = p_pedido_id;

  if v_separadas > 0 and public.enderecamento_ativo() then
    if p_endereco_devolucao is null then raise exception 'informe_endereco_devolucao'; end if;
    if not exists (select 1 from public.enderecos where id = p_endereco_devolucao) then raise exception 'endereco_invalido'; end if;
    for v_it in select produto_id, sum(qtd_separada)::int q from public.itens_pedido
                 where pedido_id = p_pedido_id and qtd_separada > 0 group by produto_id
    loop
      insert into public.estoque_enderecos (produto_id, endereco_id, quantidade, atualizado_em)
      values (v_it.produto_id, p_endereco_devolucao, v_it.q, now())
      on conflict (produto_id, endereco_id)
      do update set quantidade = public.estoque_enderecos.quantidade + excluded.quantidade, atualizado_em = now();
    end loop;
  end if;

  update public.alertas_estoque a set resolvido = true
    from public.itens_pedido i where a.item_id = i.id and i.pedido_id = p_pedido_id and a.resolvido = false;

  update public.pedidos set status = 'cancelado', status_antes_cancelar = v_ped.status, cancelado_em = now(),
    cancelado_por = v_uid, motivo_cancelamento = trim(p_motivo), reservado_por = null, reservado_em = null
   where id = p_pedido_id;

  return jsonb_build_object('id_externo', v_ped.id_externo, 'status_anterior', v_ped.status,
    'unidades_devolvidas', case when public.enderecamento_ativo() then v_separadas else 0 end);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.contagem_expedidos_hoje()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*) from pedidos
  where status = 'expedido'
    and expedido_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$function$
;

CREATE OR REPLACE FUNCTION public.contagem_pedidos()
 RETURNS TABLE(status status_pedido, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select status, count(*) from pedidos group by status;
$function$
;

CREATE OR REPLACE FUNCTION public.contagem_pendencias()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*) from alertas_estoque where resolvido = false;
$function$
;

CREATE OR REPLACE FUNCTION public.decidir_devolucao(p_devolucao_id uuid, p_decisao status_devolucao, p_endereco_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_dev record;
begin
  if (select auth.uid()) is null then
    raise exception 'nao_autenticado';
  end if;

  if meu_papel() <> 'admin' then
    raise exception 'sem_permissao';
  end if;

  if p_decisao not in ('aprovada_estoque', 'aprovada_descarte', 'rejeitada') then
    raise exception 'decisao_invalida';
  end if;

  select * into v_dev from public.devolucoes where id = p_devolucao_id for update;
  if v_dev is null then
    raise exception 'devolucao_nao_encontrada';
  end if;
  if v_dev.status <> 'pendente' then
    raise exception 'devolucao_ja_decidida';
  end if;

  if p_decisao = 'aprovada_estoque' then
    if p_endereco_id is null then
      raise exception 'endereco_obrigatorio';
    end if;
    insert into public.estoque_enderecos (produto_id, endereco_id, quantidade)
      values (v_dev.produto_id, p_endereco_id, v_dev.quantidade)
      on conflict (produto_id, endereco_id)
      do update set quantidade = public.estoque_enderecos.quantidade + excluded.quantidade, atualizado_em = now();
  end if;

  update public.devolucoes
    set status = p_decisao, endereco_destino_id = p_endereco_id, decidido_por = auth.uid(), decidido_em = now()
    where id = p_devolucao_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.lidar_novo_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into perfis (id, nome, papel, ativo)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', new.email), 'operador', false)
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marcar_expedido_em()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'expedido' and (old.status is distinct from 'expedido') then
    new.expedido_em := now();
  elsif new.status <> 'expedido' then
    new.expedido_em := null;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_contagem_inventario(p_endereco_id uuid, p_produto_id uuid, p_qtd_contada integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_qtd_sistema integer;
begin
  if (select auth.uid()) is null then
    raise exception 'nao_autenticado';
  end if;
  if meu_papel() is null or meu_papel() not in ('admin','operador') then
    raise exception 'sem_permissao';
  end if;
  if p_qtd_contada < 0 then
    raise exception 'quantidade_invalida';
  end if;
  select quantidade into v_qtd_sistema
    from public.estoque_enderecos
    where produto_id = p_produto_id and endereco_id = p_endereco_id
    for update;
  if v_qtd_sistema is null then
    v_qtd_sistema := 0;
  end if;
  insert into public.estoque_enderecos (produto_id, endereco_id, quantidade)
    values (p_produto_id, p_endereco_id, p_qtd_contada)
    on conflict (produto_id, endereco_id)
    do update set quantidade = p_qtd_contada, atualizado_em = now();
  insert into public.inventario_contagens (endereco_id, produto_id, qtd_sistema, qtd_contada, usuario_id)
    values (p_endereco_id, p_produto_id, v_qtd_sistema, p_qtd_contada, auth.uid());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.situacao_pedido_por_codigo(p_codigo text)
 RETURNS TABLE(id_externo text, status text, expedido_em timestamp with time zone, cancelado_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id_externo, p.status::text, p.expedido_em, p.cancelado_em
  from pedidos p
  where exists (select 1 from perfis f where f.id = auth.uid() and coalesce(f.ativo, true))
    and (
      lower(p.id_externo) = lower(trim(p_codigo))
      or (trim(p_codigo) ~ '^[0-9]+$' and p.id_externo ~ '^[0-9]+$'
          and ltrim(p.id_externo, '0') = ltrim(trim(p_codigo), '0'))
    )
  order by p.criado_em desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.transferir_estoque(p_produto_id uuid, p_endereco_origem_id uuid, p_endereco_destino_id uuid, p_quantidade integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_qtd_origem integer;
begin
  if meu_papel() is null or meu_papel() not in ('admin','operador') then
    raise exception 'sem_permissao';
  end if;
  if p_quantidade <= 0 then
    raise exception 'quantidade_invalida';
  end if;
  if p_endereco_origem_id is not null then
    select quantidade into v_qtd_origem
      from public.estoque_enderecos
      where produto_id = p_produto_id and endereco_id = p_endereco_origem_id
      for update;
    if v_qtd_origem is null or v_qtd_origem < p_quantidade then
      raise exception 'estoque_insuficiente_na_origem';
    end if;
    update public.estoque_enderecos
      set quantidade = quantidade - p_quantidade, atualizado_em = now()
      where produto_id = p_produto_id and endereco_id = p_endereco_origem_id;
  end if;
  insert into public.estoque_enderecos (produto_id, endereco_id, quantidade)
    values (p_produto_id, p_endereco_destino_id, p_quantidade)
    on conflict (produto_id, endereco_id)
    do update set quantidade = public.estoque_enderecos.quantidade + excluded.quantidade, atualizado_em = now();
end;
$function$
;

-- ---------------------------------------------------------------- gatilhos
CREATE TRIGGER ao_criar_usuario AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.lidar_novo_usuario();
CREATE TRIGGER trg_marcar_expedido_em BEFORE UPDATE OF status ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.marcar_expedido_em();

-- ---------------------------------------------------------------- segurança por linha (RLS)
alter table public.alertas_estoque enable row level security;
alter table public.catalogo_cache enable row level security;
alter table public.config_secretos enable row level security;
alter table public.config_wms enable row level security;
alter table public.devolucoes enable row level security;
alter table public.enderecos enable row level security;
alter table public.estoque_enderecos enable row level security;
alter table public.eventos_tarefa enable row level security;
alter table public.inventario_contagens enable row level security;
alter table public.itens_pedido enable row level security;
alter table public.olist_webhook_eventos enable row level security;
alter table public.pedidos enable row level security;
alter table public.perfis enable row level security;
alter table public.produtos enable row level security;
alter table public.retiradas_loja enable row level security;

create policy admin_altera_config_wms on public.config_wms as permissive for all to public using ((meu_papel() = 'admin'::papel_usuario)) with check ((meu_papel() = 'admin'::papel_usuario));
create policy admin_edita_produtos on public.produtos as permissive for all to public using ((meu_papel() = 'admin'::papel_usuario));
create policy admin_gerencia_enderecos on public.enderecos as permissive for all to authenticated using ((meu_papel() = 'admin'::papel_usuario));
create policy admin_gerencia_estoque_enderecos on public.estoque_enderecos as permissive for all to authenticated using ((meu_papel() = 'admin'::papel_usuario));
create policy admin_gerencia_itens on public.itens_pedido as permissive for all to public using ((meu_papel() = 'admin'::papel_usuario));
create policy admin_gerencia_pedidos on public.pedidos as permissive for all to public using ((meu_papel() = 'admin'::papel_usuario));
create policy admin_gerencia_perfis on public.perfis as permissive for all to public using ((meu_papel() = 'admin'::papel_usuario));
create policy admin_le_contagens on public.inventario_contagens as permissive for select to public using ((meu_papel() = 'admin'::papel_usuario));
create policy admin_resolve_alertas on public.alertas_estoque as permissive for update to public using ((meu_papel() = 'admin'::papel_usuario));
create policy admin_ve_eventos_webhook on public.olist_webhook_eventos as permissive for select to authenticated using ((meu_papel() = 'admin'::papel_usuario));
create policy atualizar_proprios_eventos on public.eventos_tarefa as permissive for update to public using ((usuario_id = ( SELECT auth.uid() AS uid)));
create policy criar_alerta on public.alertas_estoque as permissive for insert to public with check ((reportado_por = ( SELECT auth.uid() AS uid)));
create policy criar_devolucao on public.devolucoes as permissive for insert to public with check ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy criar_proprios_eventos on public.eventos_tarefa as permissive for insert to public with check ((usuario_id = ( SELECT auth.uid() AS uid)));
create policy ler_config_wms on public.config_wms as permissive for select to public using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy ler_enderecos on public.enderecos as permissive for select to authenticated using (true);
create policy ler_estoque_enderecos on public.estoque_enderecos as permissive for select to authenticated using (true);
create policy ler_produtos on public.produtos as permissive for select to public using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy operacao_atualiza_itens on public.itens_pedido as permissive for update to public using ((EXISTS ( SELECT 1
   FROM pedidos p
  WHERE ((p.id = itens_pedido.pedido_id) AND ((meu_papel() = 'admin'::papel_usuario) OR ((meu_papel() = 'operador'::papel_usuario) AND (p.status = ANY (ARRAY['a_separar'::status_pedido, 'separado'::status_pedido, 'embalado'::status_pedido]))) OR ((meu_papel() = 'separador'::papel_usuario) AND (p.status = 'a_separar'::status_pedido)) OR ((meu_papel() = 'embalador'::papel_usuario) AND (p.status = 'separado'::status_pedido)) OR ((meu_papel() = 'expedicao'::papel_usuario) AND (p.status = 'embalado'::status_pedido)))))));
create policy operacao_atualiza_status on public.pedidos as permissive for update to public using ((((meu_papel() = 'operador'::papel_usuario) AND (status = ANY (ARRAY['a_separar'::status_pedido, 'separado'::status_pedido, 'embalado'::status_pedido]))) OR ((meu_papel() = 'separador'::papel_usuario) AND (status = 'a_separar'::status_pedido)) OR ((meu_papel() = 'embalador'::papel_usuario) AND (status = 'separado'::status_pedido)) OR ((meu_papel() = 'expedicao'::papel_usuario) AND (status = 'embalado'::status_pedido)))) with check ((status = ANY (ARRAY['a_separar'::status_pedido, 'separado'::status_pedido, 'embalado'::status_pedido, 'expedido'::status_pedido])));
create policy ver_alertas on public.alertas_estoque as permissive for select to public using (((reportado_por = ( SELECT auth.uid() AS uid)) OR (meu_papel() = 'admin'::papel_usuario)));
create policy ver_devolucoes on public.devolucoes as permissive for select to public using (((registrado_por = ( SELECT auth.uid() AS uid)) OR (meu_papel() = 'admin'::papel_usuario)));
create policy ver_itens_do_pedido_visivel on public.itens_pedido as permissive for select to public using ((EXISTS ( SELECT 1
   FROM pedidos p
  WHERE ((p.id = itens_pedido.pedido_id) AND ((meu_papel() = 'admin'::papel_usuario) OR ((meu_papel() = 'operador'::papel_usuario) AND (p.status = ANY (ARRAY['a_separar'::status_pedido, 'separado'::status_pedido, 'embalado'::status_pedido]))) OR ((meu_papel() = 'separador'::papel_usuario) AND (p.status = 'a_separar'::status_pedido)) OR ((meu_papel() = 'embalador'::papel_usuario) AND (p.status = 'separado'::status_pedido)) OR ((meu_papel() = 'expedicao'::papel_usuario) AND (p.status = 'embalado'::status_pedido)))))));
create policy ver_pedidos_por_papel on public.pedidos as permissive for select to public using (((meu_papel() = 'admin'::papel_usuario) OR ((meu_papel() = 'operador'::papel_usuario) AND (status = ANY (ARRAY['a_separar'::status_pedido, 'separado'::status_pedido, 'embalado'::status_pedido, 'expedido'::status_pedido]))) OR ((meu_papel() = 'separador'::papel_usuario) AND (status = ANY (ARRAY['a_separar'::status_pedido, 'separado'::status_pedido]))) OR ((meu_papel() = 'embalador'::papel_usuario) AND (status = ANY (ARRAY['separado'::status_pedido, 'embalado'::status_pedido]))) OR ((meu_papel() = 'expedicao'::papel_usuario) AND (status = ANY (ARRAY['embalado'::status_pedido, 'expedido'::status_pedido])))));
create policy ver_proprio_perfil on public.perfis as permissive for select to public using (((id = ( SELECT auth.uid() AS uid)) OR (meu_papel() = 'admin'::papel_usuario)));
create policy ver_proprios_eventos on public.eventos_tarefa as permissive for select to public using (((usuario_id = ( SELECT auth.uid() AS uid)) OR (meu_papel() = 'admin'::papel_usuario)));
create policy ver_retiradas_loja on public.retiradas_loja as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM perfis p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.ativo, true)))));

-- ---------------------------------------------------------------- permissões
-- segredos: nenhum acesso pela API (só as funções do servidor, com service role)
revoke all on public.config_secretos from anon, authenticated;

revoke all on function public.bipar_endereco_sku(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancelar_pedido(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.contagem_expedidos_hoje() from public, anon, authenticated;
revoke all on function public.contagem_pedidos() from public, anon, authenticated;
revoke all on function public.contagem_pendencias() from public, anon, authenticated;
revoke all on function public.decidir_devolucao(uuid, status_devolucao, uuid) from public, anon, authenticated;
revoke all on function public.enderecamento_ativo() from public, anon, authenticated;
revoke all on function public.lidar_novo_usuario() from public, anon, authenticated;
revoke all on function public.marcar_expedido_em() from public, anon, authenticated;
revoke all on function public.meu_papel() from public, anon, authenticated;
revoke all on function public.registrar_contagem_inventario(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.situacao_pedido_por_codigo(text) from public, anon, authenticated;
revoke all on function public.transferir_estoque(uuid, uuid, uuid, integer) from public, anon, authenticated;

-- telão (sem login) usa as contagens; meu_papel/enderecamento_ativo são usados dentro das regras de RLS
grant execute on function public.contagem_expedidos_hoje() to anon, authenticated, service_role;
grant execute on function public.contagem_pedidos() to anon, authenticated, service_role;
grant execute on function public.contagem_pendencias() to anon, authenticated, service_role;
grant execute on function public.enderecamento_ativo() to anon, authenticated, service_role;
grant execute on function public.meu_papel() to anon, authenticated, service_role;
grant execute on function public.marcar_expedido_em() to anon, authenticated, service_role;
grant execute on function public.bipar_endereco_sku(uuid, uuid) to authenticated, service_role;
grant execute on function public.cancelar_pedido(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function public.decidir_devolucao(uuid, status_devolucao, uuid) to authenticated, service_role;
grant execute on function public.registrar_contagem_inventario(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.situacao_pedido_por_codigo(text) to authenticated, service_role;
grant execute on function public.transferir_estoque(uuid, uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.lidar_novo_usuario() to service_role;

-- ---------------------------------------------------------------- configurações iniciais
insert into public.config_wms (chave, valor) values
  ('enderecamento_ativo', 'false'),
  ('loja_depositos', '[]'),
  ('loja_contato_balcao', '')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------- agendamento
-- Renova o acesso à API v3 do Olist a cada 3h. Troque <PROJETO> pelo id do projeto
-- (produção: levnxrjcvqubfowvvurd). Só ligue onde a v3 estiver conectada.
-- select cron.schedule('renovar-olist-v3', '17 */3 * * *', $$select net.http_get('https://<PROJETO>.supabase.co/functions/v1/olist-oauth', params := jsonb_build_object('renovar',(select valor from public.config_secretos where chave='olist_v3_chave_cron')))$$);
