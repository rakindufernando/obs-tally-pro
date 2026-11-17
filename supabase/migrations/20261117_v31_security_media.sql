-- OBS TALLY PRO 3.1 additive hardening. Existing camera IDs, pairing and bridge auth unchanged.
-- Director-only multiview and private JPEG thumbnails.
create or replace function public.crew_multiview_snapshot(pid uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.is_production_operator(pid) then raise exception 'Director access required'; end if;
 select jsonb_build_object(
  'production_id',p.id,'production_name',p.name,
  'bridge_online',p.obs_connected and p.last_bridge_at>now()-interval '30 seconds',
  'last_bridge_at',p.last_bridge_at,
  'cameras',coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'number',c.number,'name',c.name,'enabled',c.enabled,
    'state',case when p.obs_connected and p.last_bridge_at>now()-interval '30 seconds'
      then coalesce(t.state,'OFFLINE') else 'OFFLINE' end,
    'preview_at',case when a.updated_at>now()-interval '45 seconds' then a.updated_at else null end,
    'devices_online',(select count(*) from public.camera_devices d where d.camera_id=c.id and d.revoked_at is null and d.last_seen_at>now()-interval '90 seconds')
  ) order by c.number) from public.cameras c
  left join public.tally_states t on t.camera_id=c.id
  left join public.camera_preview_assets a on a.camera_id=c.id
  where c.production_id=pid and c.enabled),'[]'::jsonb)
 ) into result from public.productions p where p.id=pid;
 return result;
end $$;

-- The cameraman gets tally + authorized PROGRAM FEED only; never private camera thumbnails.
drop policy if exists tally_preview_authenticated_read on storage.objects;
create policy tally_preview_authenticated_read on storage.objects for select to authenticated
using(bucket_id='tally-private-previews' and exists(
 select 1 from public.cameras c where storage.objects.name=c.production_id::text||'/'||c.id::text||'.jpg'
 and public.is_production_operator(c.production_id)));
drop policy if exists previews_visible on public.camera_preview_assets;
create policy previews_visible on public.camera_preview_assets for select to authenticated
using(public.is_production_operator(production_id));

-- Explicit call lifecycle and a supporting index for one active receiver.
alter table public.crew_rtc_signals drop constraint if exists crew_rtc_signals_kind_check;
alter table public.crew_rtc_signals add constraint crew_rtc_signals_kind_check
 check(kind in ('offer','ringing','answer','ice','decline','busy','hangup'));
create index if not exists crew_rtc_receiver_live_31 on public.crew_rtc_signals(receiver_id,id desc);
-- Realtime only sends rows that pass each individual receiver's RLS.
do $$begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='crew_rtc_signals') then
  alter publication supabase_realtime add table public.crew_rtc_signals;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='operator_messages') then
  alter publication supabase_realtime add table public.operator_messages;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='obs_scene_commands') then
  alter publication supabase_realtime add table public.obs_scene_commands;
 end if;
end$$;

-- Keep the existing RPC signature, authorization and rate limit, allow complete lifecycle signals.
create or replace function public.send_crew_rtc_signal(pid uuid,receiver uuid,session_id uuid,signal_type text,signal_body jsonb)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare sender uuid:=auth.uid(); signal_id bigint; sender_dir boolean; receiver_dir boolean; receiver_paired boolean;
begin
 if sender is null or receiver is null or sender=receiver or session_id is null then raise exception 'Invalid signaling participants';end if;
 if not public.can_access_crew_production(pid) then raise exception 'Production access denied';end if;
 if signal_type not in ('offer','ringing','answer','ice','decline','busy','hangup') then raise exception 'Invalid signal type';end if;
 if signal_body is null or jsonb_typeof(signal_body)<>'object' or pg_column_size(signal_body)>16000 then raise exception 'Invalid signaling payload';end if;
 sender_dir:=public.is_production_operator(pid);
 receiver_dir:=exists(select 1 from public.productions p where p.id=pid and p.created_by=receiver)
  or exists(select 1 from public.production_members m where m.production_id=pid and m.user_id=receiver and m.role in ('director','administrator'))
  or exists(select 1 from public.profiles p where p.id=receiver and p.role='administrator');
 receiver_paired:=exists(select 1 from public.camera_devices d join public.cameras c on c.id=d.camera_id
 where c.production_id=pid and d.user_id=receiver and d.revoked_at is null);
 if not ((sender_dir and receiver_paired) or (not sender_dir and receiver_dir)) then raise exception 'Talkback recipient not permitted';end if;
 if (select count(*) from public.crew_rtc_signals where sender_id=sender and created_at>now()-interval '1 minute')>=160
 then raise exception 'Too many signaling messages';end if;
 insert into public.crew_rtc_signals(production_id,sender_id,receiver_id,call_id,kind,payload)
 values(pid,sender,receiver,session_id,signal_type,signal_body) returning id into signal_id;
 return signal_id;
