-- Sekoly SaaS V1 hardening: least-privilege Data API grants.
-- RLS remains the row-level authorization layer.

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'sekoly_schools',
    'sekoly_memberships',
    'sekoly_school_years',
    'sekoly_terms',
    'sekoly_subjects',
    'sekoly_classes',
    'sekoly_students',
    'sekoly_enrollments',
    'sekoly_teachers',
    'sekoly_class_subjects',
    'sekoly_teacher_assignments',
    'sekoly_attendance_sessions',
    'sekoly_attendance_entries',
    'sekoly_assessments',
    'sekoly_assessment_scores',
    'sekoly_timetable_slots',
    'sekoly_push_tokens',
    'sekoly_audit_logs'
  ]
  loop
    execute format('revoke all privileges on table public.%I from anon', tbl);
    execute format('revoke all privileges on table public.%I from authenticated', tbl);
  end loop;
end $$;

grant select, update on table public.sekoly_schools to authenticated;
grant select, insert, update, delete on table public.sekoly_memberships to authenticated;

grant select, insert, update, delete on table
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

grant select, insert on table public.sekoly_audit_logs to authenticated;
