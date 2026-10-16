-- WMS Pilchs — Ocorrências, fase 3
-- 1) guarda o ENDEREÇO onde o operador estava quando reportou (para o relatório e para corrigir estoque)
-- 2) ao resolver "encontrado em outro endereço", o admin pode corrigir o estoque do endereço vazio
--    (fica registrado em inventario_contagens, igual a uma contagem de inventário)
-- 3) envio parcial pode tirar o item INTEIRO do pedido (qtd 0) — usa a função ocorrencia_remover_item (arquivo 000005)
-- Não apaga nada das funções antigas: abrir_ocorrencia continua existindo; as telas novas usam abrir_ocorrencia2.

alter table public.ocorrencias add column if not exists endereco_id uuid references public.enderecos(id);
create index if not exists ocorrencias_aberta_em_idx on public.ocorrencias (aberta_em desc);

-- ---------- operador abre uma ocorrência (com endereço) ----------
create or replace function public.abrir_ocorrencia2(p_pedido_id uuid, p_etapa text, p_motivo text,
  p_item_id uuid default null, p_detalhe text default null, p_qtd integer default null, p_endereco_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_end uuid := p_endereco_id;
  v_prod uuid;
begin
  v_id := public.abrir_ocorrencia(p_pedido_id, p_etapa, p_motivo, p_item_id, p_detalhe, p_qtd);
  if v_end is not null and not exists (select 1 from enderecos where id = v_end) then v_end := null; end if;
  -- sem endereço bipado: se o produto só tem estoque em UM endereço, é esse
  if v_end is null and p_item_id is not null and p_etapa = 'separacao' then
    select produto_id into v_prod from itens_pedido where id = p_item_id;
    if (select count(*) from estoque_enderecos where produto_id = v_prod and quantidade > 0) = 1 then
      select endereco_id into v_end from estoque_enderecos where produto_id = v_prod and quantidade > 0;
    end if;
  end if;
  if v_end is not null then update ocorrencias set endereco_id = v_end where id = v_id; end if;
  return v_id;
end $$;

-- ---------- admin resolve (mesma assinatura da fase 2) ----------
-- p_dados (conforme a solução):
--   encontrado_outro_endereco {endereco, corrigir_estoque (bool), qtd_real (int, padrão 0)}
--   sku_substituto {item_id, sku_novo, autorizado_via, contato_por}
--   envio_parcial  {item_id, qtd_enviar (0 = tirar o item inteiro), autorizado_via, contato_por}
--   aguardar_reposicao {previsao}
--   trocar_unidade {onde}
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
  v_real integer;
  v_antes integer;
  v_aviso text;
  v_extra text := '';
  v_sku text;
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

  if p_solucao = 'aguardar_reposicao' then
    update ocorrencias set status = 'aguardando', solucao = p_solucao, solucao_detalhe = nullif(trim(coalesce(p_detalhe, '')), ''),
      solucao_dados = p_dados, resolvida_por = v_uid where id = p_id;
    return 'aguardando';
  end if;

  v_novo_status := v_ped.status;

  if p_solucao = 'encontrado_outro_endereco' and coalesce((p_dados->>'corrigir_estoque')::boolean, false) then
    -- corrige o estoque do endereço onde o produto NÃO estava
    if v_oc.endereco_id is null or v_oc.item_id is null then raise exception 'sem_endereco_para_corrigir'; end if;
    select produto_id into v_prod from itens_pedido where id = v_oc.item_id;
    v_real := greatest(coalesce((p_dados->>'qtd_real')::integer, 0), 0);
    select quantidade into v_antes from estoque_enderecos where produto_id = v_prod and endereco_id = v_oc.endereco_id for update;
    if found and v_antes <> v_real then
      update estoque_enderecos set quantidade = v_real, atualizado_em = now()
       where produto_id = v_prod and endereco_id = v_oc.endereco_id;
      insert into inventario_contagens (endereco_id, produto_id, qtd_sistema, qtd_contada, usuario_id)
      values (v_oc.endereco_id, v_prod, v_antes, v_real, v_uid);
      p_dados := p_dados || jsonb_build_object('estoque_antes', v_antes, 'estoque_depois', v_real,
                   'endereco_corrigido', (select codigo from enderecos where id = v_oc.endereco_id));
    end if;
  elsif p_solucao = 'sku_substituto' then
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
    if v_qtd is null or v_qtd < 0 or v_qtd >= v_item.qtd then raise exception 'quantidade_invalida'; end if;
    select sku into v_sku from produtos where id = v_item.produto_id;
    if v_item.qtd_separada > v_qtd then
      v_extra := ' · devolver ' || (v_item.qtd_separada - v_qtd) || ' un. do SKU ' || v_sku || ' ao endereço';
    end if;
    if v_qtd = 0 then
      if (select count(*) from itens_pedido where pedido_id = v_ped.id) <= 1 then raise exception 'unico_item'; end if;
      p_dados := p_dados || jsonb_build_object('sku_removido', v_sku, 'qtd_original', v_item.qtd);
      perform public.ocorrencia_remover_item(v_item.id);
    else
      update itens_pedido set qtd = v_qtd, qtd_separada = least(qtd_separada, v_qtd), qtd_embalada = least(qtd_embalada, v_qtd)
       where id = v_item.id;
    end if;
    -- o status não muda: quem pegar o pedido de volta conclui a etapa normalmente
  elsif p_solucao = 'refazer_embalagem' and v_ped.status = 'embalado' then
    update itens_pedido set qtd_embalada = 0 where pedido_id = v_ped.id;
    v_novo_status := 'separado';
  end if;

  v_aviso := public.ocorrencia_rotulo(p_solucao) ||
    case p_solucao
      when 'encontrado_outro_endereco' then coalesce(': ' || nullif(p_dados->>'endereco', ''), '')
      when 'sku_substituto' then ': agora é o SKU ' || (select sku from produtos where id = v_prod)
      when 'envio_parcial' then case when v_qtd = 0 then ': o SKU ' || v_sku || ' saiu do pedido' else ': enviar ' || v_qtd || ' un.' end
      when 'trocar_unidade' then coalesce(': ' || nullif(p_dados->>'onde', ''), '')
      else '' end || v_extra ||
    coalesce(' — ' || nullif(trim(coalesce(p_detalhe, '')), ''), '');

  update ocorrencias set status = 'resolvida', solucao = p_solucao, solucao_detalhe = nullif(trim(coalesce(p_detalhe, '')), ''),
    solucao_dados = p_dados, resolvida_por = v_uid, resolvida_em = now(), devolvida_para = p_devolver_para where id = p_id;

  update pedidos set em_ocorrencia = false, status = v_novo_status, volta_aviso = left(v_aviso, 300), volta_em = now(),
    reservado_por = p_devolver_para, reservado_em = case when p_devolver_para is null then null else now() end
   where id = v_ped.id;
  return 'resolvida';
end $$;

revoke execute on function public.abrir_ocorrencia2(uuid, text, text, uuid, text, integer, uuid) from public, anon;
grant execute on function public.abrir_ocorrencia2(uuid, text, text, uuid, text, integer, uuid) to authenticated;
