-- Sekoly Family Portal, documents, workflow, and multi-school family hardening.

alter table public.sekoly_memberships
  drop constraint if exists sekoly_memberships_role_check;
alter table public.sekoly_memberships
  add constraint sekoly_memberships_role_check
  check (role in (
    'SCHOOL_ADMIN','DIRECTOR','SECRETARY','ACCOUNTANT','TEACHER','SUPERVISOR','PARENT'
  ));

create table if not exists public.sekoly_families (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  family_code text not null default upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10)),
  display_name text,
  address text,
  city text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','INACTIVE','ARCHIVED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (school_id, family_code)
);

create index if not exists sekoly_families_school_status_idx
  on public.sekoly_families(school_id, status);

create table if not exists public.sekoly_family_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  family_id uuid not null,
  guardian_id uuid not null,
  is_primary boolean not null default false,
  relationship text not null default 'GUARDIAN'
    check (relationship in ('FATHER','MOTHER','GUARDIAN','OTHER')),
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (family_id, guardian_id),
  constraint sekoly_family_guardians_family_fk
    foreign key (school_id, family_id)
    references public.sekoly_families(school_id, id)
    on delete cascade,
  constraint sekoly_family_guardians_guardian_fk
    foreign key (school_id, guardian_id)
    references public.sekoly_guardians(school_id, id)
    on delete cascade
);

create unique index if not exists sekoly_family_guardians_primary_uidx
  on public.sekoly_family_guardians(family_id)
  where is_primary = true;
create index if not exists sekoly_family_guardians_school_family_idx
  on public.sekoly_family_guardians(school_id, family_id);
create index if not exists sekoly_family_guardians_school_guardian_idx
  on public.sekoly_family_guardians(school_id, guardian_id);

create table if not exists public.sekoly_family_students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  family_id uuid not null,
  student_id uuid not null,
  relationship_label text default 'ENFANT',
  created_at timestamptz not null default now(),
  unique (school_id, id),
  unique (family_id, student_id),
  constraint sekoly_family_students_family_fk
    foreign key (school_id, family_id)
    references public.sekoly_families(school_id, id)
    on delete cascade,
  constraint sekoly_family_students_student_fk
    foreign key (school_id, student_id)
    references public.sekoly_students(school_id, id)
    on delete cascade
);

create index if not exists sekoly_family_students_school_family_idx
  on public.sekoly_family_students(school_id, family_id);
create index if not exists sekoly_family_students_school_student_idx
  on public.sekoly_family_students(school_id, student_id);

create table if not exists public.sekoly_family_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  family_id uuid not null,
  token_hash text not null unique,
  label text not null default 'Portail famille',
  expires_at timestamptz not null default (now() + interval '400 days'),
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  constraint sekoly_family_portal_tokens_family_fk
    foreign key (school_id, family_id)
    references public.sekoly_families(school_id, id)
    on delete cascade
);

create index if not exists sekoly_family_portal_tokens_school_family_idx
  on public.sekoly_family_portal_tokens(school_id, family_id);
create index if not exists sekoly_family_portal_tokens_active_idx
  on public.sekoly_family_portal_tokens(token_hash, expires_at)
  where revoked_at is null;

alter table public.sekoly_enrollment_families
  add column if not exists family_profile_id uuid;

alter table public.sekoly_enrollment_families
  drop constraint if exists sekoly_enrollment_families_family_profile_fk;
alter table public.sekoly_enrollment_families
  add constraint sekoly_enrollment_families_family_profile_fk
  foreign key (school_id, family_profile_id)
  references public.sekoly_families(school_id, id)
  on delete set null;

create index if not exists sekoly_enrollment_families_school_profile_idx
  on public.sekoly_enrollment_families(school_id, family_profile_id);

alter table public.sekoly_enrollment_applications
  drop constraint if exists sekoly_enrollment_applications_status_check;
alter table public.sekoly_enrollment_applications
  add constraint sekoly_enrollment_applications_status_check
  check (status in (
    'SUBMITTED',
    'TO_CONTACT',
    'CONTACTED',
    'APPOINTMENT_SCHEDULED',
    'INCOMPLETE',
    'COMPLETE',
    'ACCEPTED',
    'PAYMENT_PENDING',
    'APPROVED',
    'REJECTED',
    'WITHDRAWN'
  ));

alter table public.sekoly_enrollment_applications
  add column if not exists appointment_at timestamptz,
  add column if not exists decision_note text,
  add column if not exists payment_status text not null default 'NOT_REQUIRED',
  add column if not exists final_student_id uuid;

alter table public.sekoly_enrollment_applications
  drop constraint if exists sekoly_enrollment_applications_payment_status_check;
alter table public.sekoly_enrollment_applications
  add constraint sekoly_enrollment_applications_payment_status_check
  check (payment_status in ('NOT_REQUIRED','PENDING','PAID','WAIVED'));

