create table if not exists public.sekoly_school_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'PLANNED'
    check (status in ('PLANNED','ACTIVE','CLOSED')),
  created_at timestamptz not null default now(),
  unique (school_id, label)
);

create table if not exists public.sekoly_terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  school_year_id uuid not null references public.sekoly_school_years(id) on delete cascade,
  code text not null,
  label text not null,
  start_date date not null,
  end_date date not null,
  weight numeric(8,3) not null default 1,
  is_locked boolean not null default false,
  unique (school_year_id, code)
);

create table if not exists public.sekoly_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  code text not null,
  name text not null,
  category text,
  default_coefficient numeric(8,3) not null default 1,
  color text,
  created_at timestamptz not null default now(),
  unique (school_id, code)
);

create table if not exists public.sekoly_classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  school_year_id uuid not null references public.sekoly_school_years(id) on delete cascade,
  code text not null,
  name text not null,
  level text,
  series text,
  room text,
  capacity integer not null default 40 check (capacity > 0),
  next_class_id uuid references public.sekoly_classes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, school_year_id, code)
);

create table if not exists public.sekoly_students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  matricule text not null,
  last_name text not null,
  first_name text not null,
  gender text check (gender in ('M','F')),
  birth_date date,
  birth_place text,
  nationality text default 'Malgache',
  address text,
  city text,
  emergency_contact text,
  emergency_phone text,
  photo_url text,
  created_at timestamptz not null default now(),
  unique (school_id, matricule)
);

create table if not exists public.sekoly_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  student_id uuid not null references public.sekoly_students(id) on delete cascade,
  school_year_id uuid not null references public.sekoly_school_years(id) on delete cascade,
  class_id uuid not null references public.sekoly_classes(id) on delete restrict,
  status text not null default 'ENROLLED'
    check (status in ('PENDING','ENROLLED','TRANSFERRED','DROPPED','COMPLETED')),
  enrolled_at date not null default current_date,
  final_decision text,
  unique (student_id, school_year_id)
);

create table if not exists public.sekoly_teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  matricule text,
  last_name text not null,
  first_name text not null,
  phone text,
  email text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  unique (school_id, matricule),
  unique (school_id, user_id)
);

create table if not exists public.sekoly_class_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  class_id uuid not null references public.sekoly_classes(id) on delete cascade,
  subject_id uuid not null references public.sekoly_subjects(id) on delete cascade,
  teacher_id uuid references public.sekoly_teachers(id) on delete set null,
  coefficient numeric(8,3) not null default 1,
  weekly_hours numeric(8,2) not null default 2,
  unique (class_id, subject_id)
);

create table if not exists public.sekoly_teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  school_year_id uuid not null references public.sekoly_school_years(id) on delete cascade,
  teacher_id uuid not null references public.sekoly_teachers(id) on delete cascade,
  class_id uuid not null references public.sekoly_classes(id) on delete cascade,
  subject_id uuid not null references public.sekoly_subjects(id) on delete cascade,
  weekly_hours numeric(8,2) not null default 2,
  active boolean not null default true,
  unique (teacher_id, class_id, subject_id, school_year_id)
);

create table if not exists public.sekoly_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  school_year_id uuid not null references public.sekoly_school_years(id) on delete cascade,
  class_id uuid not null references public.sekoly_classes(id) on delete cascade,
  subject_id uuid references public.sekoly_subjects(id) on delete set null,
  teacher_id uuid not null references public.sekoly_teachers(id) on delete restrict,
  session_date date not null,
  start_time time,
  end_time time,
  status text not null default 'OPEN'
    check (status in ('OPEN','SUBMITTED','LOCKED')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (class_id, subject_id, teacher_id, session_date, start_time)
);

