-- OBS TALLY PRO v3.1 director-only continuous camera video.
-- Does not modify camera ids, pairing links, bridge credentials or existing media settings.
create table if not exists public.director_camera_media (
 camera_id uuid primary key references public.cameras(id) on delete cascade,
 production_id uuid not null references public.productions(id) on delete cascade,
 whep_url text not null,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 constraint director_camera_media_https check(
  whep_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?/camera-[0-9a-f-]{36}/whep$')
);
create index if not exists director_camera_media_production on public.director_camera_media(production_id);
alter table public.director_camera_media enable row level security;
revoke all on public.director_camera_media from public,anon,authenticated;
grant select,insert,update,delete on public.director_camera_media to authenticated;
drop policy if exists director_camera_media_read on public.director_camera_media;
create policy director_camera_media_read on public.director_camera_media for select to authenticated
using(public.is_production_director(production_id));
drop policy if exists director_camera_media_write on public.director_camera_media;
create policy director_camera_media_write on public.director_camera_media for all to authenticated
using(public.is_production_director(production_id))
with check(
 public.is_production_director(production_id) and updated_by=(select auth.uid())
 and whep_url like '%/camera-'||camera_id::text||'/whep'
 and exists(select 1 from public.cameras c where c.id=camera_id and c.production_id=director_camera_media.production_id)
);
create or replace function public.director_camera_feed_access(pid uuid,cid uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare media_url text; bridge_ok boolean;
begin
 if not public.is_production_director(pid) then raise exception 'Director-only camera video access denied';end if;
 if not exists(select 1 from public.cameras where id=cid and production_id=pid and enabled=true)
 then raise exception 'Camera is not assigned to this production';end if;
 select (p.obs_connected and p.last_bridge_at>now()-interval '30 seconds') into bridge_ok
 from public.productions p where p.id=pid;
 if not coalesce(bridge_ok,false) then return jsonb_build_object('available',false,'reason','OBS Bridge is disconnected or stale');end if;
 select whep_url into media_url from public.director_camera_media where production_id=pid and camera_id=cid;
 if media_url is null then return jsonb_build_object('available',false,'reason','Continuous camera video publisher and HTTPS WHEP relay are not configured');end if;
 return jsonb_build_object('available',true,'url',media_url,'relay_auth_required',true);
end $$;
revoke all on function public.director_camera_feed_access(uuid,uuid) from public,anon;
grant execute on function public.director_camera_feed_access(uuid,uuid) to authenticated;

-- Director and cameraman messages are durable through database rows and read receipts.
-- Direct messages stay visible only to the assigned cameraman.
drop policy if exists ops_message_visible on public.operator_messages;
create policy ops_message_visible on public.operator_messages for select to authenticated
using (
 created_at>now()-interval '14 days'
 and (
  public.is_production_operator(production_id)
  or (
   public.is_paired_production_user(production_id)
   and (
    sender_id=(select auth.uid())
    or (audience='crew' and (
     cardinality(target_camera_ids)=0
     or exists(
      select 1 from public.camera_devices d join public.cameras c on c.id=d.camera_id
      where d.user_id=(select auth.uid()) and d.revoked_at is null
       and c.production_id=operator_messages.production_id and c.id=any(target_camera_ids)
     )
    ))
   )
  )
 )
);
-- Retire voice call signalling. No other database objects are deleted.
revoke all on function public.send_crew_rtc_signal(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
drop function if exists public.send_crew_rtc_signal(uuid,uuid,uuid,text,jsonb);
-- Former participant listing existed exclusively for voice talkback.
drop function if exists public.crew_participants(uuid);
drop policy if exists crew_rtc_receive on public.crew_rtc_signals;
revoke all on public.crew_rtc_signals from public,anon,authenticated;
-- Remove stale call signalling records only. This table contains no operator messages or OBS configuration.
drop table if exists public.crew_rtc_signals;
