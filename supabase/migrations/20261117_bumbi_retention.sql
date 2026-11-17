create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('bumbi_crew_retention_cleanup','13 * * * *',
$$delete from public.crew_rtc_signals where created_at<now()-interval '15 minutes'; delete from public.operator_messages where created_at<now()-interval '14 days';delete from public.obs_scene_commands where created_at<now()-interval '24 hours';$$);
revoke all on function public.notify_crew_message() from public,anon,authenticated;