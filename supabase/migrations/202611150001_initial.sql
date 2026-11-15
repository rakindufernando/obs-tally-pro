-- OBS TALLY PRO, restricted production schema. Run in a new Supabase project.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'cameraman' check (role in ('administrator','director','cameraman')),
 display_name text not null default '',
 created_at timestamptz not null default now()
);
create function public.profile_for_new_auth_user() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.profiles(id,role,display_name) values (new.id,'cameraman',coalesce(new.raw_user_meta_data->>'name','')) on conflict (id) do nothing;
 return new;
end $$;
create trigger auth_user_profile after insert on auth.users for each row execute function public.profile_for_new_auth_user();

create table public.productions (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 obs_connected boolean not null default false, studio_mode boolean not null default false,
 program_scene text, preview_scene text, streaming boolean not null default false,
 recording boolean not null default false, last_bridge_at timestamptz,
 last_sequence bigint not null default 0, preview_available boolean not null default false
);
create table public.production_members (
 production_id uuid not null references public.productions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('administrator','director')),
 primary key(production_id,user_id)
);
create table public.cameras (
 id uuid primary key default gen_random_uuid(), production_id uuid not null references public.productions(id) on delete cascade,
 number integer not null check(number between 1 and 9999),
 name text not null check(length(name) between 1 and 100), cameraman text not null default '',
 enabled boolean not null default true, channel_nonce uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(production_id,number)
);
create table public.camera_mappings (
 id uuid primary key default gen_random_uuid(), camera_id uuid not null references public.cameras(id) on delete cascade,
 kind text not null check(kind in ('SCENE','SOURCE')),
 obs_name text not null check(length(obs_name) between 1 and 250),
 obs_uuid text, excluded boolean not null default false,
 created_at timestamptz not null default now()
);
create index camera_mappings_camera_idx on public.camera_mappings(camera_id);
create table public.camera_devices (
 id uuid primary key default gen_random_uuid(), camera_id uuid not null references public.cameras(id) on delete cascade,
 user_id uuid not null unique references auth.users(id) on delete cascade,
 device_name text not null default 'Phone', paired_at timestamptz not null default now(),
 revoked_at timestamptz, last_seen_at timestamptz
);
create index camera_devices_camera_idx on public.camera_devices(camera_id) where revoked_at is null;
create table public.pairing_codes (
 code_hash text primary key, camera_id uuid not null references public.cameras(id) on delete cascade,
 expires_at timestamptz not null, used_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.bridge_pairing_codes (
 code_hash text primary key, production_id uuid not null references public.productions(id) on delete cascade,
 expires_at timestamptz not null, used_at timestamptz,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.bridge_devices (
 id uuid primary key default gen_random_uuid(), production_id uuid not null references public.productions(id) on delete cascade,
 token_hash text not null unique, last_sequence bigint not null default 0,
 created_at timestamptz not null default now(), last_seen_at timestamptz,
 revoked_at timestamptz
);
create unique index active_bridge_per_production on public.bridge_devices(production_id) where revoked_at is null;
create table public.tally_states (
 camera_id uuid primary key references public.cameras(id) on delete cascade,
 state text not null default 'OFFLINE' check(state in ('PROGRAM','PREVIEW','IDLE','OFFLINE')),
 version bigint not null default 0,
 updated_at timestamptz not null default now()
);
create table public.tally_events (
 id bigint generated always as identity primary key, production_id uuid not null references public.productions(id) on delete cascade,
 camera_id uuid references public.cameras(id) on delete set null,
 state text not null, created_at timestamptz not null default now()
);
create index tally_events_recent on public.tally_events(production_id,created_at desc);
create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references auth.users(id),
 production_id uuid references public.productions(id) on delete cascade,
 action text not null, created_at timestamptz not null default now()
);
create table public.production_presets (
 id uuid primary key default gen_random_uuid(), production_id uuid not null references public.productions(id) on delete cascade,
 name text not null, configuration jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 sound boolean not null default false, vibration boolean not null default false,
 language text not null default 'en', updated_at timestamptz not null default now()
);

create function public.is_global_admin() returns boolean
language sql security definer stable set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='administrator')
$$;
create function public.is_production_operator(pid uuid) returns boolean
language sql security definer stable set search_path=public,pg_temp as $$
 select public.is_global_admin() or exists(select 1 from public.production_members m
 where m.production_id=pid and m.user_id=auth.uid() and m.role in ('director','administrator'))
