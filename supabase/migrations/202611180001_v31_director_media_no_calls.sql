-- OBS TALLY PRO v3.1 voice/talkback retirement.
-- Apply only after 202611180000_v31_prepare_camera_media.sql and coordinated web cutover.
-- No camera, tally, bridge, pairing, or operator text message records are deleted.

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
