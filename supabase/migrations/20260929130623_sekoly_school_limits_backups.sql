-- Sekoly multi-school scale controls: quotas, backup registry, and private backup storage.

create table if not exists public.sekoly_school_limits (
  school_id uuid primary key references public.sekoly_schools(id) on delete cascade,
  plan_code text not null default 'PILOT'
    check (plan_code in ('PILOT','STANDARD','PRO','ENTERPRISE')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','SUSPENDED')),
  max_students integer not null default 5000 check (max_students > 0),
  max_teachers integer not null default 500 check (max_teachers > 0),
  max_families integer not null default 5000 check (max_families > 0),
  max_document_bytes bigint not null default 5368709120 check (max_document_bytes > 0),
  backup_retention_days integer not null default 30 check (backup_retention_days between 1 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sekoly_school_limits (school_id)
select id from public.sekoly_schools
on conflict (school_id) do nothing;

create or replace function sekoly_private.ensure_school_limits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.sekoly_school_limits (school_id)
  values (new.id)
  on conflict (school_id) do nothing;
  return new;
end;
$$;

drop trigger if exists sekoly_ensure_school_limits on public.sekoly_schools;
create trigger sekoly_ensure_school_limits
after insert on public.sekoly_schools
for each row execute function sekoly_private.ensure_school_limits();

revoke all on function sekoly_private.ensure_school_limits()
from public, anon, authenticated;

create or replace function sekoly_private.enforce_student_quota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare quota integer; current_count integer;
begin
  select max_students into quota
  from public.sekoly_school_limits
  where school_id = new.school_id and status = 'ACTIVE';
  if quota is null then return new; end if;
  select count(*) into current_count from public.sekoly_students where school_id = new.school_id;
  if current_count >= quota then
    raise exception 'Quota élèves atteint pour cet établissement (%).', quota using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function sekoly_private.enforce_teacher_quota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare quota integer; current_count integer;
begin
  select max_teachers into quota
  from public.sekoly_school_limits
  where school_id = new.school_id and status = 'ACTIVE';
  if quota is null then return new; end if;
  select count(*) into current_count from public.sekoly_teachers where school_id = new.school_id;
  if current_count >= quota then
    raise exception 'Quota enseignants atteint pour cet établissement (%).', quota using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function sekoly_private.enforce_family_quota()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare quota integer; current_count integer;
begin
  select max_families into quota
  from public.sekoly_school_limits
  where school_id = new.school_id and status = 'ACTIVE';
  if quota is null then return new; end if;
  select count(*) into current_count
  from public.sekoly_families
  where school_id = new.school_id and status <> 'ARCHIVED';
  if current_count >= quota then
    raise exception 'Quota familles atteint pour cet établissement (%).', quota using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists sekoly_enforce_student_quota on public.sekoly_students;
create trigger sekoly_enforce_student_quota
before insert on public.sekoly_students
for each row execute function sekoly_private.enforce_student_quota();

drop trigger if exists sekoly_enforce_teacher_quota on public.sekoly_teachers;
create trigger sekoly_enforce_teacher_quota
before insert on public.sekoly_teachers
for each row execute function sekoly_private.enforce_teacher_quota();

drop trigger if exists sekoly_enforce_family_quota on public.sekoly_families;
create trigger sekoly_enforce_family_quota
before insert on public.sekoly_families
for each row execute function sekoly_private.enforce_family_quota();

revoke all on function sekoly_private.enforce_student_quota()
from public, anon, authenticated;
revoke all on function sekoly_private.enforce_teacher_quota()
from public, anon, authenticated;
revoke all on function sekoly_private.enforce_family_quota()
from public, anon, authenticated;

create table if not exists public.sekoly_school_backups (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  backup_type text not null default 'AUTOMATIC'
    check (backup_type in ('AUTOMATIC','MANUAL')),
  status text not null default 'READY'
    check (status in ('CREATING','READY','FAILED','EXPIRED')),
  storage_path text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  row_counts jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (school_id, id),
  unique (storage_path)
);

create index if not exists sekoly_school_backups_school_time_idx
  on public.sekoly_school_backups(school_id, created_at desc);
create index if not exists sekoly_school_backups_expiry_idx
  on public.sekoly_school_backups(expires_at)
  where status = 'READY';

alter table public.sekoly_school_limits enable row level security;
alter table public.sekoly_school_backups enable row level security;

drop policy if exists "sekoly school limits admin read" on public.sekoly_school_limits;
create policy "sekoly school limits admin read"
on public.sekoly_school_limits for select to authenticated
using (sekoly_private.has_role(school_id,array['SCHOOL_ADMIN','DIRECTOR']));

drop policy if exists "sekoly school backups admin read" on public.sekoly_school_backups;
create policy "sekoly school backups admin read"
on public.sekoly_school_backups for select to authenticated
using (sekoly_private.has_role(school_id,array['SCHOOL_ADMIN','DIRECTOR']));

drop policy if exists "sekoly school backups admin delete" on public.sekoly_school_backups;
create policy "sekoly school backups admin delete"
on public.sekoly_school_backups for delete to authenticated
using (sekoly_private.has_role(school_id,array['SCHOOL_ADMIN','DIRECTOR']));

revoke all on public.sekoly_school_limits from anon, authenticated;
revoke all on public.sekoly_school_backups from anon;
grant select on public.sekoly_school_limits to authenticated;
grant select, delete on public.sekoly_school_backups to authenticated;

do $$
declare tbl text;
begin
  foreach tbl in array array['sekoly_school_limits','sekoly_school_backups']
  loop
    execute format('drop trigger if exists sekoly_auto_audit on public.%I', tbl);
    execute format(
      'create trigger sekoly_auto_audit after insert or update or delete on public.%I for each row execute function sekoly_private.audit_school_change()',
      tbl
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sekoly-school-backups','sekoly-school-backups',false,104857600,
  array['application/gzip','application/json','application/octet-stream']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "sekoly school backups storage read" on storage.objects;
create policy "sekoly school backups storage read"
on storage.objects for select to authenticated
using (
  bucket_id='sekoly-school-backups'
  and array_length(storage.foldername(name),1)>=1
  and sekoly_private.has_role(((storage.foldername(name))[1])::uuid,array['SCHOOL_ADMIN','DIRECTOR'])
);

drop policy if exists "sekoly school backups storage delete" on storage.objects;
create policy "sekoly school backups storage delete"
on storage.objects for delete to authenticated
using (
  bucket_id='sekoly-school-backups'
  and array_length(storage.foldername(name),1)>=1
  and sekoly_private.has_role(((storage.foldername(name))[1])::uuid,array['SCHOOL_ADMIN','DIRECTOR'])
);
