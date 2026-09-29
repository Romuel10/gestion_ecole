-- Sekoly: avoid foreign-key failures when a whole school is deleted and child rows cascade.
create or replace function sekoly_private.audit_school_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_school_id uuid;
  v_entity_id uuid;
begin
  v_school_id := coalesce(
    nullif(v_new->>'school_id','')::uuid,
    nullif(v_old->>'school_id','')::uuid,
    nullif(v_new->>'id','')::uuid,
    nullif(v_old->>'id','')::uuid
  );

  v_entity_id := coalesce(
    nullif(v_new->>'id','')::uuid,
    nullif(v_old->>'id','')::uuid,
    nullif(v_new->>'school_id','')::uuid,
    nullif(v_old->>'school_id','')::uuid
  );

  -- During ON DELETE CASCADE, the parent school may already be gone when
  -- child audit triggers fire. In that case, do not create an orphan audit row.
  if v_school_id is not null
     and exists (
       select 1
       from public.sekoly_schools s
       where s.id = v_school_id
     )
  then
    insert into public.sekoly_audit_logs (
      school_id,
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      v_school_id,
      (select auth.uid()),
      tg_op,
      tg_table_name,
      v_entity_id,
      jsonb_build_object(
        'source', 'database_trigger',
        'operation', tg_op
      )
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function sekoly_private.audit_school_change()
from public, anon, authenticated;
