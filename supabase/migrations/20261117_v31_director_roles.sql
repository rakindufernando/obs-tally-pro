-- Strict director-only viewing and calling authorization.
-- Existing administrator accounts retain administrative operations and OBS mapping controls.
create or replace function public.is_production_director(pid uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.role='director'
 ) and exists(select 1 from public.production_members m
  where m.production_id=pid and m.user_id=auth.uid() and m.role='director');
$$;
revoke all on function public.is_production_director(uuid) from public,anon;
grant execute on function public.is_production_director(uuid) to authenticated;

create or replace function public.crew_multiview_snapshot(pid uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.is_production_director(pid) then raise exception 'Authorized director account required'; end if;
 select jsonb_build_object('production_id',p.id,'production_name',p.name,
 'bridge_online',p.obs_connected and p.last_bridge_at>now()-interval '30 seconds',
 'last_bridge_at',p.last_bridge_at,
 'cameras',coalesce((select jsonb_agg(jsonb_build_object(
  'id',c.id,'number',c.number,'name',c.name,'enabled',c.enabled,
  'state',case when p.obs_connected and p.last_bridge_at>now()-interval '30 seconds'
   then coalesce(t.state,'OFFLINE') else 'OFFLINE' end,
  'preview_at',case when a.updated_at>now()-interval '45 seconds' then a.updated_at else null end,
  'devices_online',(select count(*) from public.camera_devices d where d.camera_id=c.id and d.revoked_at is null and d.last_seen_at>now()-interval '90 seconds')) order by c.number)
  from public.cameras c left join public.tally_states t on t.camera_id=c.id
  left join public.camera_preview_assets a on a.camera_id=c.id
  where c.production_id=pid and c.enabled),'[]'::jsonb)
 ) into result from public.productions p where p.id=pid;
 return result;
end $$;

drop policy if exists tally_preview_authenticated_read on storage.objects;
create policy tally_preview_authenticated_read on storage.objects for select to authenticated
using(bucket_id='tally-private-previews' and exists(
 select 1 from public.cameras c
 where storage.objects.name=c.production_id::text||'/'||c.id::text||'.jpg'
 and public.is_production_director(c.production_id)));
drop policy if exists previews_visible on public.camera_preview_assets;
create policy previews_visible on public.camera_preview_assets for select to authenticated
using(public.is_production_director(production_id));

-- Director accounts must be provisioned as Supabase Auth users and assigned to a production
-- by an administrator. No admin can silently self-promote through browser metadata.
create or replace function public.assign_production_director_31(pid uuid, director_email text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid;
begin
 if not public.is_global_admin() then raise exception 'Administrator required';end if;
 if director_email is null or length(btrim(director_email))>254 then raise exception 'Invalid director email';end if;
 select a.id into uid from auth.users a join public.profiles p on p.id=a.id
 where lower(a.email)=lower(btrim(director_email)) and p.role='director' limit 1;
 if uid is null then raise exception 'Director account not found. Create it in Supabase Authentication and set its profile role to director first';end if;
 insert into public.production_members(production_id,user_id,role) values(pid,uid,'director')
 on conflict(production_id,user_id) do update set role='director';
 return uid;
end $$;
revoke all on function public.assign_production_director_31(uuid,text) from public,anon;
grant execute on function public.assign_production_director_31(uuid,text) to authenticated;