create schema if not exists sekoly_private;
revoke all on schema sekoly_private from public, anon;
grant usage on schema sekoly_private to authenticated;

create table if not exists public.sekoly_schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  acronym text,
  country_code text not null default 'MG',
  city text,
  address text,
  phone text,
  email text,
  logo_url text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','SUSPENDED','ARCHIVED')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sekoly_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in (
      'SCHOOL_ADMIN','DIRECTOR','SECRETARY','ACCOUNTANT','TEACHER','SUPERVISOR'
    )),
  status text not null default 'ACTIVE'
    check (status in ('INVITED','ACTIVE','SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create index if not exists sekoly_memberships_user_idx
  on public.sekoly_memberships(user_id, status);
create index if not exists sekoly_memberships_school_idx
  on public.sekoly_memberships(school_id, status);

create or replace function sekoly_private.is_member(p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sekoly_memberships m
    where m.school_id = p_school_id
      and m.user_id = (select auth.uid())
      and m.status = 'ACTIVE'
  );
$$;

create or replace function sekoly_private.has_role(p_school_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sekoly_memberships m
    where m.school_id = p_school_id
      and m.user_id = (select auth.uid())
      and m.status = 'ACTIVE'
      and m.role = any(p_roles)
  );
$$;

revoke all on function sekoly_private.is_member(uuid) from public, anon;
revoke all on function sekoly_private.has_role(uuid, text[]) from public, anon;
grant execute on function sekoly_private.is_member(uuid) to authenticated;
grant execute on function sekoly_private.has_role(uuid, text[]) to authenticated;

alter table public.sekoly_schools enable row level security;
alter table public.sekoly_memberships enable row level security;
drop policy if exists "sekoly schools members read" on public.sekoly_schools;
drop policy if exists "sekoly schools admins update" on public.sekoly_schools;
drop policy if exists "sekoly memberships self or admin read" on public.sekoly_memberships;
drop policy if exists "sekoly memberships admins insert" on public.sekoly_memberships;
drop policy if exists "sekoly memberships admins update" on public.sekoly_memberships;
drop policy if exists "sekoly memberships admins delete" on public.sekoly_memberships;

create policy "sekoly schools members read"
on public.sekoly_schools for select
to authenticated
using (sekoly_private.is_member(id));

create policy "sekoly schools admins update"
on public.sekoly_schools for update
to authenticated
using (sekoly_private.has_role(id, array['SCHOOL_ADMIN','DIRECTOR']))
with check (sekoly_private.has_role(id, array['SCHOOL_ADMIN','DIRECTOR']));

create policy "sekoly memberships self or admin read"
on public.sekoly_memberships for select
to authenticated
using (
  user_id = (select auth.uid())
  or sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR'])
);

create policy "sekoly memberships admins insert"
on public.sekoly_memberships for insert
to authenticated
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR'])
);

create policy "sekoly memberships admins update"
on public.sekoly_memberships for update
to authenticated
using (sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR']))
with check (sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR']));

create policy "sekoly memberships admins delete"
on public.sekoly_memberships for delete
to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN'])
  and user_id <> (select auth.uid())
);

revoke all on public.sekoly_schools from anon;
revoke all on public.sekoly_memberships from anon;
grant select, update on public.sekoly_schools to authenticated;
grant select, insert, update, delete on public.sekoly_memberships to authenticated;
