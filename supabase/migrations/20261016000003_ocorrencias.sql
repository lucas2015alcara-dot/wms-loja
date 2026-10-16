-- Ocorrências (reporte de problemas) — substitui alertas_estoque.
-- Operador reporta com MOTIVO → o pedido sai da fila (em_ocorrencia) e o progresso fica guardado.
-- Um problema aberto por pedido. Admin resolve com uma SOLUÇÃO → o pedido volta ao topo da fila,
-- reservado por 15 min para quem começou (ou para quem o admin escolher), com um aviso do que foi feito.

-- ---------- pedido: marcação de bloqueio e aviso de volta ----------
alter table public.pedidos add column if not exists em_ocorrencia boolean not null default false;
alter table public.pedidos add column if not exists volta_aviso text;
alter table public.pedidos add column if not exists volta_em timestamptz;
create index if not exists pedidos_em_ocorrencia_idx on public.pedidos (em_ocorrencia) where em_ocorrencia;

-- ---------- ocorrências ----------
create table if not exists public.ocorrencias (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references public.pedidos(id) on delete cascade,
  item_id          uuid references public.itens_pedido(id) on delete set null,
  etapa            text not null check (etapa in ('separacao', 'embalagem', 'expedicao')),
  motivo           text not null,
  detalhe          text,
  qtd_afetada      integer check (qtd_afetada is null or qtd_afetada > 0),
  progresso        jsonb,             -- foto do pedido na hora do reporte (itens, qtd, separado, embalado)
  status           text not null default 'aberta' check (status in ('aberta', 'aguardando', 'resolvida')),
  aberta_por       uuid references public.perfis(id),
  aberta_em        timestamptz not null default now(),
  solucao          text,
  solucao_detalhe  text,
  solucao_dados    jsonb,
  resolvida_por    uuid references public.perfis(id),
  resolvida_em     timestamptz,
  devolvida_para   uuid references public.perfis(id)
);
create unique index if not exists ocorrencias_uma_aberta_por_pedido on public.ocorrencias (pedido_id) where status <> 'resolvida';
create index if not exists ocorrencias_status_idx on public.ocorrencias (status, aberta_em desc);
alter table public.ocorrencias enable row level security;
create policy ler_ocorrencias on public.ocorrencias for select to authenticated
  using (public.meu_papel() = 'admin' or aberta_por = (select auth.uid()));
-- (sem insert/update direto: só pelas funções abaixo)

-- ---------- listas fixas ----------
create or replace function public.ocorrencia_motivos(p_etapa text)
returns text[] language sql immutable as $$
  select case p_etapa
    when 'separacao' then array['nao_encontrado','quantidade_menor','avariado','codigo_nao_le','produto_diferente','outro']
    when 'embalagem' then array['item_faltando','item_errado','avariado','sem_embalagem','nota_fiscal','etiqueta','outro']
    when 'expedicao' then array['extraviado','pacote_danificado','etiqueta_ilegivel','transportadora_recusou','outro']
  end
$$;
create or replace function public.ocorrencia_rotulo(p_codigo text)
returns text language sql immutable as $$
  select coalesce((jsonb_build_object(
    'nao_encontrado','Produto não encontrado no endereço','quantidade_menor','Quantidade menor que o pedido',
    'avariado','Produto avariado','codigo_nao_le','Código de barras não lê / etiqueta errada',
    'produto_diferente','Produto diferente do cadastro','item_faltando','Item faltando','item_errado','Item errado',
    'sem_embalagem','Sem caixa ou embalagem adequada','nota_fiscal','Nota fiscal com problema',
    'etiqueta','Etiqueta não gera / bloqueada','extraviado','Pacote extraviado','pacote_danificado','Pacote danificado',
    'etiqueta_ilegivel','Etiqueta ilegível','transportadora_recusou','Transportadora recusou','outro','Outro',
    'encontrado_outro_endereco','Encontrado em outro endereço','sku_substituto','Enviar outro SKU (autorizado pelo cliente)',
    'envio_parcial','Envio parcial autorizado','aguardar_reposicao','Aguardar reposição','trocar_unidade','Trocar por outra unidade',
    'refazer_embalagem','Refazer embalagem / etiqueta','cancelar_pedido','Pedido cancelado'
  ) ->> p_codigo), p_codigo)
$$;

