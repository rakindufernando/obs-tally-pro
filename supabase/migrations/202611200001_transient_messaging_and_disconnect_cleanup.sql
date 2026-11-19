-- OBS TALLY PRO v3.1.1 transient operator messaging and OBS disconnect cleanup.
-- Preserve all camera, pairing, tally, bridge and role records. Only messages are eligible for removal.
create or replace function public.delete_operator_message(mid uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.operator_messages%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into m from public.operator_messages where id=mid;
 if not found then return false;end if;
 if not (m.sender_id=auth.uid() or public.is_production_operator(m.production_id))
 then raise exception 'You cannot delete this message';end if;
 delete from public.operator_messages where id=mid;
 return true;
end $$;
revoke all on function public.delete_operator_message(uuid) from public,anon;
grant execute on function public.delete_operator_message(uuid) to authenticated;

create or replace function public.clear_operator_messages(pid uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare deleted_count integer;
begin
 if auth.uid() is null or not public.is_production_operator(pid)
 then raise exception 'Director or administrator permission required';end if;
 delete from public.operator_messages where production_id=pid;
 get diagnostics deleted_count = row_count;
 return deleted_count;
end $$;
revoke all on function public.clear_operator_messages(uuid) from public,anon;
grant execute on function public.clear_operator_messages(uuid) to authenticated;

-- Deletes are immediately broadcast to all authorized online clients.
create or replace function public.notify_crew_message_delete()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 begin
  perform realtime.send(jsonb_build_object('id',old.id), 'message', 'ops:'||old.production_id::text, true);
 exception when others then
  null; -- Polling fallback remains authoritative, including during Realtime outage.
 end;
 return old;
end $$;
revoke all on function public.notify_crew_message_delete() from public,anon,authenticated;
drop trigger if exists ops_messages_realtime_deleted on public.operator_messages;
create trigger ops_messages_realtime_deleted after delete on public.operator_messages
for each row execute function public.notify_crew_message_delete();

create or replace function public.bumbi_cleanup_operator_session()
returns bigint language plpgsql set search_path=public,pg_temp as $$
declare deleted_count bigint;
begin
 -- Short-lived messages by design; clear after an actual OBS disconnect or stale heartbeat.
 delete from public.operator_messages m
 where m.created_at < now()-interval '45 minutes'
    or exists (
      select 1 from public.productions p where p.id=m.production_id
      and (p.obs_connected is not true or p.last_bridge_at is null
           or p.last_bridge_at < now()-interval '90 seconds')
    );
 get diagnostics deleted_count = row_count;
 return deleted_count;
end $$;
revoke all on function public.bumbi_cleanup_operator_session() from public,anon,authenticated;

create or replace function public.bumbi_clear_messages_on_obs_disconnect()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 delete from public.operator_messages where production_id=new.id;
 return new;
end $$;
revoke all on function public.bumbi_clear_messages_on_obs_disconnect() from public,anon,authenticated;
drop trigger if exists bumbi_messages_obs_disconnect on public.productions;
create trigger bumbi_messages_obs_disconnect
after update of obs_connected on public.productions
for each row when (old.obs_connected is distinct from new.obs_connected and new.obs_connected is false)
execute function public.bumbi_clear_messages_on_obs_disconnect();

-- Replace the old hourly job, which referenced the retired crew_rtc_signals table.
select cron.schedule('bumbi_crew_retention_cleanup','* * * * *',
$$select public.bumbi_cleanup_operator_session();
delete from public.obs_scene_commands where created_at < now()-interval '24 hours';$$);

-- Do not expose messages from old OBS sessions to fresh cameraman logins.
drop policy if exists ops_message_visible on public.operator_messages;
create policy ops_message_visible on public.operator_messages for select to authenticated
using (
 created_at>now()-interval '45 minutes'
 and (public.is_production_operator(production_id)
  or (public.is_paired_production_user(production_id) and
   (sender_id=(select auth.uid()) or
    (audience='crew' and
     (cardinality(target_camera_ids)=0 or exists(
      select 1 from public.camera_devices d join public.cameras c on c.id=d.camera_id
      where d.user_id=(select auth.uid()) and d.revoked_at is null
       and c.production_id=operator_messages.production_id and c.id=any(target_camera_ids)
     ))))))
);

-- One-tap batch acknowledgement for the currently paired camera only.
create or replace function public.acknowledge_camera_messages(pid uuid,cid uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer;
begin
 if auth.uid() is null or not exists(
  select 1 from public.camera_devices d join public.cameras c on c.id=d.camera_id
  where d.user_id=auth.uid() and d.revoked_at is null and c.id=cid and c.production_id=pid
 ) then raise exception 'Camera pairing required';end if;
 insert into public.operator_message_reads(message_id,reader_id)
 select m.id,auth.uid() from public.operator_messages m
 where m.production_id=pid and m.audience='crew'
  and m.created_at>now()-interval '45 minutes'
  and (cardinality(m.target_camera_ids)=0 or cid=any(m.target_camera_ids))
 on conflict(message_id,reader_id) do nothing;
 get diagnostics affected=row_count;
 return affected;
end $$;
revoke all on function public.acknowledge_camera_messages(uuid,uuid) from public,anon;
grant execute on function public.acknowledge_camera_messages(uuid,uuid) to authenticated;
