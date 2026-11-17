
-- OBS TALLY PRO / BUMBI, additive operational features.
-- Leave existing cameras, pairing codes, bridge token, realtime policies untouched.
create or replace function public.is_paired_production_user(pid uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(
   select 1 from public.camera_devices d
   join public.cameras c on c.id=d.camera_id
   where c.production_id=pid and d.user_id=auth.uid()
     and d.revoked_at is null
 );
$$;

create or replace function public.can_access_crew_production(pid uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and (
   public.is_production_operator(pid) or public.is_paired_production_user(pid)
 );
$$;

create table if not exists public.operator_messages (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_kind text not null check(sender_kind in ('director','cameraman')),
  audience text not null check(audience in ('crew','directors')),
  target_camera_ids uuid[] not null default '{}'::uuid[],
  body text not null check(length(btrim(body)) between 1 and 500),
  quick_command boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ops_msgs_production_date_idx on public.operator_messages(production_id,created_at desc);
create index if not exists ops_msgs_sender_date_idx on public.operator_messages(sender_id,created_at desc);
alter table public.operator_messages enable row level security;
revoke all on public.operator_messages from anon,authenticated;
grant select on public.operator_messages to authenticated;

drop policy if exists ops_message_visible on public.operator_messages;
create policy ops_message_visible on public.operator_messages for select to authenticated
using (
  created_at > now()-interval '14 days' and
  (public.is_production_operator(production_id) or
    (public.is_paired_production_user(production_id) and (
      sender_id=auth.uid()
      or (audience='crew' and (
        cardinality(target_camera_ids)=0 or
        exists(select 1 from public.camera_devices d join public.cameras c on c.id=d.camera_id
          where d.user_id=auth.uid() and d.revoked_at is null and c.production_id=operator_messages.production_id
          and c.id=any(target_camera_ids))
      ))
    )))
);

create table if not exists public.operator_message_reads (
  message_id uuid not null references public.operator_messages(id) on delete cascade,
  reader_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(message_id,reader_id)
);
alter table public.operator_message_reads enable row level security;
revoke all on public.operator_message_reads from anon,authenticated;
grant select on public.operator_message_reads to authenticated;
drop policy if exists ops_reads_visible on public.operator_message_reads;
create policy ops_reads_visible on public.operator_message_reads for select to authenticated
using (reader_id=auth.uid() or exists(
 select 1 from public.operator_messages m where m.id=message_id
 and (m.sender_id=auth.uid() or public.is_production_operator(m.production_id))
));

create or replace function public.send_operator_message(
  pid uuid, recipient text, targets uuid[], message_text text, quick boolean default false
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); trimmed text:=btrim(message_text); mid uuid;
        who text; target uuid;
begin
 if uid is null then raise exception 'Sign-in required'; end if;
 if not public.can_access_crew_production(pid) then raise exception 'Production access denied'; end if;
 if trimmed is null or length(trimmed)<1 or length(trimmed)>500 then raise exception 'Message length must be 1 to 500'; end if;
 if recipient not in ('crew','directors') then raise exception 'Invalid audience'; end if;
 if cardinality(coalesce(targets,'{}'::uuid[]))>24 then raise exception 'Too many recipients'; end if;
 if recipient='crew' then
   if not public.is_production_operator(pid) then raise exception 'Only directors can message cameramen'; end if;
   if exists(select 1 from unnest(coalesce(targets,'{}'::uuid[])) t(id) where not exists(
      select 1 from public.cameras c where c.id=t.id and c.production_id=pid
   )) then raise exception 'Target camera not in this production'; end if;
   who:='director';
 else
   if cardinality(coalesce(targets,'{}'::uuid[]))>0 then raise exception 'Replies cannot target individual phones'; end if;
   who:=case when public.is_production_operator(pid) then 'director' else 'cameraman' end;
 end if;
 if (select count(*) from public.operator_messages
     where sender_id=uid and created_at>now()-interval '1 minute') >= 20 then
   raise exception 'Message rate limit exceeded; try again shortly';
 end if;
 insert into public.operator_messages(production_id,sender_id,sender_kind,audience,target_camera_ids,body,quick_command)
 values(pid,uid,who,recipient,coalesce(targets,'{}'::uuid[]),trimmed,quick) returning id into mid;
 return mid;
end $$;

create or replace function public.mark_operator_message_read(mid uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.operator_messages%rowtype; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Authentication required'; end if;
 select * into m from public.operator_messages where id=mid and created_at>now()-interval '14 days';
 if not found then raise exception 'Message not found'; end if;
 if not (
 public.is_production_operator(m.production_id)
 or (public.is_paired_production_user(m.production_id) and (
  m.sender_id=uid or (m.audience='crew' and (
  cardinality(m.target_camera_ids)=0 or
  exists(select 1 from public.camera_devices d join public.cameras c on c.id=d.camera_id
   where d.user_id=uid and d.revoked_at is null and c.production_id=m.production_id and c.id=any(m.target_camera_ids))
 ))))
 ) then raise exception 'Cannot read message'; end if;
 insert into public.operator_message_reads(message_id,reader_id) values(mid,uid)
 on conflict(message_id,reader_id) do nothing;
end $$;

create or replace function public.production_for_paired_camera(cid uuid)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare pid uuid;
begin
 if auth.uid() is null or not public.can_view_camera(cid) then raise exception 'Camera access denied'; end if;
 select production_id into pid from public.cameras where id=cid;
 if pid is null then raise exception 'Camera no longer exists';end if;
 return pid;
end $$;

create table if not exists public.camera_preview_assets(
  camera_id uuid primary key references public.cameras(id) on delete cascade,
  production_id uuid not null references public.productions(id) on delete cascade,
  updated_at timestamptz not null default now(),
  size_bytes int not null default 0 check(size_bytes between 0 and 150000)
);
alter table public.camera_preview_assets enable row level security;
revoke all on public.camera_preview_assets from anon,authenticated;
grant select on public.camera_preview_assets to authenticated;
drop policy if exists previews_visible on public.camera_preview_assets;
create policy previews_visible on public.camera_preview_assets for select to authenticated
using(public.can_access_crew_production(production_id));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tally-private-previews','tally-private-previews',false,150000,array['image/jpeg'])
on conflict (id) do update set public=false,file_size_limit=150000,allowed_mime_types=array['image/jpeg'];

drop policy if exists tally_preview_authenticated_read on storage.objects;
create policy tally_preview_authenticated_read on storage.objects
for select to authenticated
using (bucket_id='tally-private-previews' and exists (
 select 1 from public.cameras c where
 name=(c.production_id::text||'/'||c.id::text||'.jpg')
 and public.can_access_crew_production(c.production_id)
));

create or replace function public.crew_multiview_snapshot(pid uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.can_access_crew_production(pid) then raise exception 'Multiview access denied'; end if;
 select jsonb_build_object(
  'production_id',p.id, 'production_name',p.name,
  'bridge_online',p.obs_connected and p.last_bridge_at > now()-interval '30 seconds',
  'last_bridge_at',p.last_bridge_at,
  'cameras',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',c.id,'number',c.number,'name',c.name,'enabled',c.enabled,
      'state',case when p.obs_connected and p.last_bridge_at > now()-interval '30 seconds'
              then coalesce(t.state,'OFFLINE') else 'OFFLINE' end,
      'preview_at',a.updated_at
    ) order by c.number)
    from public.cameras c
    left join public.tally_states t on t.camera_id=c.id
    left join public.camera_preview_assets a on a.camera_id=c.id
    where c.production_id=pid and c.enabled
  ),'[]'::jsonb)
 ) into result from public.productions p where p.id=pid;
 return result;
end $$;

create or replace function public.crew_participants(pid uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.can_access_crew_production(pid) then raise exception 'Access denied'; end if;
 select jsonb_build_object(
  'directors',coalesce((
    select jsonb_agg(distinct uid) from (
      select created_by as uid from public.productions where id=pid
      union select user_id from public.production_members where production_id=pid and role in ('director','administrator')
    ) d
  ),'[]'::jsonb),
  'cameramen',case when public.is_production_operator(pid) then coalesce((
    select jsonb_agg(jsonb_build_object('user_id',d.user_id,'camera_id',c.id,'camera_name',c.name,'device_name',d.device_name))
    from public.camera_devices d join public.cameras c on c.id=d.camera_id
    where c.production_id=pid and d.revoked_at is null
  ),'[]'::jsonb) else '[]'::jsonb end
 ) into result;
 return result;
end $$;

create or replace function public.notify_crew_message()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 begin
  perform realtime.send(jsonb_build_object('id',new.id), 'message', 'ops:'||new.production_id::text, true);
 exception when others then null;
 end;
 return new;
end $$;
drop trigger if exists ops_messages_realtime_notify on public.operator_messages;
create trigger ops_messages_realtime_notify after insert on public.operator_messages
for each row execute function public.notify_crew_message();

-- No browser can send directly into the backend's private data tables.
revoke all on function public.is_paired_production_user(uuid) from public, anon;
revoke all on function public.can_access_crew_production(uuid) from public, anon;
revoke all on function public.send_operator_message(uuid,text,uuid[],text,boolean) from public,anon;
revoke all on function public.mark_operator_message_read(uuid) from public,anon;
revoke all on function public.production_for_paired_camera(uuid) from public,anon;
revoke all on function public.crew_multiview_snapshot(uuid) from public,anon;
revoke all on function public.crew_participants(uuid) from public,anon;
grant execute on function public.is_paired_production_user(uuid) to authenticated;
grant execute on function public.can_access_crew_production(uuid) to authenticated;
grant execute on function public.send_operator_message(uuid,text,uuid[],text,boolean) to authenticated;
grant execute on function public.mark_operator_message_read(uuid) to authenticated;
grant execute on function public.production_for_paired_camera(uuid) to authenticated;
grant execute on function public.crew_multiview_snapshot(uuid) to authenticated;
grant execute on function public.crew_participants(uuid) to authenticated;

create policy crew_ops_broadcast_receive on realtime.messages
for select to authenticated
using (
 extension='broadcast'
 and realtime.topic() ~ '^ops:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and public.can_access_crew_production(split_part(realtime.topic(),':',2)::uuid)
);