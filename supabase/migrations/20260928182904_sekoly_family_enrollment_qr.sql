-- Sekoly: dossier élève enrichi, familles multi-enfants et préinscriptions QR.

alter table public.sekoly_students
  add column if not exists neighborhood text,
  add column if not exists blood_type text,
  add column if not exists medical_notes text,
  add column if not exists previous_school text,
  add column if not exists birth_certificate_number text,
  add column if not exists birth_certificate_date date,
  add column if not exists birth_certificate_place text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.sekoly_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  last_name text not null,
  first_name text not null default '',
  phone_primary text,
  phone_secondary text,
  email text,
  cin_number text,
  cin_issued_at date,
  cin_issue_place text,
  occupation text,
  employer text,
  address text,
  city text,
  nationality text not null default 'Malgache',
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, user_id)
);

create unique index if not exists sekoly_guardians_school_cin_uidx
  on public.sekoly_guardians (school_id, upper(cin_number))
  where cin_number is not null and btrim(cin_number) <> '';

create index if not exists sekoly_guardians_school_phone_idx
  on public.sekoly_guardians (school_id, phone_primary);

create table if not exists public.sekoly_student_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null
    check (relationship in ('FATHER','MOTHER','GUARDIAN','OTHER')),
  is_primary boolean not null default false,
  has_legal_custody boolean not null default true,
  authorized_pickup boolean not null default true,
  emergency_priority smallint check (
    emergency_priority is null or emergency_priority between 1 and 9
  ),
  notes text,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (student_id, guardian_id),
  constraint sekoly_student_guardians_student_fk
    foreign key (school_id, student_id)
    references public.sekoly_students(school_id, id)
    on delete cascade,
  constraint sekoly_student_guardians_guardian_fk
    foreign key (school_id, guardian_id)
    references public.sekoly_guardians(school_id, id)
    on delete cascade
);

create unique index if not exists sekoly_student_guardians_primary_uidx
  on public.sekoly_student_guardians(student_id)
  where is_primary = true;

create index if not exists sekoly_student_guardians_guardian_idx
  on public.sekoly_student_guardians(guardian_id);

create table if not exists public.sekoly_enrollment_campaigns (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  school_year_id uuid not null,
  name text not null,
  public_code text not null default substring(replace(gen_random_uuid()::text, '-', '') from 1 for 20),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','OPEN','CLOSED')),
  allow_new_admission boolean not null default true,
  allow_re_registration boolean not null default true,
  instructions text,
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (public_code),
  unique (school_id, id),
  constraint sekoly_enrollment_campaign_year_fk
    foreign key (school_id, school_year_id)
    references public.sekoly_school_years(school_id, id)
    on delete cascade
);

create index if not exists sekoly_enrollment_campaigns_school_year_idx
  on public.sekoly_enrollment_campaigns(school_id, school_year_id, status);

create table if not exists public.sekoly_enrollment_families (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  campaign_id uuid not null,
  reference_code text not null default upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10)),
  guardian_last_name text not null,
  guardian_first_name text not null default '',
  relationship text not null default 'GUARDIAN'
    check (relationship in ('FATHER','MOTHER','GUARDIAN','OTHER')),
  phone_primary text not null,
  phone_secondary text,
  email text,
  cin_number text,
  cin_issued_at date,
  cin_issue_place text,
  occupation text,
  address text,
  city text,
  preferred_contact text not null default 'PHONE'
    check (preferred_contact in ('PHONE','SMS','EMAIL','WHATSAPP')),
  client_request_id uuid,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (campaign_id, reference_code),
  unique (campaign_id, client_request_id),
  constraint sekoly_enrollment_families_campaign_fk
    foreign key (school_id, campaign_id)
    references public.sekoly_enrollment_campaigns(school_id, id)
    on delete cascade
);

create index if not exists sekoly_enrollment_families_school_time_idx
  on public.sekoly_enrollment_families(school_id, submitted_at desc);

create table if not exists public.sekoly_enrollment_applications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  campaign_id uuid not null,
  family_id uuid not null,
  application_type text not null default 'NEW'
    check (application_type in ('NEW','RE_REGISTRATION')),
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED','CONTACTED','APPROVED','REJECTED','WITHDRAWN')),
  existing_matricule text,
  student_id uuid,
  desired_class_id uuid,
  child_last_name text not null,
  child_first_name text not null,
  child_gender text check (child_gender in ('M','F')),
  child_birth_date date,
  child_birth_place text,
  child_nationality text not null default 'Malgache',
  child_address text,
  child_neighborhood text,
  child_city text,
  previous_school text,
  birth_certificate_number text,
  birth_certificate_date date,
  birth_certificate_place text,
  blood_type text,
  medical_notes text,
  contact_note text,
  contacted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  constraint sekoly_enrollment_applications_campaign_fk
    foreign key (school_id, campaign_id)
    references public.sekoly_enrollment_campaigns(school_id, id)
    on delete cascade,
  constraint sekoly_enrollment_applications_family_fk
    foreign key (school_id, family_id)
    references public.sekoly_enrollment_families(school_id, id)
    on delete cascade,
  constraint sekoly_enrollment_applications_student_fk
    foreign key (school_id, student_id)
    references public.sekoly_students(school_id, id)
    on delete set null,
  constraint sekoly_enrollment_applications_class_fk
    foreign key (school_id, desired_class_id)
    references public.sekoly_classes(school_id, id)
    on delete set null
);

