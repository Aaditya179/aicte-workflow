-- Realtime alerts: stream new notification rows to the signed-in user's browser.
-- Realtime applies the existing RLS policy ("Notifications user isolation": user_id = auth.uid()),
-- so each user only receives their own rows.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc);
