-- RLS, teacher permissions, Realtime and integrity checks for Sekoly SaaS.

create or replace function sekoly_private.is_teacher_for(
  p_school_id uuid,
  p_class_id uuid,
  p_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sekoly_teacher_assignments a
    join public.sekoly_teachers t on t.id = a.teacher_id
    where a.school_id = p_school_id
      and a.class_id = p_class_id
      and a.subject_id = p_subject_id
      and a.active
      and t.user_id = (select auth.uid())
      and t.status = 'ACTIVE'
  );
$$;

create or replace function sekoly_private.is_teacher_for_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sekoly_attendance_sessions s
    join public.sekoly_teachers t on t.id = s.teacher_id
    where s.id = p_session_id
      and t.user_id = (select auth.uid())
      and t.status = 'ACTIVE'
  );
$$;

create or replace function sekoly_private.is_teacher_for_assessment(p_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sekoly_assessments a
    join public.sekoly_teachers t on t.id = a.teacher_id
    where a.id = p_assessment_id
      and t.user_id = (select auth.uid())
      and t.status = 'ACTIVE'
  );
$$;

revoke all on function sekoly_private.is_teacher_for(uuid,uuid,uuid) from public, anon;
revoke all on function sekoly_private.is_teacher_for_session(uuid) from public, anon;
revoke all on function sekoly_private.is_teacher_for_assessment(uuid) from public, anon;
grant execute on function sekoly_private.is_teacher_for(uuid,uuid,uuid) to authenticated;
grant execute on function sekoly_private.is_teacher_for_session(uuid) to authenticated;
grant execute on function sekoly_private.is_teacher_for_assessment(uuid) to authenticated;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'sekoly_school_years','sekoly_terms','sekoly_subjects','sekoly_classes',
    'sekoly_students','sekoly_enrollments','sekoly_teachers',
    'sekoly_class_subjects','sekoly_teacher_assignments','sekoly_timetable_slots'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'sekoly member read', tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (sekoly_private.is_member(school_id))',
      'sekoly member read', tbl
    );

    execute format('drop policy if exists %I on public.%I', 'sekoly management insert', tbl);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (sekoly_private.has_role(school_id, array[''SCHOOL_ADMIN'',''DIRECTOR'',''SECRETARY'']))',
      'sekoly management insert', tbl
    );

    execute format('drop policy if exists %I on public.%I', 'sekoly management update', tbl);
    execute format(
      'create policy %I on public.%I for update to authenticated using (sekoly_private.has_role(school_id, array[''SCHOOL_ADMIN'',''DIRECTOR'',''SECRETARY''])) with check (sekoly_private.has_role(school_id, array[''SCHOOL_ADMIN'',''DIRECTOR'',''SECRETARY'']))',
      'sekoly management update', tbl
    );

    execute format('drop policy if exists %I on public.%I', 'sekoly management delete', tbl);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (sekoly_private.has_role(school_id, array[''SCHOOL_ADMIN'',''DIRECTOR'']))',
      'sekoly management delete', tbl
    );
  end loop;
end $$;

drop policy if exists "sekoly attendance sessions read" on public.sekoly_attendance_sessions;
create policy "sekoly attendance sessions read"
on public.sekoly_attendance_sessions for select
to authenticated
using (sekoly_private.is_member(sekoly_attendance_sessions.school_id));