$$;
create function public.can_view_camera(cid uuid) returns boolean
language sql security definer stable set search_path=public,pg_temp as $$
 select exists(select 1 from public.cameras c where c.id=cid and (
  public.is_production_operator(c.production_id) or
  exists(select 1 from public.camera_devices d where d.camera_id=cid and d.user_id=auth.uid() and d.revoked_at is null)))
$$;
create function public.can_receive_tally_topic(t text) returns boolean
language plpgsql security definer stable set search_path=public,pg_temp as $$
declare parts text[]; cid uuid; pid uuid; nonce uuid;
begin
 parts:=string_to_array(t,':');
 if array_length(parts,1)=2 and parts[1]='production' then
  pid:=parts[2]::uuid; return public.is_production_operator(pid);
 end if;
 if array_length(parts,1)=3 and parts[1]='camera' then
  cid:=parts[2]::uuid; nonce:=parts[3]::uuid;
  return exists(select 1 from public.cameras c where c.id=cid and c.channel_nonce=nonce and public.can_view_camera(cid));
 end if;
 return false;
exception when invalid_text_representation then return false;
end $$;

-- The database is the ONLY broadcaster. Browser clients receive, never send.
create policy tally_broadcast_receive on realtime.messages for select to authenticated
using (extension='broadcast' and public.can_receive_tally_topic(realtime.topic()));

-- Data RLS is independent of Realtime channel RLS.
alter table public.profiles enable row level security;
alter table public.productions enable row level security;
alter table public.production_members enable row level security;
alter table public.cameras enable row level security;
alter table public.camera_mappings enable row level security;
alter table public.camera_devices enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.bridge_pairing_codes enable row level security;
alter table public.bridge_devices enable row level security;
alter table public.tally_states enable row level security;
alter table public.tally_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.production_presets enable row level security;
alter table public.notification_preferences enable row level security;

create policy profile_select on public.profiles for select to authenticated using (id=auth.uid() or public.is_global_admin());
create policy profile_admin_update on public.profiles for update to authenticated using(public.is_global_admin()) with check(public.is_global_admin());
create policy production_select on public.productions for select to authenticated using(
 public.is_production_operator(id));
create policy production_insert on public.productions for insert to authenticated with check(public.is_global_admin() and created_by=auth.uid());
create policy production_update on public.productions for update to authenticated using (false) with check(false);
create policy member_select on public.production_members for select to authenticated using (public.is_production_operator(production_id) or user_id=auth.uid());
create policy member_write on public.production_members for all to authenticated using (public.is_global_admin()) with check(public.is_global_admin());
create policy camera_select on public.cameras for select to authenticated using(public.can_view_camera(id));
create policy camera_insert on public.cameras for insert to authenticated with check(public.is_production_operator(production_id));
create policy camera_update on public.cameras for update to authenticated using(public.is_production_operator(production_id)) with check(public.is_production_operator(production_id));
create policy camera_delete on public.cameras for delete to authenticated using(public.is_production_operator(production_id));
create policy mapping_select on public.camera_mappings for select to authenticated using(public.can_view_camera(camera_id));
create policy mapping_write on public.camera_mappings for all to authenticated using(exists(select 1 from public.cameras c where c.id=camera_id and public.is_production_operator(c.production_id)))
 with check(exists(select 1 from public.cameras c where c.id=camera_id and public.is_production_operator(c.production_id)));
create policy devices_select on public.camera_devices for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.cameras c where c.id=camera_id and public.is_production_operator(c.production_id)));
create policy devices_revoke on public.camera_devices for update to authenticated
 using(exists(select 1 from public.cameras c where c.id=camera_id and public.is_production_operator(c.production_id)))
 with check(exists(select 1 from public.cameras c where c.id=camera_id and public.is_production_operator(c.production_id)));
create policy states_read on public.tally_states for select to authenticated using(public.can_view_camera(camera_id));
create policy events_read on public.tally_events for select to authenticated using(public.is_production_operator(production_id));
create policy audit_read on public.audit_logs for select to authenticated using(public.is_production_operator(production_id));
create policy presets_read on public.production_presets for select to authenticated using(public.is_production_operator(production_id));
create policy presets_write on public.production_presets for all to authenticated using(public.is_production_operator(production_id)) with check(public.is_production_operator(production_id));
create policy prefs_read on public.notification_preferences for select to authenticated using(user_id=auth.uid());
create policy prefs_write on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
-- No client policies for secrets, pairing records, bridge devices or authoritative tally writes.

