create index if not exists sekoly_sync_events_user_idx
  on public.sekoly_sync_events(user_id, occurred_at desc);