-- ---------- operador abre uma ocorrência ----------
create or replace function public.abrir_ocorrencia(p_pedido_id uuid, p_etapa text, p_motivo text,
  p_item_id uuid default null, p_detalhe text default null, p_qtd integer default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ped record;
  v_status_esperado text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  if public.meu_papel() is null or public.meu_papel() = 'laboratorio' then raise exception 'sem_permissao'; end if;
  if not (p_motivo = any(coalesce(public.ocorrencia_motivos(p_etapa), array[]::text[]))) then raise exception 'motivo_invalido'; end if;
  if p_motivo = 'outro' and coalesce(length(trim(p_detalhe)), 0) < 3 then raise exception 'detalhe_obrigatorio'; end if;
  v_status_esperado := case p_etapa when 'separacao' then 'a_separar' when 'embalagem' then 'separado' else 'embalado' end;

  select * into v_ped from pedidos where id = p_pedido_id for update;
  if not found then raise exception 'pedido_nao_encontrado'; end if;
  if v_ped.status::text <> v_status_esperado then raise exception 'pedido_em_outra_etapa'; end if;
  if v_ped.em_ocorrencia or exists (select 1 from ocorrencias where pedido_id = p_pedido_id and status <> 'resolvida') then
    raise exception 'ja_tem_ocorrencia';
  end if;
  if p_item_id is not null and not exists (select 1 from itens_pedido where id = p_item_id and pedido_id = p_pedido_id) then
    raise exception 'item_invalido';
  end if;

  insert into ocorrencias (pedido_id, item_id, etapa, motivo, detalhe, qtd_afetada, aberta_por, progresso)
  values (p_pedido_id, p_item_id, p_etapa, p_motivo, nullif(left(trim(coalesce(p_detalhe, '')), 500), ''),
          case when p_qtd > 0 then p_qtd end, v_uid,
          (select jsonb_agg(jsonb_build_object('item_id', i.id, 'sku', pr.sku, 'nome', pr.nome, 'qtd', i.qtd,
                  'separado', i.qtd_separada, 'embalado', i.qtd_embalada) order by pr.nome)
             from itens_pedido i join produtos pr on pr.id = i.produto_id where i.pedido_id = p_pedido_id))
  returning id into v_id;

  update pedidos set em_ocorrencia = true, reservado_por = null, reservado_em = null where id = p_pedido_id;
  return v_id;
end $$;

-- ---------- admin resolve ----------
-- p_dados (conforme a solução):
--   encontrado_outro_endereco {endereco}
--   sku_substituto {item_id, sku_novo, autorizado_via, contato_por}
--   envio_parcial  {item_id, qtd_enviar, autorizado_via, contato_por}
--   aguardar_reposicao {previsao}
--   trocar_unidade {onde}
-- p_devolver_para: login que recebe o pedido de volta (reserva de 15 min). null = livre para todos.
create or replace function public.resolver_ocorrencia(p_id uuid, p_solucao text, p_detalhe text default null,
  p_dados jsonb default '{}'::jsonb, p_devolver_para uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_oc record;
  v_ped record;
  v_item record;
  v_prod uuid;
  v_qtd integer;
  v_aviso text;
  v_novo_status public.status_pedido;
begin
  if v_uid is null then raise exception 'nao_autenticado'; end if;
  if public.meu_papel() is distinct from 'admin' then raise exception 'apenas_admin'; end if;
  if p_solucao not in ('encontrado_outro_endereco','sku_substituto','envio_parcial','aguardar_reposicao',
                       'trocar_unidade','refazer_embalagem','outro') then raise exception 'solucao_invalida'; end if;
  if p_solucao = 'outro' and coalesce(length(trim(p_detalhe)), 0) < 3 then raise exception 'detalhe_obrigatorio'; end if;
  p_dados := coalesce(p_dados, '{}'::jsonb);

  select * into v_oc from ocorrencias where id = p_id for update;
  if not found then raise exception 'ocorrencia_nao_encontrada'; end if;
  if v_oc.status = 'resolvida' then raise exception 'ja_resolvida'; end if;
  select * into v_ped from pedidos where id = v_oc.pedido_id for update;
  if v_ped.status in ('cancelado', 'expedido') then raise exception 'pedido_encerrado'; end if;
  if p_devolver_para is not null and not exists (select 1 from perfis where id = p_devolver_para and ativo) then
    raise exception 'login_invalido';
  end if;

  -- aguardar reposição: o pedido continua fora da fila
  if p_solucao = 'aguardar_reposicao' then
    update ocorrencias set status = 'aguardando', solucao = p_solucao, solucao_detalhe = nullif(trim(coalesce(p_detalhe, '')), ''),
      solucao_dados = p_dados, resolvida_por = v_uid where id = p_id;
    return 'aguardando';
  end if;

  v_novo_status := v_ped.status;

  if p_solucao = 'sku_substituto' then
    select * into v_item from itens_pedido where id = (p_dados->>'item_id')::uuid and pedido_id = v_ped.id;
    if not found then raise exception 'item_invalido'; end if;
    if coalesce(p_dados->>'autorizado_via', '') = '' then raise exception 'informe_autorizacao'; end if;
    select id into v_prod from produtos where lower(sku) = lower(trim(p_dados->>'sku_novo'))
       or (trim(p_dados->>'sku_novo') ~ '^[0-9]+$' and sku ~ '^[0-9]+$' and ltrim(sku, '0') = ltrim(trim(p_dados->>'sku_novo'), '0'))
     limit 1;
    if v_prod is null then raise exception 'sku_nao_cadastrado'; end if;
    update itens_pedido set produto_id = v_prod, qtd_separada = 0, qtd_embalada = 0 where id = v_item.id;
    v_novo_status := 'a_separar';
  elsif p_solucao = 'envio_parcial' then
    select * into v_item from itens_pedido where id = (p_dados->>'item_id')::uuid and pedido_id = v_ped.id;
    if not found then raise exception 'item_invalido'; end if;
    if coalesce(p_dados->>'autorizado_via', '') = '' then raise exception 'informe_autorizacao'; end if;
    v_qtd := (p_dados->>'qtd_enviar')::integer;
    -- por enquanto só reduz a quantidade (mínimo 1); tirar um item inteiro do pedido fica para a próxima fase
    if v_qtd is null or v_qtd < 1 or v_qtd >= v_item.qtd then raise exception 'quantidade_invalida'; end if;
    update itens_pedido set qtd = v_qtd, qtd_separada = least(qtd_separada, v_qtd), qtd_embalada = least(qtd_embalada, v_qtd)
     where id = v_item.id;
  elsif p_solucao = 'refazer_embalagem' and v_ped.status = 'embalado' then
    update itens_pedido set qtd_embalada = 0 where pedido_id = v_ped.id;
    v_novo_status := 'separado';
  end if;

  v_aviso := public.ocorrencia_rotulo(p_solucao) ||
    case p_solucao
      when 'encontrado_outro_endereco' then coalesce(': ' || nullif(p_dados->>'endereco', ''), '')
      when 'sku_substituto' then ': agora é o SKU ' || (select sku from produtos where id = v_prod)
      when 'envio_parcial' then ': enviar ' || v_qtd || ' un.'
      when 'trocar_unidade' then coalesce(': ' || nullif(p_dados->>'onde', ''), '')
      else '' end ||
    coalesce(' — ' || nullif(trim(coalesce(p_detalhe, '')), ''), '');

  update ocorrencias set status = 'resolvida', solucao = p_solucao, solucao_detalhe = nullif(trim(coalesce(p_detalhe, '')), ''),
    solucao_dados = p_dados, resolvida_por = v_uid, resolvida_em = now(), devolvida_para = p_devolver_para where id = p_id;

  update pedidos set em_ocorrencia = false, status = v_novo_status, volta_aviso = left(v_aviso, 300), volta_em = now(),
    reservado_por = p_devolver_para, reservado_em = case when p_devolver_para is null then null else now() end
   where id = v_ped.id;
  return 'resolvida';
end $$;

-- ---------- admin passa a reserva para outro login (ou libera para todos) ----------
create or replace function public.transferir_reserva(p_pedido_id uuid, p_usuario uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nao_autenticado'; end if;
  if public.meu_papel() is distinct from 'admin' then raise exception 'apenas_admin'; end if;
  if p_usuario is not null and not exists (select 1 from perfis where id = p_usuario and ativo) then raise exception 'login_invalido'; end if;
  update pedidos set reservado_por = p_usuario,
    reservado_em = case when p_usuario is null then null else now() end,
    -- quem recebe é avisado ("voltou para você") e vê o pedido no topo
    volta_em = case when p_usuario is null then volta_em else now() end,
    volta_aviso = case when p_usuario is null then volta_aviso
                       else coalesce(volta_aviso, 'Passado para você pelo admin') end
   where id = p_pedido_id and status in ('a_separar', 'separado', 'embalado') and not em_ocorrencia;
  if not found then raise exception 'pedido_indisponivel'; end if;
end $$;

-- ---------- travas ----------
-- operador não mexe na marcação de ocorrência nem avança um pedido bloqueado
create or replace function public.proteger_pedido_ocorrencia()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and public.meu_papel() is distinct from 'admin' then
    if new.em_ocorrencia is distinct from old.em_ocorrencia or new.volta_aviso is distinct from old.volta_aviso
       or new.volta_em is distinct from old.volta_em then
      raise exception 'sem_permissao';
    end if;
    if old.em_ocorrencia and new.status is distinct from old.status then raise exception 'pedido_com_ocorrencia'; end if;
    if old.em_ocorrencia and new.reservado_por is not null and new.reservado_por is distinct from old.reservado_por then
      raise exception 'pedido_com_ocorrencia';
    end if;
  end if;
  -- o aviso de volta some quando o pedido muda de etapa
  if new.status is distinct from old.status and new.volta_em is not distinct from old.volta_em then
    new.volta_aviso := null; new.volta_em := null;
  end if;
  return new;
end $$;
create trigger proteger_pedido_ocorrencia before update on public.pedidos
  for each row execute function public.proteger_pedido_ocorrencia();

-- pedido cancelado (pelo admin ou pelo Olist) encerra a ocorrência aberta
create or replace function public.fechar_ocorrencia_ao_cancelar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    update ocorrencias set status = 'resolvida', solucao = 'cancelar_pedido', resolvida_em = now(),
      resolvida_por = coalesce(new.cancelado_por, auth.uid()), solucao_detalhe = new.motivo_cancelamento
     where pedido_id = new.id and status <> 'resolvida';
    if new.em_ocorrencia then
      update pedidos set em_ocorrencia = false where id = new.id;
    end if;
  end if;
  return new;
end $$;
create trigger fechar_ocorrencia_ao_cancelar after update of status on public.pedidos
  for each row execute function public.fechar_ocorrencia_ao_cancelar();

-- ---------- contagens (telão e painel) ----------
create or replace function public.contagem_pendencias()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from ocorrencias where status <> 'resolvida';
$$;

-- a expedição precisa saber se o pacote bipado está com problema em aberto
-- (função nova ao lado da antiga, para não quebrar a versão do site que ainda usa a antiga)
create or replace function public.situacao_pedido_v2(p_codigo text)
returns table(id_externo text, status text, expedido_em timestamptz, cancelado_em timestamptz, em_ocorrencia boolean)
language sql stable security definer set search_path = public as $$
  select p.id_externo, p.status::text, p.expedido_em, p.cancelado_em, p.em_ocorrencia
  from pedidos p
  where exists (select 1 from perfis f where f.id = auth.uid() and coalesce(f.ativo, true))
    and (
      lower(p.id_externo) = lower(trim(p_codigo))
      or (trim(p_codigo) ~ '^[0-9]+$' and p.id_externo ~ '^[0-9]+$'
          and ltrim(p.id_externo, '0') = ltrim(trim(p_codigo), '0'))
    )
  order by p.criado_em desc
  limit 1;
$$;

-- ---------- histórico: reportes antigos viram ocorrências ----------
insert into public.ocorrencias (pedido_id, item_id, etapa, motivo, detalhe, status, aberta_por, aberta_em, solucao, solucao_detalhe, resolvida_em)
select i.pedido_id, a.item_id, a.origem,
       case when a.origem = 'separacao' then 'nao_encontrado' else 'outro' end,
       'Reporte do sistema antigo (sem motivo)',
       case when a.resolvido then 'resolvida' else 'aberta' end,
       a.reportado_por, a.criado_em,
       case when a.resolvido then 'outro' end,
       case when a.resolvido then 'Resolvido no sistema antigo' end,
       case when a.resolvido then a.criado_em end
from public.alertas_estoque a join public.itens_pedido i on i.id = a.item_id
where not exists (select 1 from public.ocorrencias o where o.item_id = a.item_id and o.aberta_em = a.criado_em)
  and (a.resolvido or not exists (select 1 from public.ocorrencias o2 where o2.pedido_id = i.pedido_id and o2.status <> 'resolvida'));
update public.pedidos p set em_ocorrencia = true
 where exists (select 1 from public.ocorrencias o where o.pedido_id = p.id and o.status <> 'resolvida')
   and p.status in ('a_separar', 'separado', 'embalado');

revoke execute on function public.abrir_ocorrencia(uuid, text, text, uuid, text, integer) from public, anon;
revoke execute on function public.resolver_ocorrencia(uuid, text, text, jsonb, uuid) from public, anon;
revoke execute on function public.transferir_reserva(uuid, uuid) from public, anon;
grant execute on function public.abrir_ocorrencia(uuid, text, text, uuid, text, integer) to authenticated;
grant execute on function public.resolver_ocorrencia(uuid, text, text, jsonb, uuid) to authenticated;
grant execute on function public.transferir_reserva(uuid, uuid) to authenticated;
revoke execute on function public.situacao_pedido_v2(text) from public, anon;
grant execute on function public.situacao_pedido_v2(text) to authenticated;
revoke execute on function public.fechar_ocorrencia_ao_cancelar() from public, anon, authenticated;