create function public.camera_created_initialize_tally() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.tally_states(camera_id,state) values(new.id,'OFFLINE');
 return new;
end $$;
create trigger cameras_initialize_tally after insert on public.cameras for each row execute function public.camera_created_initialize_tally();

create function public.rotate_camera_on_revocation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.revoked_at is null and new.revoked_at is not null then
  update public.cameras set channel_nonce=gen_random_uuid(),updated_at=now() where id=new.camera_id;
 end if;
 return new;
end $$;
create trigger camera_device_revoke_nonce after update of revoked_at on public.camera_devices
for each row execute function public.rotate_camera_on_revocation();

create function public.tally_change_broadcast() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare cam public.cameras%rowtype; eid bigint;
begin
 select * into cam from public.cameras where id=new.camera_id;
 if found then
  perform realtime.send(jsonb_build_object('camera_id',new.camera_id,'state',new.state,'version',new.version,'updated_at',new.updated_at),
    'tally','camera:'||new.camera_id::text||':'||cam.channel_nonce::text,true);
  perform realtime.send(jsonb_build_object('camera_id',new.camera_id,'state',new.state,'version',new.version,'updated_at',new.updated_at),
    'tally','production:'||cam.production_id::text,true);
  if tg_op='INSERT' or old.state is distinct from new.state then
   insert into public.tally_events(production_id,camera_id,state) values(cam.production_id,new.camera_id,new.state) returning id into eid;
   if eid % 100 = 0 then
    delete from public.tally_events where created_at < now()-interval '14 days';
   end if;
  end if;
 end if;
 return new;
end $$;
create trigger tally_changed after insert or update of state,version on public.tally_states
for each row execute function public.tally_change_broadcast();

