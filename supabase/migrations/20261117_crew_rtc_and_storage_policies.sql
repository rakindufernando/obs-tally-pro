
-- Fix private preview read permissions and add time-limited one-to-one WebRTC signaling.
drop policy if exists tally_preview_authenticated_read on storage.objects;
create policy tally_preview_authenticated_read on storage.objects for select to authenticated
using(
 bucket_id='tally-private-previews'
 and exists (
   select 1 from public.cameras c
   where storage.objects.name = c.production_id::text||'/'||c.id::text||'.jpg'
     and public.can_view_camera(c.id)
 )
);
drop policy if exists previews_visible on public.camera_preview_assets;
create policy previews_visible on public.camera_preview_assets for select to authenticated
using(public.can_view_camera(camera_id));

create table if not exists public.crew_rtc_signals(
 id bigint generated always as identity primary key,
 production_id uuid not null references public.productions(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 receiver_id uuid not null references auth.users(id) on delete cascade,
 call_id uuid not null,
 kind text not null check(kind in ('offer','answer','ice','hangup')),
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists crew_rtc_receiver_idx on public.crew_rtc_signals(receiver_id,created_at desc);
alter table public.crew_rtc_signals enable row level security;
revoke all on public.crew_rtc_signals from public, anon, authenticated;
grant select on public.crew_rtc_signals to authenticated;
drop policy if exists crew_rtc_receive on public.crew_rtc_signals;
create policy crew_rtc_receive on public.crew_rtc_signals for select to authenticated
using(receiver_id=auth.uid() and created_at>now()-interval '4 minutes' and public.can_access_crew_production(production_id));

create or replace function public.send_crew_rtc_signal(pid uuid, receiver uuid, session_id uuid, signal_type text, signal_body jsonb)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare sender uuid:=auth.uid(); signal_id bigint; sender_dir boolean; receiver_dir boolean; receiver_paired boolean;
begin
 if sender is null or receiver is null or sender=receiver or session_id is null then raise exception 'Invalid signaling participants'; end if;
 if not public.can_access_crew_production(pid) then raise exception 'Production access denied'; end if;
 if signal_type not in ('offer','answer','ice','hangup') then raise exception 'Invalid signal type'; end if;
 if signal_body is null or jsonb_typeof(signal_body)<>'object' or pg_column_size(signal_body)>16000
 then raise exception 'Invalid signaling payload'; end if;
 sender_dir:=public.is_production_operator(pid);
 receiver_dir:=exists(select 1 from public.productions p where p.id=pid and p.created_by=receiver)
  or exists(select 1 from public.production_members m where m.production_id=pid and m.user_id=receiver and m.role in ('director','administrator'))
  or exists(select 1 from public.profiles p where p.id=receiver and p.role='administrator');
 receiver_paired:=exists(select 1 from public.camera_devices d join public.cameras c on c.id=d.camera_id
 where c.production_id=pid and d.user_id=receiver and d.revoked_at is null);
 if not ((sender_dir and receiver_paired) or (not sender_dir and receiver_dir))
 then raise exception 'Talkback recipient not permitted'; end if;
 if (select count(*) from public.crew_rtc_signals where sender_id=sender and created_at>now()-interval '1 minute')>=180
 then raise exception 'Too many signaling messages'; end if;
 insert into public.crew_rtc_signals(production_id,sender_id,receiver_id,call_id,kind,payload)
 values(pid,sender,receiver,session_id,signal_type,signal_body) returning id into signal_id;
 return signal_id;
end $$;
revoke all on function public.send_crew_rtc_signal(uuid,uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.send_crew_rtc_signal(uuid,uuid,uuid,text,jsonb) to authenticated;