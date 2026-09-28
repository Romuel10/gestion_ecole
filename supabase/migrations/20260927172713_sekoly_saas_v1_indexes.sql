
create index if not exists sekoly_scores_school_idx
  on public.sekoly_assessment_scores(school_id);

create index if not exists sekoly_assessments_class_idx
  on public.sekoly_assessments(class_id);
create index if not exists sekoly_assessments_school_idx
  on public.sekoly_assessments(school_id);
create index if not exists sekoly_assessments_year_idx
  on public.sekoly_assessments(school_year_id);
create index if not exists sekoly_assessments_subject_idx
  on public.sekoly_assessments(subject_id);
create index if not exists sekoly_assessments_term_idx
  on public.sekoly_assessments(term_id);

create index if not exists sekoly_attendance_entries_school_idx
  on public.sekoly_attendance_entries(school_id);

create index if not exists sekoly_attendance_sessions_school_idx
  on public.sekoly_attendance_sessions(school_id);
create index if not exists sekoly_attendance_sessions_year_idx
  on public.sekoly_attendance_sessions(school_year_id);
create index if not exists sekoly_attendance_sessions_subject_idx
  on public.sekoly_attendance_sessions(subject_id);

create index if not exists sekoly_audit_school_idx
  on public.sekoly_audit_logs(school_id);
create index if not exists sekoly_audit_user_idx
  on public.sekoly_audit_logs(user_id);

create index if not exists sekoly_class_subjects_school_idx
  on public.sekoly_class_subjects(school_id);
create index if not exists sekoly_class_subjects_subject_idx
  on public.sekoly_class_subjects(subject_id);
create index if not exists sekoly_class_subjects_teacher_idx
  on public.sekoly_class_subjects(teacher_id);

create index if not exists sekoly_classes_next_idx
  on public.sekoly_classes(next_class_id);
create index if not exists sekoly_classes_year_idx
  on public.sekoly_classes(school_year_id);

create index if not exists sekoly_enrollments_school_idx
  on public.sekoly_enrollments(school_id);
create index if not exists sekoly_enrollments_year_idx
  on public.sekoly_enrollments(school_year_id);

create index if not exists sekoly_push_school_idx
  on public.sekoly_push_tokens(school_id);

create index if not exists sekoly_assignments_class_idx
  on public.sekoly_teacher_assignments(class_id);
create index if not exists sekoly_assignments_school_idx
  on public.sekoly_teacher_assignments(school_id);
create index if not exists sekoly_assignments_year_idx
  on public.sekoly_teacher_assignments(school_year_id);
create index if not exists sekoly_assignments_subject_idx
  on public.sekoly_teacher_assignments(subject_id);

create index if not exists sekoly_teachers_user_idx
  on public.sekoly_teachers(user_id);

create index if not exists sekoly_terms_school_idx
  on public.sekoly_terms(school_id);

create index if not exists sekoly_timetable_class_idx
  on public.sekoly_timetable_slots(class_id);
create index if not exists sekoly_timetable_school_idx
  on public.sekoly_timetable_slots(school_id);
create index if not exists sekoly_timetable_year_idx
  on public.sekoly_timetable_slots(school_year_id);
create index if not exists sekoly_timetable_subject_idx
  on public.sekoly_timetable_slots(subject_id);