-- Foreground devices can update only their own current heartbeat.
create function public.camera_device_ping(cid uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.camera_devices set last_seen_at=now()
 where camera_id=cid and user_id=auth.uid() and revoked_at is null;
 return found;
end $$;

create function public.audit_configuration_change() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid; cid uuid; aid bigint;
begin
 if tg_table_name='cameras' then
  pid:=coalesce(new.production_id,old.production_id);
 elsif tg_table_name='camera_devices' then
  cid:=coalesce(new.camera_id,old.camera_id);
  select production_id into pid from public.cameras where id=cid;
 elsif tg_table_name='camera_mappings' then
  cid:=coalesce(new.camera_id,old.camera_id);
  select production_id into pid from public.cameras where id=cid;
 end if;
 insert into public.audit_logs(actor_id,production_id,action)
 values(auth.uid(),pid,left(tg_table_name||' '||tg_op,250)) returning id into aid;
 if aid % 100 = 0 then
  delete from public.audit_logs where created_at < now()-interval '30 days';
 end if;
 return coalesce(new,old);
end $$;
create trigger audit_camera_change after insert or update or delete on public.cameras
for each row execute function public.audit_configuration_change();
create trigger audit_mapping_change after insert or update or delete on public.camera_mappings
for each row execute function public.audit_configuration_change();
create trigger audit_device_change after insert or delete or update of revoked_at,camera_id,user_id,device_name on public.camera_devices
for each row execute function public.audit_configuration_change();

-- SQL security functions take no caller-provided production permission on faith.
create function public.create_pairing_code(cid uuid) returns text
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare code text; pid uuid;
begin
 select production_id into pid from public.cameras where id=cid;
 if pid is null or not public.is_production_operator(pid) then raise exception 'Not authorized'; end if;
 code:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.pairing_codes(code_hash,camera_id,expires_at,created_by)
 values(encode(extensions.digest(code,'sha256'),'hex'),cid,now()+interval '5 minutes',auth.uid());
 return code;
end $$;
create function public.claim_pairing_code(code text, device_name text default 'Phone') returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare cid uuid; previous_id uuid;
begin
 if auth.uid() is null or length(code)<>48 then raise exception 'Invalid pairing code'; end if;
 update public.pairing_codes set used_at=now()
 where code_hash=encode(extensions.digest(code,'sha256'),'hex') and used_at is null and expires_at>now()
 returning camera_id into cid;
 if cid is null then raise exception 'Pairing code expired or already used'; end if;
 select camera_id into previous_id from public.camera_devices where user_id=auth.uid() and revoked_at is null;
 if previous_id is not null and previous_id<>cid then
  update public.cameras set channel_nonce=gen_random_uuid() where id=previous_id;
 end if;
 insert into public.camera_devices(camera_id,user_id,device_name,revoked_at,paired_at)
 values(cid,auth.uid(),left(coalesce(nullif(device_name,''),'Phone'),80),null,now())
 on conflict(user_id) do update set camera_id=excluded.camera_id,device_name=excluded.device_name,revoked_at=null,paired_at=now();
 return cid;
end $$;
create function public.create_bridge_registration(pid uuid) returns text
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare code text;
begin
 if not public.is_production_operator(pid) then raise exception 'Not authorized'; end if;
 code:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.bridge_pairing_codes(code_hash,production_id,expires_at,created_by)
 values(encode(extensions.digest(code,'sha256'),'hex'),pid,now()+interval '10 minutes',auth.uid());
 return code;
end $$;

-- Trusted Edge Function-only RPCs. p_token_hash is derived from a 256-bit bridge token.
create function public.register_bridge(code text, p_token_hash text) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare pid uuid; bid uuid;
begin
 if length(code)<>48 or length(p_token_hash)<>64 then raise exception 'Invalid credentials'; end if;
 update public.bridge_pairing_codes set used_at=now()
 where code_hash=encode(extensions.digest(code,'sha256'),'hex') and used_at is null and expires_at>now()
 returning production_id into pid;
 if pid is null then raise exception 'Registration code expired or used'; end if;
 update public.bridge_devices set revoked_at=now() where production_id=pid and revoked_at is null;
 insert into public.bridge_devices(production_id,token_hash) values(pid,p_token_hash) returning id into bid;
 update public.productions set obs_connected=false,last_bridge_at=null,last_sequence=0 where id=pid;
 update public.tally_states set state='OFFLINE',version=version+1,updated_at=now() where camera_id in (select id from public.cameras where production_id=pid);
 return jsonb_build_object('bridge_id',bid,'production_id',pid);
end $$;
create function public.bridge_configuration(p_token_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid;
begin
 select production_id into pid from public.bridge_devices where token_hash=p_token_hash and revoked_at is null;
 if pid is null then raise exception 'Bridge not authorized'; end if;
 return jsonb_build_object('production_id',pid,'cameras',coalesce((
  select jsonb_agg(jsonb_build_object('id',c.id,'number',c.number,'name',c.name,'enabled',c.enabled,
  'mappings',coalesce((select jsonb_agg(jsonb_build_object('kind',m.kind,'name',m.obs_name,'uuid',m.obs_uuid,'excluded',m.excluded))
    from public.camera_mappings m where m.camera_id=c.id),'[]'::jsonb)) order by c.number)
  from public.cameras c where c.production_id=pid),'[]'::jsonb));
end $$;
create function public.bridge_heartbeat(p_token_hash text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid;
begin
 update public.bridge_devices set last_seen_at=now() where token_hash=p_token_hash and revoked_at is null returning production_id into pid;
 if pid is null then raise exception 'Bridge not authorized'; end if;
 update public.productions set last_bridge_at=now() where id=pid;
 return true;
end $$;
create function public.apply_bridge_snapshot(
 p_token_hash text,p_sequence bigint,p_obs_connected boolean,p_studio_mode boolean,
 p_program_scene text,p_preview_scene text,p_streaming boolean,p_recording boolean,p_states jsonb
) returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare bridge public.bridge_devices%rowtype; rec record; new_state text;
begin
 select * into bridge from public.bridge_devices where token_hash=p_token_hash and revoked_at is null for update;
 if not found then raise exception 'Bridge not authorized'; end if;
 if p_sequence<=bridge.last_sequence then raise exception 'Replay or out-of-order sequence'; end if;
 if p_states is null or jsonb_typeof(p_states)<>'array' or jsonb_array_length(p_states)>512 then raise exception 'Invalid camera payload'; end if;
 if exists (select 1 from jsonb_to_recordset(p_states) as x(camera_id uuid,state text) group by x.camera_id having count(*)>1) then
  raise exception 'Duplicate camera in snapshot';
 end if;
 -- Validate the entire input BEFORE applying any state changes.
 for rec in select * from jsonb_to_recordset(p_states) as x(camera_id uuid,state text) loop
  if rec.state is null or rec.state not in ('PROGRAM','PREVIEW','IDLE','OFFLINE') or not exists(select 1 from public.cameras where id=rec.camera_id and production_id=bridge.production_id)
  then raise exception 'Invalid camera status or production'; end if;
 end loop;
 update public.bridge_devices set last_sequence=p_sequence,last_seen_at=now() where id=bridge.id;
 update public.productions set obs_connected=p_obs_connected,studio_mode=p_studio_mode,
 program_scene=case when p_obs_connected then left(p_program_scene,250) else null end,
 preview_scene=case when p_obs_connected and p_studio_mode then left(p_preview_scene,250) else null end,
 preview_available=(p_obs_connected and p_studio_mode),streaming=p_obs_connected and p_streaming,
 recording=p_obs_connected and p_recording,last_bridge_at=now(),last_sequence=p_sequence
 where id=bridge.production_id;
 for rec in select * from jsonb_to_recordset(p_states) as x(camera_id uuid,state text) loop
  new_state:=case when p_obs_connected then rec.state else 'OFFLINE' end;
  update public.tally_states set state=new_state,version=p_sequence,updated_at=now()
  where camera_id=rec.camera_id and state is distinct from new_state;
 end loop;
 -- A newly added or omitted camera cannot retain an old LIVE status.
 update public.tally_states set state=case when p_obs_connected then 'IDLE' else 'OFFLINE' end,
  version=p_sequence,updated_at=now()
 where camera_id in (select id from public.cameras where production_id=bridge.production_id)
  and camera_id not in (select x.camera_id from jsonb_to_recordset(p_states) as x(camera_id uuid,state text))
  and state is distinct from (case when p_obs_connected then 'IDLE' else 'OFFLINE' end);
 return p_sequence;
end $$;

create function public.camera_snapshot(cid uuid) returns jsonb
language plpgsql security definer stable set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.can_view_camera(cid) then raise exception 'Camera access denied'; end if;
 select jsonb_build_object('camera_id',c.id,'name',c.name,'number',c.number,'enabled',c.enabled,
 'channel_nonce',c.channel_nonce,'state',s.state,'version',s.version,'state_at',s.updated_at,
 'last_bridge_at',p.last_bridge_at,'obs_connected',p.obs_connected,'studio_mode',p.studio_mode,
 'streaming',p.streaming,'recording',p.recording,'production_name',p.name)
 into result from public.cameras c join public.productions p on p.id=c.production_id
 join public.tally_states s on s.camera_id=c.id where c.id=cid;
 return result;
end $$;

-- Grant the minimum needed RPCs to signed-in users, never to anonymous unauthenticated requests.
revoke all on function public.is_global_admin() from public;
revoke all on function public.is_production_operator(uuid) from public;
revoke all on function public.can_view_camera(uuid) from public;
revoke all on function public.can_receive_tally_topic(text) from public;
revoke all on function public.create_pairing_code(uuid) from public;
revoke all on function public.claim_pairing_code(text,text) from public;
revoke all on function public.create_bridge_registration(uuid) from public;
revoke all on function public.register_bridge(text,text) from public;
revoke all on function public.bridge_configuration(text) from public;
revoke all on function public.bridge_heartbeat(text) from public;
revoke all on function public.apply_bridge_snapshot(text,bigint,boolean,boolean,text,text,boolean,boolean,jsonb) from public;
revoke all on function public.camera_snapshot(uuid) from public;
revoke all on function public.camera_device_ping(uuid) from public;
grant execute on function public.is_global_admin(),public.is_production_operator(uuid),public.can_view_camera(uuid),
 public.can_receive_tally_topic(text),public.create_pairing_code(uuid),public.claim_pairing_code(text,text),
 public.create_bridge_registration(uuid),public.camera_snapshot(uuid),public.camera_device_ping(uuid) to authenticated;
grant execute on function public.register_bridge(text,text),public.bridge_configuration(text),public.bridge_heartbeat(text),
 public.apply_bridge_snapshot(text,bigint,boolean,boolean,text,text,boolean,boolean,jsonb) to service_role;