alter table public.sekoly_enrollment_applications
  drop constraint if exists sekoly_enrollment_applications_final_student_fk;
alter table public.sekoly_enrollment_applications
  add constraint sekoly_enrollment_applications_final_student_fk
  foreign key (school_id, final_student_id)
  references public.sekoly_students(school_id, id)
  on delete set null;

create index if not exists sekoly_enrollment_apps_school_final_student_idx
  on public.sekoly_enrollment_applications(school_id, final_student_id);

create table if not exists public.sekoly_enrollment_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  family_id uuid not null,
  application_id uuid,
  guardian_id uuid,
  document_type text not null
    check (document_type in (
      'CIN_FATHER','CIN_MOTHER','CIN_GUARDIAN','BIRTH_CERTIFICATE',
      'RESIDENCE_CERTIFICATE','STUDENT_PHOTO','TRANSFER_CERTIFICATE',
      'REPORT_CARD','VACCINATION_RECORD','OTHER'
    )),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  status text not null default 'UPLOADED'
    check (status in ('UPLOADED','VERIFIED','REJECTED')),
  verification_note text,
  uploaded_by_family boolean not null default true,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  constraint sekoly_enrollment_documents_family_fk
    foreign key (school_id, family_id)
    references public.sekoly_families(school_id, id)
    on delete cascade,
  constraint sekoly_enrollment_documents_application_fk
    foreign key (school_id, application_id)
    references public.sekoly_enrollment_applications(school_id, id)
    on delete cascade,
  constraint sekoly_enrollment_documents_guardian_fk
    foreign key (school_id, guardian_id)
    references public.sekoly_guardians(school_id, id)
    on delete set null
);

create index if not exists sekoly_enrollment_documents_school_family_idx
  on public.sekoly_enrollment_documents(school_id, family_id, created_at desc);
create index if not exists sekoly_enrollment_documents_school_application_idx
  on public.sekoly_enrollment_documents(school_id, application_id, created_at desc);

create table if not exists public.sekoly_enrollment_checklist_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  application_id uuid not null,
  code text not null,
  label text not null,
  required boolean not null default true,
  status text not null default 'MISSING'
    check (status in ('MISSING','PROVIDED','VERIFIED','NOT_REQUIRED')),
  document_id uuid,
  note text,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now(),
  unique (school_id, id),
  unique (application_id, code),
  constraint sekoly_enrollment_checklist_application_fk
    foreign key (school_id, application_id)
    references public.sekoly_enrollment_applications(school_id, id)
    on delete cascade,
  constraint sekoly_enrollment_checklist_document_fk
    foreign key (school_id, document_id)
    references public.sekoly_enrollment_documents(school_id, id)
    on delete set null
);

create index if not exists sekoly_enrollment_checklist_school_application_idx
  on public.sekoly_enrollment_checklist_items(school_id, application_id, sort_order);

create table if not exists public.sekoly_enrollment_contacts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  application_id uuid not null,
  contact_type text not null
    check (contact_type in ('CALL','WHATSAPP','SMS','EMAIL','IN_PERSON','APPOINTMENT')),
  outcome text,
  note text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, id),
  constraint sekoly_enrollment_contacts_application_fk
    foreign key (school_id, application_id)
    references public.sekoly_enrollment_applications(school_id, id)
    on delete cascade
);

create index if not exists sekoly_enrollment_contacts_school_application_idx
  on public.sekoly_enrollment_contacts(school_id, application_id, created_at desc);
create index if not exists sekoly_enrollment_contacts_created_by_idx
  on public.sekoly_enrollment_contacts(created_by);

create or replace function sekoly_private.seed_enrollment_checklist()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.sekoly_enrollment_checklist_items
    (school_id, application_id, code, label, required, sort_order)
  values
    (new.school_id, new.id, 'BIRTH_CERTIFICATE', 'Acte de naissance', true, 10),
    (new.school_id, new.id, 'CIN_PRIMARY', 'CIN du responsable principal', true, 20),
    (new.school_id, new.id, 'STUDENT_PHOTO', 'Photo d’identité de l’élève', true, 30),
    (new.school_id, new.id, 'RESIDENCE', 'Justificatif de domicile / résidence', false, 40),
    (new.school_id, new.id, 'TRANSFER', 'Certificat de transfert', new.application_type = 'NEW', 50),
    (new.school_id, new.id, 'REPORT_CARD', 'Dernier bulletin scolaire', false, 60)
  on conflict (application_id, code) do nothing;
  return new;
end;
$$;

drop trigger if exists sekoly_seed_enrollment_checklist on public.sekoly_enrollment_applications;
create trigger sekoly_seed_enrollment_checklist
after insert on public.sekoly_enrollment_applications
for each row execute function sekoly_private.seed_enrollment_checklist();
revoke all on function sekoly_private.seed_enrollment_checklist() from public, anon, authenticated;

