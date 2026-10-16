-- Sincronização automática com o Olist (a cada 5 minutos, em horário de trabalho).
-- O agendamento (pg_cron) chama a função sincronizar-olist com uma chave secreta própria.
-- Interruptor: config_wms.sync_auto_olist = 'ligada' | 'desligada' (nasce DESLIGADA).
-- Cada sincronização (automática ou pelo botão) fica registrada em public.sincronizacoes.

create table if not exists public.sincronizacoes (
  id            bigserial primary key,
  origem        text not null check (origem in ('auto', 'manual')),
  usuario       uuid references public.perfis(id),
  iniciado_em   timestamptz not null default now(),
  terminado_em  timestamptz,
  encontrados   integer,
  paginas       integer,
  importados    integer,
  ja_existentes integer,
  cancelados_no_wms integer,
  erros         integer,
  resumo        jsonb,
  erro          text
);
create index if not exists sincronizacoes_iniciado_idx on public.sincronizacoes (iniciado_em desc);
alter table public.sincronizacoes enable row level security;
create policy ler_sincronizacoes on public.sincronizacoes for select to authenticated
  using (public.meu_papel() is not null);
-- (sem insert/update para logins: só a função do servidor grava)

insert into public.config_wms (chave, valor) values ('sync_auto_olist', 'desligada')
on conflict (chave) do nothing;

-- Chave que o agendamento usa para chamar a função (gerada aqui, nunca sai do banco)
insert into public.config_secretos (chave, valor)
values ('sync_chave_cron', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (chave) do nothing;

-- Trava: só uma sincronização por vez. Devolve o id do registro novo, ou null se já houver outra rodando.
-- Uma sincronização "presa" há mais de 4 minutos é considerada abandonada.
create or replace function public.sync_iniciar(p_origem text, p_usuario uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('sincronizar-olist'));
  if exists (select 1 from sincronizacoes where terminado_em is null and iniciado_em > now() - interval '4 minutes') then
    return null;
  end if;
  update sincronizacoes set terminado_em = now(), erro = coalesce(erro, 'interrompida (tempo esgotado)')
   where terminado_em is null;
  insert into sincronizacoes (origem, usuario) values (p_origem, p_usuario) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.sync_iniciar(text, uuid) from public, anon, authenticated;

-- Agendamento: o endereço da função fica em config_secretos.sync_url (cada projeto tem o seu).
-- Exemplo (rodar uma vez por projeto, trocando o <ref>):
--   insert into public.config_secretos (chave, valor)
--   values ('sync_url', 'https://<ref>.supabase.co/functions/v1/sincronizar-olist')
--   on conflict (chave) do update set valor = excluded.valor;
-- Segunda a sábado, das 7h às 20h55 de Brasília (10h–23h55 UTC), a cada 5 minutos.
select cron.schedule('sincronizar-olist-auto', '*/5 10-23 * * 1-6', $cron$
  select net.http_post(
    url := (select valor from public.config_secretos where chave = 'sync_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-chave-cron', (select valor from public.config_secretos where chave = 'sync_chave_cron')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  where (select valor from public.config_wms where chave = 'sync_auto_olist') = 'ligada'
    and exists (select 1 from public.config_secretos where chave = 'sync_url' and valor <> '');
$cron$);

-- Limpeza diária: guarda 30 dias de registro
select cron.schedule('limpar-sincronizacoes', '30 6 * * *', $cron$
  delete from public.sincronizacoes where iniciado_em < now() - interval '30 days';
$cron$);