create table if not exists public.sekoly_attendance_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  session_id uuid not null references public.sekoly_attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.sekoly_students(id) on delete cascade,
  status text not null
    check (status in ('PRESENT','ABSENT_JUSTIFIED','ABSENT_UNJUSTIFIED','LATE')),
  minutes_late integer check (minutes_late is null or minutes_late >= 0),
  reason text,
  recorded_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create table if not exists public.sekoly_assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  school_year_id uuid not null references public.sekoly_school_years(id) on delete cascade,
  term_id uuid not null references public.sekoly_terms(id) on delete cascade,
  class_id uuid not null references public.sekoly_classes(id) on delete cascade,
  subject_id uuid not null references public.sekoly_subjects(id) on delete cascade,
  teacher_id uuid not null references public.sekoly_teachers(id) on delete restrict,
  title text not null,
  assessment_type text not null default 'CONTINUOUS'
    check (assessment_type in ('CONTINUOUS','EXAM','HOMEWORK','ORAL','OTHER')),
  assessment_date date not null default current_date,
  coefficient numeric(8,3) not null default 1,
  max_score numeric(8,3) not null default 20 check (max_score > 0),
  is_locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.sekoly_assessment_scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  assessment_id uuid not null references public.sekoly_assessments(id) on delete cascade,
  student_id uuid not null references public.sekoly_students(id) on delete cascade,
  score numeric(8,3),
  status text not null default 'GRADED'
    check (status in ('GRADED','ABSENT','EXCUSED','NOT_GRADED')),
  comment text,
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_id),
  check (score is null or score >= 0)
);

create table if not exists public.sekoly_timetable_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  school_year_id uuid not null references public.sekoly_school_years(id) on delete cascade,
  class_id uuid not null references public.sekoly_classes(id) on delete cascade,
  subject_id uuid not null references public.sekoly_subjects(id) on delete cascade,
  teacher_id uuid not null references public.sekoly_teachers(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 6),
  start_time time not null,
  end_time time not null,
  room text,
  check (start_time < end_time)
);

create table if not exists public.sekoly_push_tokens (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ANDROID','IOS','WEB')),
  token text not null,
  device_name text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create table if not exists public.sekoly_audit_logs (
  id bigint generated by default as identity primary key,
  school_id uuid not null references public.sekoly_schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sekoly_enrollments_class_idx
  on public.sekoly_enrollments(class_id, school_year_id);
create index if not exists sekoly_teacher_assignments_teacher_idx
  on public.sekoly_teacher_assignments(teacher_id, school_year_id, active);
create index if not exists sekoly_attendance_sessions_teacher_idx
  on public.sekoly_attendance_sessions(teacher_id, session_date);
create index if not exists sekoly_attendance_entries_student_idx
  on public.sekoly_attendance_entries(student_id);
create index if not exists sekoly_assessments_teacher_idx
  on public.sekoly_assessments(teacher_id, term_id);
create index if not exists sekoly_scores_student_idx
  on public.sekoly_assessment_scores(student_id);
create index if not exists sekoly_timetable_teacher_idx
  on public.sekoly_timetable_slots(teacher_id, school_year_id, day_of_week);

alter table public.sekoly_school_years enable row level security;
alter table public.sekoly_terms enable row level security;
alter table public.sekoly_subjects enable row level security;
alter table public.sekoly_classes enable row level security;
alter table public.sekoly_students enable row level security;
alter table public.sekoly_enrollments enable row level security;
alter table public.sekoly_teachers enable row level security;
alter table public.sekoly_class_subjects enable row level security;
alter table public.sekoly_teacher_assignments enable row level security;
alter table public.sekoly_attendance_sessions enable row level security;
alter table public.sekoly_attendance_entries enable row level security;
alter table public.sekoly_assessments enable row level security;
alter table public.sekoly_assessment_scores enable row level security;
alter table public.sekoly_timetable_slots enable row level security;
alter table public.sekoly_push_tokens enable row level security;
alter table public.sekoly_audit_logs enable row level security;

grant select, insert, update, delete on
  public.sekoly_school_years,
  public.sekoly_terms,
  public.sekoly_subjects,
  public.sekoly_classes,
  public.sekoly_students,
  public.sekoly_enrollments,
  public.sekoly_teachers,
  public.sekoly_class_subjects,
  public.sekoly_teacher_assignments,
  public.sekoly_attendance_sessions,
  public.sekoly_attendance_entries,
  public.sekoly_assessments,
  public.sekoly_assessment_scores,
  public.sekoly_timetable_slots,
  public.sekoly_push_tokens
to authenticated;
grant select, insert on public.sekoly_audit_logs to authenticated;