drop policy if exists "sekoly attendance sessions insert" on public.sekoly_attendance_sessions;
create policy "sekoly attendance sessions insert"
on public.sekoly_attendance_sessions for insert
to authenticated
with check (
  sekoly_private.has_role(sekoly_attendance_sessions.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR'])
  or (
    sekoly_private.has_role(sekoly_attendance_sessions.school_id, array['TEACHER'])
    and sekoly_private.is_teacher_for(
      sekoly_attendance_sessions.school_id,
      sekoly_attendance_sessions.class_id,
      sekoly_attendance_sessions.subject_id
    )
    and exists (
      select 1 from public.sekoly_teachers t
      where t.id = sekoly_attendance_sessions.teacher_id
        and t.user_id = (select auth.uid())
        and t.status = 'ACTIVE'
    )
  )
);

drop policy if exists "sekoly attendance sessions update" on public.sekoly_attendance_sessions;
create policy "sekoly attendance sessions update"
on public.sekoly_attendance_sessions for update
to authenticated
using (
  sekoly_private.has_role(sekoly_attendance_sessions.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR'])
  or (
    sekoly_attendance_sessions.status <> 'LOCKED'
    and exists (
      select 1 from public.sekoly_teachers t
      where t.id = sekoly_attendance_sessions.teacher_id
        and t.user_id = (select auth.uid())
        and t.status = 'ACTIVE'
    )
  )
)
with check (
  sekoly_private.has_role(sekoly_attendance_sessions.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR'])
  or (
    sekoly_attendance_sessions.status <> 'LOCKED'
    and exists (
      select 1 from public.sekoly_teachers t
      where t.id = sekoly_attendance_sessions.teacher_id
        and t.user_id = (select auth.uid())
        and t.status = 'ACTIVE'
    )
  )
);

drop policy if exists "sekoly attendance sessions delete" on public.sekoly_attendance_sessions;
create policy "sekoly attendance sessions delete"
on public.sekoly_attendance_sessions for delete
to authenticated
using (sekoly_private.has_role(sekoly_attendance_sessions.school_id, array['SCHOOL_ADMIN','DIRECTOR']));

drop policy if exists "sekoly attendance entries read" on public.sekoly_attendance_entries;
create policy "sekoly attendance entries read"
on public.sekoly_attendance_entries for select
to authenticated
using (sekoly_private.is_member(sekoly_attendance_entries.school_id));

drop policy if exists "sekoly attendance entries insert" on public.sekoly_attendance_entries;
create policy "sekoly attendance entries insert"
on public.sekoly_attendance_entries for insert
to authenticated
with check (
  sekoly_private.has_role(sekoly_attendance_entries.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR'])
  or (
    sekoly_private.has_role(sekoly_attendance_entries.school_id, array['TEACHER'])
    and sekoly_private.is_teacher_for_session(sekoly_attendance_entries.session_id)
    and exists (
      select 1 from public.sekoly_attendance_sessions s
      where s.id = sekoly_attendance_entries.session_id
        and s.school_id = sekoly_attendance_entries.school_id
        and s.status <> 'LOCKED'
    )
  )
);

drop policy if exists "sekoly attendance entries update" on public.sekoly_attendance_entries;
create policy "sekoly attendance entries update"
on public.sekoly_attendance_entries for update
to authenticated
using (
  sekoly_private.has_role(sekoly_attendance_entries.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR'])
  or sekoly_private.is_teacher_for_session(sekoly_attendance_entries.session_id)
)
with check (
  sekoly_private.has_role(sekoly_attendance_entries.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','SUPERVISOR'])
  or (
    sekoly_private.is_teacher_for_session(sekoly_attendance_entries.session_id)
    and exists (
      select 1 from public.sekoly_attendance_sessions s
      where s.id = sekoly_attendance_entries.session_id
        and s.school_id = sekoly_attendance_entries.school_id
        and s.status <> 'LOCKED'
    )
  )
);

drop policy if exists "sekoly attendance entries delete" on public.sekoly_attendance_entries;
create policy "sekoly attendance entries delete"
on public.sekoly_attendance_entries for delete
to authenticated
using (
  sekoly_private.has_role(sekoly_attendance_entries.school_id, array['SCHOOL_ADMIN','DIRECTOR'])
  or (
    sekoly_private.is_teacher_for_session(sekoly_attendance_entries.session_id)
    and exists (
      select 1 from public.sekoly_attendance_sessions s
      where s.id=sekoly_attendance_entries.session_id and s.status='OPEN'
    )
  )
);

drop policy if exists "sekoly assessments read" on public.sekoly_assessments;
create policy "sekoly assessments read"
on public.sekoly_assessments for select
to authenticated
using (sekoly_private.is_member(sekoly_assessments.school_id));

drop policy if exists "sekoly assessments insert" on public.sekoly_assessments;
create policy "sekoly assessments insert"
on public.sekoly_assessments for insert
to authenticated
with check (
  sekoly_private.has_role(sekoly_assessments.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
  or (
    sekoly_private.has_role(sekoly_assessments.school_id, array['TEACHER'])
    and sekoly_private.is_teacher_for(
      sekoly_assessments.school_id,
      sekoly_assessments.class_id,
      sekoly_assessments.subject_id
    )
    and exists (
      select 1 from public.sekoly_teachers t
      where t.id = sekoly_assessments.teacher_id
        and t.user_id=(select auth.uid())
        and t.status='ACTIVE'
    )
    and exists (
      select 1 from public.sekoly_terms tr
      where tr.id = sekoly_assessments.term_id
        and tr.school_id = sekoly_assessments.school_id
        and not tr.is_locked
    )
  )
);

drop policy if exists "sekoly assessments update" on public.sekoly_assessments;
create policy "sekoly assessments update"
on public.sekoly_assessments for update
to authenticated
using (
  sekoly_private.has_role(sekoly_assessments.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
  or (
    not sekoly_assessments.is_locked
    and exists (
      select 1 from public.sekoly_teachers t
      where t.id = sekoly_assessments.teacher_id
        and t.user_id=(select auth.uid())
        and t.status='ACTIVE'
    )
  )
)
with check (
  sekoly_private.has_role(sekoly_assessments.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
  or (
    not sekoly_assessments.is_locked
    and sekoly_private.is_teacher_for(
      sekoly_assessments.school_id,
      sekoly_assessments.class_id,
      sekoly_assessments.subject_id
    )
    and exists (
      select 1 from public.sekoly_terms tr
      where tr.id=sekoly_assessments.term_id
        and tr.school_id=sekoly_assessments.school_id
        and not tr.is_locked
    )
  )
);

drop policy if exists "sekoly assessments delete" on public.sekoly_assessments;
create policy "sekoly assessments delete"
on public.sekoly_assessments for delete
to authenticated
using (
  sekoly_private.has_role(sekoly_assessments.school_id, array['SCHOOL_ADMIN','DIRECTOR'])
  or (
    not sekoly_assessments.is_locked
    and exists (
      select 1 from public.sekoly_teachers t
      where t.id=sekoly_assessments.teacher_id
        and t.user_id=(select auth.uid())
    )
  )
);

drop policy if exists "sekoly scores read" on public.sekoly_assessment_scores;
create policy "sekoly scores read"
on public.sekoly_assessment_scores for select
to authenticated
using (sekoly_private.is_member(sekoly_assessment_scores.school_id));

drop policy if exists "sekoly scores insert" on public.sekoly_assessment_scores;
create policy "sekoly scores insert"
on public.sekoly_assessment_scores for insert
to authenticated
with check (
  sekoly_private.has_role(sekoly_assessment_scores.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
  or (
    sekoly_private.has_role(sekoly_assessment_scores.school_id, array['TEACHER'])
    and sekoly_private.is_teacher_for_assessment(sekoly_assessment_scores.assessment_id)
  )
);

drop policy if exists "sekoly scores update" on public.sekoly_assessment_scores;
create policy "sekoly scores update"
on public.sekoly_assessment_scores for update
to authenticated
using (
  sekoly_private.has_role(sekoly_assessment_scores.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
  or sekoly_private.is_teacher_for_assessment(sekoly_assessment_scores.assessment_id)
)
with check (
  sekoly_private.has_role(sekoly_assessment_scores.school_id, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY'])
  or sekoly_private.is_teacher_for_assessment(sekoly_assessment_scores.assessment_id)
);

drop policy if exists "sekoly scores delete" on public.sekoly_assessment_scores;
create policy "sekoly scores delete"
on public.sekoly_assessment_scores for delete
to authenticated
using (
  sekoly_private.has_role(sekoly_assessment_scores.school_id, array['SCHOOL_ADMIN','DIRECTOR'])
  or sekoly_private.is_teacher_for_assessment(sekoly_assessment_scores.assessment_id)
);

drop policy if exists "sekoly push own read" on public.sekoly_push_tokens;
create policy "sekoly push own read"
on public.sekoly_push_tokens for select
to authenticated
using (
  sekoly_push_tokens.user_id=(select auth.uid())
  and sekoly_private.is_member(sekoly_push_tokens.school_id)
);

drop policy if exists "sekoly push own insert" on public.sekoly_push_tokens;
create policy "sekoly push own insert"
on public.sekoly_push_tokens for insert
to authenticated
with check (
  sekoly_push_tokens.user_id=(select auth.uid())
  and sekoly_private.is_member(sekoly_push_tokens.school_id)
);

drop policy if exists "sekoly push own update" on public.sekoly_push_tokens;
create policy "sekoly push own update"
on public.sekoly_push_tokens for update
to authenticated
using (sekoly_push_tokens.user_id=(select auth.uid()))
with check (
  sekoly_push_tokens.user_id=(select auth.uid())
  and sekoly_private.is_member(sekoly_push_tokens.school_id)
);

drop policy if exists "sekoly push own delete" on public.sekoly_push_tokens;
create policy "sekoly push own delete"
on public.sekoly_push_tokens for delete
to authenticated
using (sekoly_push_tokens.user_id=(select auth.uid()));

drop policy if exists "sekoly audit management read" on public.sekoly_audit_logs;
create policy "sekoly audit management read"
on public.sekoly_audit_logs for select
to authenticated
using (
  sekoly_private.has_role(sekoly_audit_logs.school_id, array['SCHOOL_ADMIN','DIRECTOR'])
);

drop policy if exists "sekoly audit member insert" on public.sekoly_audit_logs;
create policy "sekoly audit member insert"
on public.sekoly_audit_logs for insert
to authenticated
with check (
  sekoly_audit_logs.user_id=(select auth.uid())
  and sekoly_private.is_member(sekoly_audit_logs.school_id)
);

drop policy if exists "sekoly realtime school members receive" on realtime.messages;
create policy "sekoly realtime school members receive"
on realtime.messages for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and split_part((select realtime.topic()), ':', 1) = 'school'
  and sekoly_private.is_member(
    nullif(split_part((select realtime.topic()), ':', 2), '')::uuid
  )
);

drop policy if exists "sekoly realtime school members send" on realtime.messages;
create policy "sekoly realtime school members send"
on realtime.messages for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and split_part((select realtime.topic()), ':', 1) = 'school'
  and sekoly_private.is_member(
    nullif(split_part((select realtime.topic()), ':', 2), '')::uuid
  )
);

create or replace function sekoly_private.broadcast_school_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
as $$
declare
  v_school_id uuid;
begin
  v_school_id := coalesce(new.school_id, old.school_id);

  perform realtime.broadcast_changes(
    'school:' || v_school_id::text || ':sync',
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );

  return null;
end;
$$;

revoke all on function sekoly_private.broadcast_school_row_change()
from public, anon, authenticated;

drop trigger if exists sekoly_attendance_entries_broadcast on public.sekoly_attendance_entries;
create trigger sekoly_attendance_entries_broadcast
after insert or update or delete on public.sekoly_attendance_entries
for each row execute function sekoly_private.broadcast_school_row_change();

drop trigger if exists sekoly_attendance_sessions_broadcast on public.sekoly_attendance_sessions;
create trigger sekoly_attendance_sessions_broadcast
after insert or update or delete on public.sekoly_attendance_sessions
for each row execute function sekoly_private.broadcast_school_row_change();

drop trigger if exists sekoly_assessments_broadcast on public.sekoly_assessments;
create trigger sekoly_assessments_broadcast
after insert or update or delete on public.sekoly_assessments
for each row execute function sekoly_private.broadcast_school_row_change();

drop trigger if exists sekoly_scores_broadcast on public.sekoly_assessment_scores;
create trigger sekoly_scores_broadcast
after insert or update or delete on public.sekoly_assessment_scores
for each row execute function sekoly_private.broadcast_school_row_change();

create or replace function sekoly_private.validate_assessment_score()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_max numeric;
  v_school uuid;
begin
  select a.max_score, a.school_id
  into v_max, v_school
  from public.sekoly_assessments a
  where a.id = new.assessment_id;

  if v_max is null then raise exception 'Evaluation introuvable.'; end if;
  if new.school_id <> v_school then
    raise exception 'Etablissement incoherent pour la note.';
  end if;
  if new.score is not null and (new.score < 0 or new.score > v_max) then
    raise exception 'La note doit etre comprise entre 0 et %.', v_max;
  end if;
  return new;
end;
$$;

drop trigger if exists sekoly_validate_assessment_score
on public.sekoly_assessment_scores;
create trigger sekoly_validate_assessment_score
before insert or update on public.sekoly_assessment_scores
for each row execute function sekoly_private.validate_assessment_score();

create or replace function sekoly_private.validate_attendance_entry()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_school uuid;
  v_year uuid;
  v_class uuid;
begin
  select s.school_id, s.school_year_id, s.class_id
  into v_school, v_year, v_class
  from public.sekoly_attendance_sessions s
  where s.id = new.session_id;

  if v_school is null then raise exception 'Seance de presence introuvable.'; end if;
  if new.school_id <> v_school then
    raise exception 'Etablissement incoherent pour la presence.';
  end if;

  if not exists (
    select 1
    from public.sekoly_enrollments e
    where e.school_id = v_school
      and e.school_year_id = v_year
      and e.class_id = v_class
      and e.student_id = new.student_id
      and e.status in ('ENROLLED','PENDING')
  ) then
    raise exception 'Cet eleve ne fait pas partie de la classe pour cette annee scolaire.';
  end if;

  return new;
end;
$$;

drop trigger if exists sekoly_validate_attendance_entry
on public.sekoly_attendance_entries;
create trigger sekoly_validate_attendance_entry
before insert or update on public.sekoly_attendance_entries
for each row execute function sekoly_private.validate_attendance_entry();