end $$;
revoke all on function public.send_crew_rtc_signal(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.send_crew_rtc_signal(uuid,uuid,uuid,text,jsonb) to authenticated;

-- Presence information for direct call buttons. No users outside authorized production.
create or replace function public.crew_participants(pid uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.can_access_crew_production(pid) then raise exception 'Access denied';end if;
 select jsonb_build_object('directors',coalesce((select jsonb_agg(distinct uid) from (
   select created_by as uid from public.productions where id=pid
   union select user_id from public.production_members where production_id=pid and role in ('director','administrator')
 ) x),'[]'::jsonb),'cameramen',case when public.is_production_operator(pid) then coalesce((
   select jsonb_agg(jsonb_build_object('user_id',d.user_id,'camera_id',c.id,'camera_name',c.name,
   'device_name',d.device_name,'last_seen_at',d.last_seen_at,'online',d.last_seen_at>now()-interval '90 seconds'))
   from public.camera_devices d join public.cameras c on c.id=d.camera_id where c.production_id=pid and d.revoked_at is null
 ),'[]'::jsonb) else '[]'::jsonb end) into result;
 return result;
end $$;

-- A WHEP/MediaMTX server is required for actual program video. This setting is only
-- writable by an authorized operator. No URL or token is synthesized by the app.
create table if not exists public.production_media_settings(
 production_id uuid primary key references public.productions(id) on delete cascade,
 whep_url text not null check(length(whep_url) between 22 and 500
  and whep_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?/program-[0-9a-f-]{36}/whep$'),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id)
);
alter table public.production_media_settings enable row level security;
revoke all on public.production_media_settings from public,anon,authenticated;
grant select,insert,update,delete on public.production_media_settings to authenticated;
drop policy if exists program_media_director_select on public.production_media_settings;
create policy program_media_director_select on public.production_media_settings for select to authenticated
 using(public.is_production_operator(production_id));
drop policy if exists program_media_director_write on public.production_media_settings;
create policy program_media_director_write on public.production_media_settings for all to authenticated
 using(public.is_production_operator(production_id))
 with check(public.is_production_operator(production_id) and updated_by=auth.uid()
 and whep_url like '%/program-'||production_id::text||'/whep');

-- Authorized cameras can request the WHEP endpoint only when OBS is actively streaming.
-- Actual viewing authorization MUST ALSO be checked independently on the relay.
create or replace function public.program_feed_access(pid uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p record; media_url text;
begin
 if not public.can_access_crew_production(pid) then raise exception 'Production video access denied';end if;
 select obs_connected,streaming,last_bridge_at into p from public.productions where id=pid;
 if not found then raise exception 'Production not found';end if;
 if not p.obs_connected or p.last_bridge_at is null or p.last_bridge_at<now()-interval '30 seconds' then
  return jsonb_build_object('available',false,'reason','OBS Bridge disconnected or stale');end if;
 if not p.streaming then return jsonb_build_object('available',false,'reason','OBS is not streaming');end if;
 select whep_url into media_url from public.production_media_settings where production_id=pid;
 if media_url is null then return jsonb_build_object('available',false,'reason','Secure WHEP program relay is not configured');end if;
 return jsonb_build_object('available',true,'url',media_url,'relay_auth_required',true);
end $$;
revoke all on function public.program_feed_access(uuid) from public,anon;
grant execute on function public.program_feed_access(uuid) to authenticated;

-- Crew video access is always revoked with existing phone pairing or director permission.
-- All old tables and production/camera data intentionally retained.

-- Atomic director camera wizard. Existing camera IDs and pairing links are retained.
create or replace function public.save_camera_assignment_31(pid uuid,cid uuid,cam_number integer,cam_name text,operator_name text,source_kind text,source_name text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare camera_id uuid:=cid; found_source jsonb; mapping uuid;
begin
 if not public.is_production_operator(pid) then raise exception 'Only directors or administrators can assign cameras';end if;
 if cam_number is null or cam_number<1 or cam_number>999 then raise exception 'Camera number must be 1 to 999';end if;
 if cam_name is null or length(btrim(cam_name)) not between 1 and 80 then raise exception 'Invalid camera name';end if;
 if length(coalesce(operator_name,''))>80 then raise exception 'Operator name too long';end if;
 if source_kind not in ('SOURCE','SCENE') or length(coalesce(source_name,'')) not between 1 and 150 then
  raise exception 'Select an OBS source or scene';end if;
 select src into found_source from public.productions p,
 lateral jsonb_array_elements(coalesce(p.obs_sources,'[]'::jsonb)) src
 where p.id=pid and src->>'kind'=source_kind and src->>'name'=source_name limit 1;
 if found_source is null then raise exception 'This OBS source was not discovered by the current Bridge';end if;
 if exists(select 1 from public.cameras c where c.production_id=pid and c.number=cam_number and (cid is null or c.id<>cid)) then
  raise exception 'Another camera already uses this number';end if;
 if cid is null then
  insert into public.cameras(production_id,number,name,cameraman,enabled)
  values(pid,cam_number,btrim(cam_name),coalesce(btrim(operator_name),''),true) returning id into camera_id;
 else
  update public.cameras set number=cam_number,name=btrim(cam_name),cameraman=coalesce(btrim(operator_name),''),updated_at=now()
  where id=cid and production_id=pid returning id into camera_id;
  if camera_id is null then raise exception 'Camera not in this production';end if;
 end if;
 select m.id into mapping from public.camera_mappings m where m.camera_id=camera_id and not m.excluded order by m.created_at limit 1 for update;
 if mapping is null then
  insert into public.camera_mappings(camera_id,kind,obs_name,obs_uuid,excluded)
  values(camera_id,source_kind,source_name,found_source->>'uuid',false);
 else
  update public.camera_mappings set kind=source_kind,obs_name=source_name,obs_uuid=found_source->>'uuid',excluded=false where id=mapping;
 end if;
 return camera_id;
end $$;
revoke all on function public.save_camera_assignment_31(uuid,uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.save_camera_assignment_31(uuid,uuid,integer,text,text,text,text) to authenticated;