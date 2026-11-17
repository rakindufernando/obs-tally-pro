
create table if not exists public.obs_scene_commands (
 id uuid primary key default gen_random_uuid(),
 production_id uuid not null references public.productions(id) on delete cascade,
 requested_by uuid not null references auth.users(id),
 scene_name text not null check(length(scene_name) between 1 and 150),
 status text not null default 'pending' check(status in ('pending','delivered','completed','failed')),
 result_message text not null default '',
 created_at timestamptz not null default now(),
 processed_at timestamptz
);
create index if not exists obs_scene_command_active on public.obs_scene_commands(production_id,created_at)
where status in ('pending','delivered');
alter table public.obs_scene_commands enable row level security;
revoke all on public.obs_scene_commands from public,anon,authenticated;
grant select on public.obs_scene_commands to authenticated;
drop policy if exists operator_scene_command_read on public.obs_scene_commands;
create policy operator_scene_command_read on public.obs_scene_commands for select to authenticated
using(public.is_production_operator(production_id));

create or replace function public.request_obs_scene_switch(pid uuid, requested_scene text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid; selected text:=btrim(requested_scene);
begin
 if not public.is_production_operator(pid) then raise exception 'Only directors can switch OBS scenes';end if;
 if selected is null or length(selected) not between 1 and 150 then raise exception 'Invalid scene';end if;
 if not exists(select 1 from public.productions p
    where p.id=pid and p.obs_connected and p.last_bridge_at>now()-interval '30 seconds'
    and exists(select 1 from jsonb_array_elements(coalesce(p.obs_sources,'[]'::jsonb)) s
       where s->>'kind'='SCENE' and s->>'name'=selected)) then
    raise exception 'OBS scene not available or Bridge disconnected';
 end if;
 if (select count(*) from public.obs_scene_commands where requested_by=auth.uid()
    and created_at>now()-interval '1 minute')>=20 then raise exception 'Scene switching rate limited';end if;
 insert into public.obs_scene_commands(production_id,requested_by,scene_name)
 values(pid,auth.uid(),selected) returning obs_scene_commands.id into id;
 return id;
end $$;
revoke all on function public.request_obs_scene_switch(uuid,text) from public,anon;
grant execute on function public.request_obs_scene_switch(uuid,text) to authenticated;