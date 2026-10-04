-- Anonymous candidates have no access to an existing family. Their short-lived
-- upload capability is scoped to this submission, never to a family portal.
alter table public.sekoly_enrollment_families
  add column submission_token_hash text,
  add column submission_token_expires_at timestamptz;
create unique index sekoly_submission_token_hash_idx
  on public.sekoly_enrollment_families(submission_token_hash)
  where submission_token_hash is not null;

alter table public.sekoly_enrollment_documents
  alter column family_id drop not null,
  add column enrollment_family_id uuid,
  add constraint sekoly_documents_submission_fk
    foreign key (school_id, enrollment_family_id)
    references public.sekoly_enrollment_families(school_id, id) on delete cascade,
  add constraint sekoly_documents_scope_check
    check (family_id is not null or enrollment_family_id is not null);
create index sekoly_documents_submission_idx
  on public.sekoly_enrollment_documents(school_id,enrollment_family_id)
  where enrollment_family_id is not null;

create or replace function sekoly_private.is_teacher_for(p_school_id uuid,p_class_id uuid,p_subject_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sekoly_teacher_assignments a
    join public.sekoly_teachers t on t.id=a.teacher_id and t.school_id=a.school_id
    join public.sekoly_memberships m on m.school_id=a.school_id and m.user_id=t.user_id
    where a.school_id=p_school_id and a.class_id=p_class_id and a.subject_id=p_subject_id
      and a.active and t.user_id=(select auth.uid()) and t.status='ACTIVE'
      and m.status='ACTIVE' and m.role='TEACHER'
  );
$$;

create or replace function sekoly_private.is_teacher_for_assessment(p_assessment_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sekoly_assessments a
    join public.sekoly_teachers t on t.id = a.teacher_id and t.school_id = a.school_id
    join public.sekoly_memberships m on m.school_id = a.school_id and m.user_id = t.user_id
    where a.id = p_assessment_id and t.user_id = (select auth.uid())
      and t.status = 'ACTIVE' and m.status = 'ACTIVE' and m.role = 'TEACHER'
  );
$$;

create or replace function sekoly_private.is_teacher_for_session(p_session_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sekoly_attendance_sessions s
    join public.sekoly_teachers t on t.id = s.teacher_id and t.school_id = s.school_id
    join public.sekoly_memberships m on m.school_id = s.school_id and m.user_id = t.user_id
    where s.id = p_session_id and t.user_id = (select auth.uid())
      and t.status = 'ACTIVE' and m.status = 'ACTIVE' and m.role = 'TEACHER'
  );
$$;

revoke all on function sekoly_private.is_teacher_for(uuid,uuid,uuid), sekoly_private.is_teacher_for_assessment(uuid),
  sekoly_private.is_teacher_for_session(uuid) from public, anon;
grant execute on function sekoly_private.is_teacher_for(uuid,uuid,uuid), sekoly_private.is_teacher_for_assessment(uuid),
  sekoly_private.is_teacher_for_session(uuid) to authenticated;

create or replace function sekoly_private.guard_score_write()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_assessment uuid;
  v_school uuid;
  v_locked boolean;
begin
  if TG_OP = 'UPDATE' and (new.assessment_id is distinct from old.assessment_id or new.student_id is distinct from old.student_id or new.school_id is distinct from old.school_id) then
    raise exception 'L’identité d’une note ne peut pas être déplacée.' using errcode='42501';
  end if;
  v_assessment := case when TG_OP = 'DELETE' then old.assessment_id else new.assessment_id end;
  select a.school_id, (a.is_locked or coalesce(tr.is_locked,false) or sy.status = 'CLOSED')
    into v_school,v_locked
    from public.sekoly_assessments a
    join public.sekoly_school_years sy on sy.id=a.school_year_id and sy.school_id=a.school_id
    left join public.sekoly_terms tr on tr.id=a.term_id and tr.school_id=a.school_id
    where a.id=v_assessment;
  if not found then
    if TG_OP = 'DELETE' then return old; end if;
    raise exception 'Evaluation introuvable.' using errcode='23503';
  end if;
  if v_locked then
    raise exception 'La période, l’année ou l’évaluation est verrouillée.' using errcode='42501';
  end if;
  if auth.uid() is not null and not sekoly_private.has_role(v_school, array['SCHOOL_ADMIN','DIRECTOR','SECRETARY','TEACHER']) then
    raise exception 'Adhésion active requise pour modifier les notes.' using errcode='42501';
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function sekoly_private.guard_score_write() from public, anon, authenticated;
create trigger sekoly_guard_score_write
before insert or update or delete on public.sekoly_assessment_scores
for each row execute function sekoly_private.guard_score_write();

-- A teacher must not evade a lock by moving an assessment to another period,
-- or changing its scale/coefficient while the underlying scores stay frozen.
create or replace function sekoly_private.guard_assessment_write()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_school uuid;
  v_year uuid;
  v_term uuid;
  v_locked boolean;
  v_manager boolean;
begin
  v_school := case when TG_OP='DELETE' then old.school_id else new.school_id end;
  v_year := case when TG_OP='DELETE' then old.school_year_id else new.school_year_id end;
  v_term := case when TG_OP='DELETE' then old.term_id else new.term_id end;
  v_manager := auth.uid() is null or sekoly_private.has_role(v_school,array['SCHOOL_ADMIN','DIRECTOR','SECRETARY']);
  if auth.uid() is not null and not (v_manager or sekoly_private.has_role(v_school,array['TEACHER'])) then
    raise exception 'Adhésion active requise.' using errcode='42501';
  end if;
  if TG_OP='UPDATE' and (new.school_id is distinct from old.school_id or new.school_year_id is distinct from old.school_year_id or new.term_id is distinct from old.term_id or new.teacher_id is distinct from old.teacher_id or new.class_id is distinct from old.class_id or new.subject_id is distinct from old.subject_id) then
    raise exception 'L’identité d’une évaluation ne peut pas être déplacée.' using errcode='42501';
  end if;
  select coalesce(tr.is_locked,false) or sy.status='CLOSED' into v_locked
    from public.sekoly_school_years sy left join public.sekoly_terms tr on tr.id=v_term and tr.school_id=v_school
    where sy.id=v_year and sy.school_id=v_school;
  if v_locked then raise exception 'La période ou l’année est verrouillée.' using errcode='42501'; end if;
  if TG_OP<>'INSERT' and old.is_locked then
    if TG_OP='UPDATE' and v_manager and not new.is_locked and
      (to_jsonb(new)-'is_locked'-'updated_at') = (to_jsonb(old)-'is_locked'-'updated_at') then return new; end if;
    raise exception 'L’évaluation est verrouillée.' using errcode='42501';
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function sekoly_private.guard_assessment_write() from public, anon, authenticated;
create trigger sekoly_guard_assessment_write before insert or update or delete
on public.sekoly_assessments for each row execute function sekoly_private.guard_assessment_write();

-- Document administration remains protected by its existing RLS policies.
comment on column public.sekoly_enrollment_families.submission_token_hash is
  'Hash of an upload-only capability valid for two hours; not a family portal credential.';
