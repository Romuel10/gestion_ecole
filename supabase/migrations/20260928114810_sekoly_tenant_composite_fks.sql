alter table public.sekoly_terms
  add constraint sekoly_terms_same_school_year_fk
  foreign key (school_id, school_year_id)
  references public.sekoly_school_years(school_id, id);

alter table public.sekoly_classes
  add constraint sekoly_classes_same_school_year_fk
  foreign key (school_id, school_year_id)
  references public.sekoly_school_years(school_id, id),
  add constraint sekoly_classes_next_same_school_fk
  foreign key (school_id, next_class_id)
  references public.sekoly_classes(school_id, id);

alter table public.sekoly_enrollments
  add constraint sekoly_enrollments_same_school_student_fk
  foreign key (school_id, student_id)
  references public.sekoly_students(school_id, id),
  add constraint sekoly_enrollments_same_school_year_fk
  foreign key (school_id, school_year_id)
  references public.sekoly_school_years(school_id, id),
  add constraint sekoly_enrollments_same_school_year_class_fk
  foreign key (school_id, school_year_id, class_id)
  references public.sekoly_classes(school_id, school_year_id, id);

alter table public.sekoly_class_subjects
  add constraint sekoly_class_subjects_same_school_class_fk
  foreign key (school_id, class_id)
  references public.sekoly_classes(school_id, id),
  add constraint sekoly_class_subjects_same_school_subject_fk
  foreign key (school_id, subject_id)
  references public.sekoly_subjects(school_id, id),
  add constraint sekoly_class_subjects_same_school_teacher_fk
  foreign key (school_id, teacher_id)
  references public.sekoly_teachers(school_id, id);

alter table public.sekoly_teacher_assignments
  add constraint sekoly_assignments_same_school_year_fk
  foreign key (school_id, school_year_id)
  references public.sekoly_school_years(school_id, id),
  add constraint sekoly_assignments_same_school_teacher_fk
  foreign key (school_id, teacher_id)
  references public.sekoly_teachers(school_id, id),
  add constraint sekoly_assignments_same_school_year_class_fk
  foreign key (school_id, school_year_id, class_id)
  references public.sekoly_classes(school_id, school_year_id, id),
  add constraint sekoly_assignments_same_school_subject_fk
  foreign key (school_id, subject_id)
  references public.sekoly_subjects(school_id, id);

alter table public.sekoly_attendance_sessions
  add constraint sekoly_attendance_same_school_year_fk
  foreign key (school_id, school_year_id)
  references public.sekoly_school_years(school_id, id),
  add constraint sekoly_attendance_same_school_year_class_fk
  foreign key (school_id, school_year_id, class_id)
  references public.sekoly_classes(school_id, school_year_id, id),
  add constraint sekoly_attendance_same_school_subject_fk
  foreign key (school_id, subject_id)
  references public.sekoly_subjects(school_id, id),
  add constraint sekoly_attendance_same_school_teacher_fk
  foreign key (school_id, teacher_id)
  references public.sekoly_teachers(school_id, id);

alter table public.sekoly_attendance_entries
  add constraint sekoly_entries_same_school_session_fk
  foreign key (school_id, session_id)
  references public.sekoly_attendance_sessions(school_id, id),
  add constraint sekoly_entries_same_school_student_fk
  foreign key (school_id, student_id)
  references public.sekoly_students(school_id, id);

alter table public.sekoly_assessments
  add constraint sekoly_assessments_same_school_year_fk
  foreign key (school_id, school_year_id)
  references public.sekoly_school_years(school_id, id),
  add constraint sekoly_assessments_same_school_year_term_fk
  foreign key (school_id, school_year_id, term_id)
  references public.sekoly_terms(school_id, school_year_id, id),
  add constraint sekoly_assessments_same_school_year_class_fk
  foreign key (school_id, school_year_id, class_id)
  references public.sekoly_classes(school_id, school_year_id, id),
  add constraint sekoly_assessments_same_school_subject_fk
  foreign key (school_id, subject_id)
  references public.sekoly_subjects(school_id, id),
  add constraint sekoly_assessments_same_school_teacher_fk
  foreign key (school_id, teacher_id)
  references public.sekoly_teachers(school_id, id);

alter table public.sekoly_assessment_scores
  add constraint sekoly_scores_same_school_assessment_fk
  foreign key (school_id, assessment_id)
  references public.sekoly_assessments(school_id, id),
  add constraint sekoly_scores_same_school_student_fk
  foreign key (school_id, student_id)
  references public.sekoly_students(school_id, id);

alter table public.sekoly_timetable_slots
  add constraint sekoly_timetable_same_school_year_fk
  foreign key (school_id, school_year_id)
  references public.sekoly_school_years(school_id, id),
  add constraint sekoly_timetable_same_school_year_class_fk
  foreign key (school_id, school_year_id, class_id)
  references public.sekoly_classes(school_id, school_year_id, id),
  add constraint sekoly_timetable_same_school_subject_fk
  foreign key (school_id, subject_id)
  references public.sekoly_subjects(school_id, id),
  add constraint sekoly_timetable_same_school_teacher_fk
  foreign key (school_id, teacher_id)
  references public.sekoly_teachers(school_id, id);

alter table public.sekoly_sync_events
  add constraint sekoly_sync_events_same_school_teacher_fk
  foreign key (school_id, teacher_id)
  references public.sekoly_teachers(school_id, id);
