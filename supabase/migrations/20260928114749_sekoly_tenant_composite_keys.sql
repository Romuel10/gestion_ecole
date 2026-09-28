alter table public.sekoly_school_years
  add constraint sekoly_school_years_school_id_id_key unique (school_id, id);

alter table public.sekoly_terms
  add constraint sekoly_terms_school_year_id_id_key unique (school_id, school_year_id, id);

alter table public.sekoly_subjects
  add constraint sekoly_subjects_school_id_id_key unique (school_id, id);

alter table public.sekoly_classes
  add constraint sekoly_classes_school_id_id_key unique (school_id, id),
  add constraint sekoly_classes_school_year_id_id_key unique (school_id, school_year_id, id);

alter table public.sekoly_students
  add constraint sekoly_students_school_id_id_key unique (school_id, id);

alter table public.sekoly_teachers
  add constraint sekoly_teachers_school_id_id_key unique (school_id, id);

alter table public.sekoly_attendance_sessions
  add constraint sekoly_attendance_sessions_school_id_id_key unique (school_id, id);

alter table public.sekoly_assessments
  add constraint sekoly_assessments_school_id_id_key unique (school_id, id);
