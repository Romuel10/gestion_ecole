-- Sekoly: pièces justificatives de préinscription entièrement configurables.

-- Les types de documents ne sont plus limités à une liste fixe : le serveur valide
-- désormais chaque code contre le snapshot du formulaire soumis.
alter table public.sekoly_enrollment_documents
  drop constraint if exists sekoly_enrollment_documents_document_type_check;

alter table public.sekoly_enrollment_documents
  drop constraint if exists sekoly_enrollment_documents_document_type_format_check;

alter table public.sekoly_enrollment_documents
  add constraint sekoly_enrollment_documents_document_type_format_check
  check (
    char_length(document_type) between 2 and 80
    and document_type ~ '^[A-Z0-9_]+$'
  );

-- Le scope est conservé dans la checklist afin que le portail sache si une pièce
-- appartient à la famille entière ou à un enfant précis.
alter table public.sekoly_enrollment_checklist_items
  add column if not exists scope text not null default 'CHILD';

alter table public.sekoly_enrollment_checklist_items
  drop constraint if exists sekoly_enrollment_checklist_items_scope_check;

alter table public.sekoly_enrollment_checklist_items
  add constraint sekoly_enrollment_checklist_items_scope_check
  check (scope in ('FAMILY','CHILD'));

update public.sekoly_enrollment_checklist_items
set scope = case
  when code in ('CIN_PRIMARY','CIN_SECONDARY','RESIDENCE') then 'FAMILY'
  else 'CHILD'
end
where scope is null
   or scope not in ('FAMILY','CHILD')
   or (
     scope = 'CHILD'
     and code in ('CIN_PRIMARY','CIN_SECONDARY','RESIDENCE')
   );

-- Les nouvelles demandes reçoivent exactement la checklist décrite dans le
-- snapshot du formulaire utilisé par la famille. Les anciens dossiers restent intacts.
create or replace function sekoly_private.seed_enrollment_checklist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  docs jsonb;
begin
  docs := new.form_schema_snapshot -> 'documents';

  if docs is null
     or jsonb_typeof(docs) <> 'array'
     or jsonb_array_length(docs) = 0 then
    select c.form_schema -> 'documents'
      into docs
    from public.sekoly_enrollment_campaigns c
    where c.id = new.campaign_id
      and c.school_id = new.school_id;
  end if;

  if docs is null
     or jsonb_typeof(docs) <> 'array'
     or jsonb_array_length(docs) = 0 then
    docs := '[
      {"code":"CIN_PRIMARY","scope":"FAMILY","label":"CIN du responsable principal","visible":true,"required":true,"order":10},
      {"code":"CIN_SECONDARY","scope":"FAMILY","label":"CIN du deuxième responsable","visible":true,"required":false,"order":20},
      {"code":"RESIDENCE","scope":"FAMILY","label":"Justificatif / certificat de résidence","visible":true,"required":false,"order":30},
      {"code":"BIRTH_CERTIFICATE","scope":"CHILD","label":"Acte de naissance","visible":true,"required":true,"order":40},
      {"code":"STUDENT_PHOTO","scope":"CHILD","label":"Photo d’identité de l’élève","visible":true,"required":true,"order":50},
      {"code":"TRANSFER","scope":"CHILD","label":"Certificat de transfert","visible":true,"required":false,"order":60},
      {"code":"REPORT_CARD","scope":"CHILD","label":"Dernier bulletin scolaire","visible":true,"required":false,"order":70}
    ]'::jsonb;
  end if;

  insert into public.sekoly_enrollment_checklist_items
    (school_id, application_id, code, label, scope, required, sort_order)
  select
    new.school_id,
    new.id,
    upper(left(trim(doc ->> 'code'), 80)),
    left(coalesce(nullif(trim(doc ->> 'label'), ''), trim(doc ->> 'code')), 180),
    case when upper(coalesce(doc ->> 'scope', 'CHILD')) = 'FAMILY'
      then 'FAMILY'
      else 'CHILD'
    end,
    case
      when lower(coalesce(doc ->> 'required', 'false')) = 'true' then true
      else false
    end,
    case
      when coalesce(doc ->> 'order', '') ~ '^[0-9]+$'
        then (doc ->> 'order')::integer
      else 100
    end
  from jsonb_array_elements(docs) doc
  where lower(coalesce(doc ->> 'visible', 'true')) <> 'false'
    and upper(left(trim(coalesce(doc ->> 'code', '')), 80)) ~ '^[A-Z0-9_]{2,80}$'
  on conflict (application_id, code) do nothing;

  return new;
end;
$$;

drop trigger if exists sekoly_seed_enrollment_checklist
  on public.sekoly_enrollment_applications;

create trigger sekoly_seed_enrollment_checklist
after insert on public.sekoly_enrollment_applications
for each row
execute function sekoly_private.seed_enrollment_checklist();

revoke all on function sekoly_private.seed_enrollment_checklist()
from public, anon, authenticated;

create index if not exists sekoly_enrollment_checklist_scope_idx
  on public.sekoly_enrollment_checklist_items(school_id, application_id, scope, sort_order);