do $$
declare tbl text;
begin
  foreach tbl in array array['sekoly_families','sekoly_enrollment_documents','sekoly_enrollment_checklist_items']
  loop
    execute format('drop trigger if exists sekoly_touch_updated_at on public.%I', tbl);
    execute format('create trigger sekoly_touch_updated_at before update on public.%I for each row execute function sekoly_private.touch_updated_at()', tbl);
  end loop;
end $$;

alter table public.sekoly_families enable row level security;
alter table public.sekoly_family_guardians enable row level security;
alter table public.sekoly_family_students enable row level security;
alter table public.sekoly_family_portal_tokens enable row level security;
alter table public.sekoly_enrollment_documents enable row level security;
alter table public.sekoly_enrollment_checklist_items enable row level security;
alter table public.sekoly_enrollment_contacts enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['sekoly_families','sekoly_family_guardians','sekoly_family_students','sekoly_enrollment_documents','sekoly_enrollment_checklist_items','sekoly_enrollment_contacts']
  loop
    execute format('drop policy if exists %I on public.%I', 'sekoly family management read', tbl);
    execute format('create policy %I on public.%I for select to authenticated using (sekoly_private.has_role(school_id, array[''SCHOOL_ADMIN'',''DIRECTOR'',''SECRETARY'',''SUPERVISOR'']))', 'sekoly family management read', tbl);
    execute format('drop policy if exists %I on public.%I', 'sekoly family management insert', tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (sekoly_private.has_role(school_id, array[''SCHOOL_ADMIN'',''DIRECTOR'',''SECRETARY'']))', 'sekoly family management insert', tbl);
    execute format('drop policy if exists %I on public.%I', 'sekoly family management update', tbl);
    execute format('create policy %I on public.%I for update to authenticated using (sekoly_private.has_role(school_id, array[''SCHOOL_ADMIN'',''DIRECTOR'',''SECRETARY''])) with check (sekoly_private.has_role(school_id, array[''SCHOOL_ADMIN'',''DIRECTOR'',''SECRETARY'']))', 'sekoly family management update', tbl);
    execute format('drop policy if exists %I on public.%I', 'sekoly family management delete', tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (sekoly_private.has_role(school_id, array[''SCHOOL_ADMIN'',''DIRECTOR'',''SECRETARY'']))', 'sekoly family management delete', tbl);
  end loop;
end $$;

drop policy if exists "sekoly family tokens management read" on public.sekoly_family_portal_tokens;
create policy "sekoly family tokens management read"
on public.sekoly_family_portal_tokens for select to authenticated
using (sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']));

drop policy if exists "sekoly family tokens management delete" on public.sekoly_family_portal_tokens;
create policy "sekoly family tokens management delete"
on public.sekoly_family_portal_tokens for delete to authenticated
using (sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR']));

revoke all on table
  public.sekoly_families, public.sekoly_family_guardians, public.sekoly_family_students,
  public.sekoly_family_portal_tokens, public.sekoly_enrollment_documents,
  public.sekoly_enrollment_checklist_items, public.sekoly_enrollment_contacts
from anon;

grant select, insert, update, delete on table
  public.sekoly_families, public.sekoly_family_guardians, public.sekoly_family_students,
  public.sekoly_enrollment_documents, public.sekoly_enrollment_checklist_items,
  public.sekoly_enrollment_contacts
to authenticated;
grant select, delete on table public.sekoly_family_portal_tokens to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sekoly-enrollment-documents','sekoly-enrollment-documents',false,10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "sekoly enrollment documents staff read" on storage.objects;
create policy "sekoly enrollment documents staff read"
on storage.objects for select to authenticated
using (
  bucket_id='sekoly-enrollment-documents'
  and array_length(storage.foldername(name),1)>=1
  and sekoly_private.has_role(((storage.foldername(name))[1])::uuid,array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR'])
);

drop policy if exists "sekoly enrollment documents staff delete" on storage.objects;
create policy "sekoly enrollment documents staff delete"
on storage.objects for delete to authenticated
using (
  bucket_id='sekoly-enrollment-documents'
  and array_length(storage.foldername(name),1)>=1
  and sekoly_private.has_role(((storage.foldername(name))[1])::uuid,array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);

do $$
declare tbl text;
begin
  foreach tbl in array array['sekoly_families','sekoly_family_guardians','sekoly_family_students','sekoly_enrollment_documents','sekoly_enrollment_checklist_items','sekoly_enrollment_contacts']
  loop
    execute format('drop trigger if exists sekoly_auto_audit on public.%I',tbl);
    execute format('create trigger sekoly_auto_audit after insert or update or delete on public.%I for each row execute function sekoly_private.audit_school_change()',tbl);
  end loop;
end $$;