create index if not exists sekoly_enrollment_applications_queue_idx
  on public.sekoly_enrollment_applications(school_id, status, created_at desc);

create index if not exists sekoly_enrollment_applications_family_idx
  on public.sekoly_enrollment_applications(family_id, created_at);

create or replace function sekoly_private.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function sekoly_private.touch_updated_at()
from public, anon, authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'sekoly_guardians',
    'sekoly_enrollment_campaigns',
    'sekoly_enrollment_families',
    'sekoly_enrollment_applications'
  ]
  loop
    execute format('drop trigger if exists sekoly_touch_updated_at on public.%I', tbl);
    execute format(
      'create trigger sekoly_touch_updated_at before update on public.%I for each row execute function sekoly_private.touch_updated_at()',
      tbl
    );
  end loop;
end $$;

alter table public.sekoly_guardians enable row level security;
alter table public.sekoly_student_guardians enable row level security;
alter table public.sekoly_enrollment_campaigns enable row level security;
alter table public.sekoly_enrollment_families enable row level security;
alter table public.sekoly_enrollment_applications enable row level security;

drop policy if exists "sekoly guardians management read" on public.sekoly_guardians;
create policy "sekoly guardians management read"
on public.sekoly_guardians for select to authenticated
using (
  user_id = (select auth.uid())
  or sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR']
  )
);

drop policy if exists "sekoly guardians management write" on public.sekoly_guardians;
create policy "sekoly guardians management write"
on public.sekoly_guardians for all to authenticated
using (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
)
with check (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
);

drop policy if exists "sekoly student guardians management read" on public.sekoly_student_guardians;
create policy "sekoly student guardians management read"
on public.sekoly_student_guardians for select to authenticated
using (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR']
  )
  or exists (
    select 1
    from public.sekoly_guardians g
    where g.id = guardian_id
      and g.school_id = sekoly_student_guardians.school_id
      and g.user_id = (select auth.uid())
  )
);

drop policy if exists "sekoly student guardians management write" on public.sekoly_student_guardians;
create policy "sekoly student guardians management write"
on public.sekoly_student_guardians for all to authenticated
using (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
)
with check (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
);

drop policy if exists "sekoly enrollment campaigns management read" on public.sekoly_enrollment_campaigns;
create policy "sekoly enrollment campaigns management read"
on public.sekoly_enrollment_campaigns for select to authenticated
using (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR']
  )
);

drop policy if exists "sekoly enrollment campaigns management write" on public.sekoly_enrollment_campaigns;
create policy "sekoly enrollment campaigns management write"
on public.sekoly_enrollment_campaigns for all to authenticated
using (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
)
with check (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
);

drop policy if exists "sekoly enrollment families management read" on public.sekoly_enrollment_families;
create policy "sekoly enrollment families management read"
on public.sekoly_enrollment_families for select to authenticated
using (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR']
  )
);

drop policy if exists "sekoly enrollment families management write" on public.sekoly_enrollment_families;
create policy "sekoly enrollment families management write"
on public.sekoly_enrollment_families for all to authenticated
using (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
)
with check (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
);

drop policy if exists "sekoly enrollment applications management read" on public.sekoly_enrollment_applications;
create policy "sekoly enrollment applications management read"
on public.sekoly_enrollment_applications for select to authenticated
using (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR']
  )
);

drop policy if exists "sekoly enrollment applications management write" on public.sekoly_enrollment_applications;
create policy "sekoly enrollment applications management write"
on public.sekoly_enrollment_applications for all to authenticated
using (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
)
with check (
  sekoly_private.has_role(
    school_id,
    array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']
  )
);

revoke all on table
  public.sekoly_guardians,
  public.sekoly_student_guardians,
  public.sekoly_enrollment_campaigns,
  public.sekoly_enrollment_families,
  public.sekoly_enrollment_applications
from anon;

grant select, insert, update, delete on table
  public.sekoly_guardians,
  public.sekoly_student_guardians,
  public.sekoly_enrollment_campaigns,
  public.sekoly_enrollment_families,
  public.sekoly_enrollment_applications
to authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'sekoly_guardians',
    'sekoly_student_guardians',
    'sekoly_enrollment_campaigns',
    'sekoly_enrollment_families',
    'sekoly_enrollment_applications'
  ]
  loop
    execute format('drop trigger if exists sekoly_auto_audit on public.%I', tbl);
    execute format(
      'create trigger sekoly_auto_audit after insert or update or delete on public.%I for each row execute function sekoly_private.audit_school_change()',
      tbl
    );
  end loop;
end $$;
