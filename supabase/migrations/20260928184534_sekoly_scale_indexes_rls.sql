-- Sekoly scale hardening: covering indexes for tenant foreign keys and non-overlapping RLS write policies.

create index if not exists sekoly_scores_school_assessment_idx
  on public.sekoly_assessment_scores(school_id, assessment_id);
create index if not exists sekoly_scores_school_student_idx
  on public.sekoly_assessment_scores(school_id, student_id);

create index if not exists sekoly_assessments_school_year_class_idx
  on public.sekoly_assessments(school_id, school_year_id, class_id);
create index if not exists sekoly_assessments_school_year_term_idx
  on public.sekoly_assessments(school_id, school_year_id, term_id);
create index if not exists sekoly_assessments_school_subject_idx
  on public.sekoly_assessments(school_id, subject_id);
create index if not exists sekoly_assessments_school_teacher_idx
  on public.sekoly_assessments(school_id, teacher_id);

create index if not exists sekoly_entries_school_session_idx
  on public.sekoly_attendance_entries(school_id, session_id);
create index if not exists sekoly_entries_school_student_idx
  on public.sekoly_attendance_entries(school_id, student_id);

create index if not exists sekoly_attendance_school_year_class_idx
  on public.sekoly_attendance_sessions(school_id, school_year_id, class_id);
create index if not exists sekoly_attendance_school_subject_idx
  on public.sekoly_attendance_sessions(school_id, subject_id);
create index if not exists sekoly_attendance_school_teacher_idx
  on public.sekoly_attendance_sessions(school_id, teacher_id);

create index if not exists sekoly_class_subjects_school_class_idx
  on public.sekoly_class_subjects(school_id, class_id);
create index if not exists sekoly_class_subjects_school_subject_idx
  on public.sekoly_class_subjects(school_id, subject_id);
create index if not exists sekoly_class_subjects_school_teacher_idx
  on public.sekoly_class_subjects(school_id, teacher_id);

create index if not exists sekoly_classes_school_next_idx
  on public.sekoly_classes(school_id, next_class_id);

create index if not exists sekoly_enrollment_apps_school_campaign_idx
  on public.sekoly_enrollment_applications(school_id, campaign_id);
create index if not exists sekoly_enrollment_apps_school_class_idx
  on public.sekoly_enrollment_applications(school_id, desired_class_id);
create index if not exists sekoly_enrollment_apps_school_family_idx
  on public.sekoly_enrollment_applications(school_id, family_id);
create index if not exists sekoly_enrollment_apps_reviewed_by_idx
  on public.sekoly_enrollment_applications(reviewed_by);
create index if not exists sekoly_enrollment_apps_school_student_idx
  on public.sekoly_enrollment_applications(school_id, student_id);

create index if not exists sekoly_enrollment_campaigns_created_by_idx
  on public.sekoly_enrollment_campaigns(created_by);
create index if not exists sekoly_enrollment_families_school_campaign_idx
  on public.sekoly_enrollment_families(school_id, campaign_id);

create index if not exists sekoly_enrollments_school_year_class_idx
  on public.sekoly_enrollments(school_id, school_year_id, class_id);
create index if not exists sekoly_enrollments_school_student_idx
  on public.sekoly_enrollments(school_id, student_id);

create index if not exists sekoly_guardians_user_idx
  on public.sekoly_guardians(user_id);
create index if not exists sekoly_student_guardians_school_guardian_idx
  on public.sekoly_student_guardians(school_id, guardian_id);
create index if not exists sekoly_student_guardians_school_student_idx
  on public.sekoly_student_guardians(school_id, student_id);

create index if not exists sekoly_sync_events_school_teacher_idx
  on public.sekoly_sync_events(school_id, teacher_id);

create index if not exists sekoly_assignments_school_year_class_idx
  on public.sekoly_teacher_assignments(school_id, school_year_id, class_id);
create index if not exists sekoly_assignments_school_subject_idx
  on public.sekoly_teacher_assignments(school_id, subject_id);
create index if not exists sekoly_assignments_school_teacher_idx
  on public.sekoly_teacher_assignments(school_id, teacher_id);

create index if not exists sekoly_timetable_school_year_class_idx
  on public.sekoly_timetable_slots(school_id, school_year_id, class_id);
create index if not exists sekoly_timetable_school_subject_idx
  on public.sekoly_timetable_slots(school_id, subject_id);
create index if not exists sekoly_timetable_school_teacher_idx
  on public.sekoly_timetable_slots(school_id, teacher_id);

drop policy if exists "sekoly guardians management write" on public.sekoly_guardians;
create policy "sekoly guardians management insert"
on public.sekoly_guardians for insert to authenticated
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly guardians management update"
on public.sekoly_guardians for update to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
)
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly guardians management delete"
on public.sekoly_guardians for delete to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);

drop policy if exists "sekoly student guardians management write" on public.sekoly_student_guardians;
create policy "sekoly student guardians management insert"
on public.sekoly_student_guardians for insert to authenticated
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly student guardians management update"
on public.sekoly_student_guardians for update to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
)
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly student guardians management delete"
on public.sekoly_student_guardians for delete to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);

drop policy if exists "sekoly enrollment campaigns management write" on public.sekoly_enrollment_campaigns;
create policy "sekoly enrollment campaigns management insert"
on public.sekoly_enrollment_campaigns for insert to authenticated
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly enrollment campaigns management update"
on public.sekoly_enrollment_campaigns for update to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
)
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly enrollment campaigns management delete"
on public.sekoly_enrollment_campaigns for delete to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);

drop policy if exists "sekoly enrollment families management write" on public.sekoly_enrollment_families;
create policy "sekoly enrollment families management insert"
on public.sekoly_enrollment_families for insert to authenticated
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly enrollment families management update"
on public.sekoly_enrollment_families for update to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
)
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly enrollment families management delete"
on public.sekoly_enrollment_families for delete to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);

drop policy if exists "sekoly enrollment applications management write" on public.sekoly_enrollment_applications;
create policy "sekoly enrollment applications management insert"
on public.sekoly_enrollment_applications for insert to authenticated
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly enrollment applications management update"
on public.sekoly_enrollment_applications for update to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
)
with check (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
create policy "sekoly enrollment applications management delete"
on public.sekoly_enrollment_applications for delete to authenticated
using (
  sekoly_private.has_role(school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
);
