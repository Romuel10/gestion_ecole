-- Synchronisation monitoring and automatic audit trail for Sekoly SaaS.

create table if not exists public.sekoly_sync_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  teacher_id uuid references public.sekoly_teachers(id) on delete set null,
  device_id text not null,
  platform text not null check (platform in ('ANDROID','IOS','WEB','DESKTOP')),
  event_type text not null check (
    event_type in (
      'APP_OPEN',
      'SYNC_START',
      'SYNC_SUCCESS',
      'SYNC_ERROR',
      'ATTENDANCE_SAVED',
      'SCORES_SAVED',
      'QUEUE_UPDATED'
    )
  ),
  status text not null default 'OK' check (status in ('OK','WARNING','ERROR')),
  queue_count integer not null default 0 check (queue_count >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists sekoly_sync_events_school_time_idx
  on public.sekoly_sync_events(school_id, occurred_at desc);

create index if not exists sekoly_sync_events_device_time_idx
  on public.sekoly_sync_events(school_id, device_id, occurred_at desc);

create index if not exists sekoly_sync_events_teacher_time_idx
  on public.sekoly_sync_events(teacher_id, occurred_at desc)
  where teacher_id is not null;

create index if not exists sekoly_sync_events_errors_idx
  on public.sekoly_sync_events(school_id, occurred_at desc)
  where status = 'ERROR';

alter table public.sekoly_sync_events enable row level security;

drop policy if exists "sekoly sync management read" on public.sekoly_sync_events;
create policy "sekoly sync management read"
on public.sekoly_sync_events for select
to authenticated
using (
  sekoly_private.has_role(
    sekoly_sync_events.school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SUPERVISOR']
  )
);

drop policy if exists "sekoly sync member insert" on public.sekoly_sync_events;
create policy "sekoly sync member insert"
on public.sekoly_sync_events for insert
to authenticated
with check (
  sekoly_sync_events.user_id = (select auth.uid())
  and sekoly_private.is_member(sekoly_sync_events.school_id)
  and (
    sekoly_sync_events.teacher_id is null
    or exists (
      select 1
      from public.sekoly_teachers t
      where t.id = sekoly_sync_events.teacher_id
        and t.school_id = sekoly_sync_events.school_id
        and t.user_id = (select auth.uid())
    )
  )
);

grant select, insert on public.sekoly_sync_events to authenticated;

create or replace function sekoly_private.audit_school_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_school_id uuid;
  v_entity_id uuid;
begin
  v_school_id := coalesce(new.school_id, old.school_id);
  v_entity_id := coalesce(new.id, old.id);

  insert into public.sekoly_audit_logs (
    school_id,
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_school_id,
    (select auth.uid()),
    tg_op,
    tg_table_name,
    v_entity_id,
    jsonb_build_object(
      'source', 'database_trigger',
      'operation', tg_op
    )
  );

  return coalesce(new, old);
end;
$$;

revoke all on function sekoly_private.audit_school_change()
from public, anon, authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'sekoly_enrollments',
    'sekoly_teachers',
    'sekoly_teacher_assignments',
    'sekoly_attendance_sessions',
    'sekoly_attendance_entries',
    'sekoly_assessments',
    'sekoly_assessment_scores'
  ]
  loop
    execute format('drop trigger if exists sekoly_auto_audit on public.%I', tbl);
    execute format(
      'create trigger sekoly_auto_audit after insert or update or delete on public.%I for each row execute function sekoly_private.audit_school_change()',
      tbl
    );
  end loop;
end $$;
