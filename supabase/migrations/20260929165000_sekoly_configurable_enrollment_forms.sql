-- Sekoly: formulaires de préinscription configurables avec snapshots auditables.
alter table public.sekoly_enrollment_campaigns
  add column if not exists form_schema jsonb,
  add column if not exists form_schema_version integer not null default 1;

update public.sekoly_enrollment_campaigns
set form_schema = '{"schemaVersion":1,"fields":[{"key":"guardianLastName","scope":"FAMILY","group":"PRIMARY","label":"Nom du responsable","type":"TEXT","visible":true,"required":true,"locked":true,"order":10},{"key":"guardianFirstName","scope":"FAMILY","group":"PRIMARY","label":"Prénoms du responsable","type":"TEXT","visible":true,"required":false,"order":20},{"key":"relationship","scope":"FAMILY","group":"PRIMARY","label":"Lien avec l’enfant","type":"SELECT","visible":true,"required":true,"locked":true,"order":30,"options":["FATHER","MOTHER","GUARDIAN","OTHER"]},{"key":"phonePrimary","scope":"FAMILY","group":"PRIMARY","label":"Téléphone principal","type":"PHONE","visible":true,"required":true,"locked":true,"order":40},{"key":"phoneSecondary","scope":"FAMILY","group":"PRIMARY","label":"Deuxième téléphone","type":"PHONE","visible":true,"required":false,"order":50},{"key":"email","scope":"FAMILY","group":"PRIMARY","label":"Email","type":"EMAIL","visible":true,"required":false,"order":60},{"key":"cinNumber","scope":"FAMILY","group":"PRIMARY","label":"N° CIN","type":"TEXT","visible":true,"required":false,"order":70},{"key":"cinIssuedAt","scope":"FAMILY","group":"PRIMARY","label":"Date de délivrance CIN","type":"DATE","visible":true,"required":false,"order":80},{"key":"cinIssuePlace","scope":"FAMILY","group":"PRIMARY","label":"Lieu de délivrance CIN","type":"TEXT","visible":true,"required":false,"order":90},{"key":"occupation","scope":"FAMILY","group":"PRIMARY","label":"Profession","type":"TEXT","visible":true,"required":false,"order":100},{"key":"address","scope":"FAMILY","group":"PRIMARY","label":"Adresse","type":"TEXT","visible":true,"required":false,"order":110},{"key":"city","scope":"FAMILY","group":"PRIMARY","label":"Ville / Commune","type":"TEXT","visible":true,"required":false,"order":120},{"key":"preferredContact","scope":"FAMILY","group":"PRIMARY","label":"Contact préféré","type":"SELECT","visible":true,"required":false,"order":130,"options":["PHONE","WHATSAPP","SMS","EMAIL"]},{"key":"secondaryRelationship","scope":"FAMILY","group":"SECONDARY","label":"Lien du deuxième responsable","type":"SELECT","visible":true,"required":false,"order":210,"options":["OTHER","FATHER","MOTHER","GUARDIAN"]},{"key":"secondaryLastName","scope":"FAMILY","group":"SECONDARY","label":"Nom du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":220},{"key":"secondaryFirstName","scope":"FAMILY","group":"SECONDARY","label":"Prénoms du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":230},{"key":"secondaryPhonePrimary","scope":"FAMILY","group":"SECONDARY","label":"Téléphone du deuxième responsable","type":"PHONE","visible":true,"required":false,"order":240},{"key":"secondaryEmail","scope":"FAMILY","group":"SECONDARY","label":"Email du deuxième responsable","type":"EMAIL","visible":true,"required":false,"order":250},{"key":"secondaryCinNumber","scope":"FAMILY","group":"SECONDARY","label":"N° CIN du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":260},{"key":"secondaryCinIssuedAt","scope":"FAMILY","group":"SECONDARY","label":"Date CIN du deuxième responsable","type":"DATE","visible":true,"required":false,"order":270},{"key":"secondaryCinIssuePlace","scope":"FAMILY","group":"SECONDARY","label":"Lieu CIN du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":280},{"key":"secondaryOccupation","scope":"FAMILY","group":"SECONDARY","label":"Profession du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":290},{"key":"type","scope":"CHILD","group":"CHILD","label":"Type de demande","type":"SELECT","visible":true,"required":true,"locked":true,"order":310,"options":["NEW","RE_REGISTRATION"]},{"key":"existingMatricule","scope":"CHILD","group":"CHILD","label":"Matricule actuel (réinscription)","type":"TEXT","visible":true,"required":false,"locked":true,"order":320},{"key":"lastName","scope":"CHILD","group":"CHILD","label":"Nom de l’enfant","type":"TEXT","visible":true,"required":true,"locked":true,"order":330},{"key":"firstName","scope":"CHILD","group":"CHILD","label":"Prénoms de l’enfant","type":"TEXT","visible":true,"required":true,"locked":true,"order":340},{"key":"gender","scope":"CHILD","group":"CHILD","label":"Sexe","type":"SELECT","visible":true,"required":false,"order":350,"options":["M","F"]},{"key":"birthDate","scope":"CHILD","group":"CHILD","label":"Date de naissance","type":"DATE","visible":true,"required":false,"order":360},{"key":"birthPlace","scope":"CHILD","group":"CHILD","label":"Lieu de naissance","type":"TEXT","visible":true,"required":false,"order":370},{"key":"nationality","scope":"CHILD","group":"CHILD","label":"Nationalité","type":"TEXT","visible":true,"required":false,"order":380},{"key":"desiredClassId","scope":"CHILD","group":"CHILD","label":"Classe souhaitée","type":"CLASS","visible":true,"required":false,"order":390},{"key":"previousSchool","scope":"CHILD","group":"CHILD","label":"Ancien établissement","type":"TEXT","visible":true,"required":false,"order":400},{"key":"birthCertificateNumber","scope":"CHILD","group":"CHILD","label":"N° acte de naissance","type":"TEXT","visible":true,"required":false,"order":410},{"key":"birthCertificateDate","scope":"CHILD","group":"CHILD","label":"Date de l’acte","type":"DATE","visible":true,"required":false,"order":420},{"key":"birthCertificatePlace","scope":"CHILD","group":"CHILD","label":"Lieu de l’acte","type":"TEXT","visible":true,"required":false,"order":430},{"key":"bloodType","scope":"CHILD","group":"CHILD","label":"Groupe sanguin","type":"TEXT","visible":true,"required":false,"order":440},{"key":"address","scope":"CHILD","group":"CHILD","label":"Adresse de l’enfant si différente","type":"TEXT","visible":true,"required":false,"order":450},{"key":"neighborhood","scope":"CHILD","group":"CHILD","label":"Fokontany / quartier","type":"TEXT","visible":true,"required":false,"order":460},{"key":"city","scope":"CHILD","group":"CHILD","label":"Ville / Commune de l’enfant","type":"TEXT","visible":true,"required":false,"order":470},{"key":"medicalNotes","scope":"CHILD","group":"CHILD","label":"Informations utiles / médicales","type":"TEXTAREA","visible":true,"required":false,"order":480}],"documents":[{"code":"CIN_PRIMARY","scope":"FAMILY","label":"CIN du responsable principal","visible":true,"required":true,"order":10},{"code":"CIN_SECONDARY","scope":"FAMILY","label":"CIN du deuxième responsable","visible":true,"required":false,"order":20},{"code":"RESIDENCE","scope":"FAMILY","label":"Justificatif / certificat de résidence","visible":true,"required":false,"order":30},{"code":"BIRTH_CERTIFICATE","scope":"CHILD","label":"Acte de naissance","visible":true,"required":true,"order":40},{"code":"STUDENT_PHOTO","scope":"CHILD","label":"Photo d’identité de l’élève","visible":true,"required":true,"order":50},{"code":"TRANSFER","scope":"CHILD","label":"Certificat de transfert","visible":true,"required":false,"order":60},{"code":"REPORT_CARD","scope":"CHILD","label":"Dernier bulletin scolaire","visible":true,"required":false,"order":70}]}'::jsonb
where form_schema is null;

alter table public.sekoly_enrollment_campaigns
  alter column form_schema set default '{"schemaVersion":1,"fields":[{"key":"guardianLastName","scope":"FAMILY","group":"PRIMARY","label":"Nom du responsable","type":"TEXT","visible":true,"required":true,"locked":true,"order":10},{"key":"guardianFirstName","scope":"FAMILY","group":"PRIMARY","label":"Prénoms du responsable","type":"TEXT","visible":true,"required":false,"order":20},{"key":"relationship","scope":"FAMILY","group":"PRIMARY","label":"Lien avec l’enfant","type":"SELECT","visible":true,"required":true,"locked":true,"order":30,"options":["FATHER","MOTHER","GUARDIAN","OTHER"]},{"key":"phonePrimary","scope":"FAMILY","group":"PRIMARY","label":"Téléphone principal","type":"PHONE","visible":true,"required":true,"locked":true,"order":40},{"key":"phoneSecondary","scope":"FAMILY","group":"PRIMARY","label":"Deuxième téléphone","type":"PHONE","visible":true,"required":false,"order":50},{"key":"email","scope":"FAMILY","group":"PRIMARY","label":"Email","type":"EMAIL","visible":true,"required":false,"order":60},{"key":"cinNumber","scope":"FAMILY","group":"PRIMARY","label":"N° CIN","type":"TEXT","visible":true,"required":false,"order":70},{"key":"cinIssuedAt","scope":"FAMILY","group":"PRIMARY","label":"Date de délivrance CIN","type":"DATE","visible":true,"required":false,"order":80},{"key":"cinIssuePlace","scope":"FAMILY","group":"PRIMARY","label":"Lieu de délivrance CIN","type":"TEXT","visible":true,"required":false,"order":90},{"key":"occupation","scope":"FAMILY","group":"PRIMARY","label":"Profession","type":"TEXT","visible":true,"required":false,"order":100},{"key":"address","scope":"FAMILY","group":"PRIMARY","label":"Adresse","type":"TEXT","visible":true,"required":false,"order":110},{"key":"city","scope":"FAMILY","group":"PRIMARY","label":"Ville / Commune","type":"TEXT","visible":true,"required":false,"order":120},{"key":"preferredContact","scope":"FAMILY","group":"PRIMARY","label":"Contact préféré","type":"SELECT","visible":true,"required":false,"order":130,"options":["PHONE","WHATSAPP","SMS","EMAIL"]},{"key":"secondaryRelationship","scope":"FAMILY","group":"SECONDARY","label":"Lien du deuxième responsable","type":"SELECT","visible":true,"required":false,"order":210,"options":["OTHER","FATHER","MOTHER","GUARDIAN"]},{"key":"secondaryLastName","scope":"FAMILY","group":"SECONDARY","label":"Nom du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":220},{"key":"secondaryFirstName","scope":"FAMILY","group":"SECONDARY","label":"Prénoms du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":230},{"key":"secondaryPhonePrimary","scope":"FAMILY","group":"SECONDARY","label":"Téléphone du deuxième responsable","type":"PHONE","visible":true,"required":false,"order":240},{"key":"secondaryEmail","scope":"FAMILY","group":"SECONDARY","label":"Email du deuxième responsable","type":"EMAIL","visible":true,"required":false,"order":250},{"key":"secondaryCinNumber","scope":"FAMILY","group":"SECONDARY","label":"N° CIN du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":260},{"key":"secondaryCinIssuedAt","scope":"FAMILY","group":"SECONDARY","label":"Date CIN du deuxième responsable","type":"DATE","visible":true,"required":false,"order":270},{"key":"secondaryCinIssuePlace","scope":"FAMILY","group":"SECONDARY","label":"Lieu CIN du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":280},{"key":"secondaryOccupation","scope":"FAMILY","group":"SECONDARY","label":"Profession du deuxième responsable","type":"TEXT","visible":true,"required":false,"order":290},{"key":"type","scope":"CHILD","group":"CHILD","label":"Type de demande","type":"SELECT","visible":true,"required":true,"locked":true,"order":310,"options":["NEW","RE_REGISTRATION"]},{"key":"existingMatricule","scope":"CHILD","group":"CHILD","label":"Matricule actuel (réinscription)","type":"TEXT","visible":true,"required":false,"locked":true,"order":320},{"key":"lastName","scope":"CHILD","group":"CHILD","label":"Nom de l’enfant","type":"TEXT","visible":true,"required":true,"locked":true,"order":330},{"key":"firstName","scope":"CHILD","group":"CHILD","label":"Prénoms de l’enfant","type":"TEXT","visible":true,"required":true,"locked":true,"order":340},{"key":"gender","scope":"CHILD","group":"CHILD","label":"Sexe","type":"SELECT","visible":true,"required":false,"order":350,"options":["M","F"]},{"key":"birthDate","scope":"CHILD","group":"CHILD","label":"Date de naissance","type":"DATE","visible":true,"required":false,"order":360},{"key":"birthPlace","scope":"CHILD","group":"CHILD","label":"Lieu de naissance","type":"TEXT","visible":true,"required":false,"order":370},{"key":"nationality","scope":"CHILD","group":"CHILD","label":"Nationalité","type":"TEXT","visible":true,"required":false,"order":380},{"key":"desiredClassId","scope":"CHILD","group":"CHILD","label":"Classe souhaitée","type":"CLASS","visible":true,"required":false,"order":390},{"key":"previousSchool","scope":"CHILD","group":"CHILD","label":"Ancien établissement","type":"TEXT","visible":true,"required":false,"order":400},{"key":"birthCertificateNumber","scope":"CHILD","group":"CHILD","label":"N° acte de naissance","type":"TEXT","visible":true,"required":false,"order":410},{"key":"birthCertificateDate","scope":"CHILD","group":"CHILD","label":"Date de l’acte","type":"DATE","visible":true,"required":false,"order":420},{"key":"birthCertificatePlace","scope":"CHILD","group":"CHILD","label":"Lieu de l’acte","type":"TEXT","visible":true,"required":false,"order":430},{"key":"bloodType","scope":"CHILD","group":"CHILD","label":"Groupe sanguin","type":"TEXT","visible":true,"required":false,"order":440},{"key":"address","scope":"CHILD","group":"CHILD","label":"Adresse de l’enfant si différente","type":"TEXT","visible":true,"required":false,"order":450},{"key":"neighborhood","scope":"CHILD","group":"CHILD","label":"Fokontany / quartier","type":"TEXT","visible":true,"required":false,"order":460},{"key":"city","scope":"CHILD","group":"CHILD","label":"Ville / Commune de l’enfant","type":"TEXT","visible":true,"required":false,"order":470},{"key":"medicalNotes","scope":"CHILD","group":"CHILD","label":"Informations utiles / médicales","type":"TEXTAREA","visible":true,"required":false,"order":480}],"documents":[{"code":"CIN_PRIMARY","scope":"FAMILY","label":"CIN du responsable principal","visible":true,"required":true,"order":10},{"code":"CIN_SECONDARY","scope":"FAMILY","label":"CIN du deuxième responsable","visible":true,"required":false,"order":20},{"code":"RESIDENCE","scope":"FAMILY","label":"Justificatif / certificat de résidence","visible":true,"required":false,"order":30},{"code":"BIRTH_CERTIFICATE","scope":"CHILD","label":"Acte de naissance","visible":true,"required":true,"order":40},{"code":"STUDENT_PHOTO","scope":"CHILD","label":"Photo d’identité de l’élève","visible":true,"required":true,"order":50},{"code":"TRANSFER","scope":"CHILD","label":"Certificat de transfert","visible":true,"required":false,"order":60},{"code":"REPORT_CARD","scope":"CHILD","label":"Dernier bulletin scolaire","visible":true,"required":false,"order":70}]}'::jsonb,
  alter column form_schema set not null;

alter table public.sekoly_enrollment_campaigns
  drop constraint if exists sekoly_enrollment_campaigns_form_schema_object_check;
alter table public.sekoly_enrollment_campaigns
  add constraint sekoly_enrollment_campaigns_form_schema_object_check
  check (jsonb_typeof(form_schema) = 'object' and form_schema ? 'fields' and form_schema ? 'documents');

alter table public.sekoly_enrollment_campaigns
  drop constraint if exists sekoly_enrollment_campaigns_form_schema_version_check;
alter table public.sekoly_enrollment_campaigns
  add constraint sekoly_enrollment_campaigns_form_schema_version_check
  check (form_schema_version >= 1);

alter table public.sekoly_enrollment_families
  add column if not exists form_schema_version integer,
  add column if not exists form_schema_snapshot jsonb,
  add column if not exists custom_answers jsonb not null default '{}'::jsonb,
  add column if not exists submitted_payload jsonb not null default '{}'::jsonb;

alter table public.sekoly_enrollment_applications
  add column if not exists form_schema_version integer,
  add column if not exists form_schema_snapshot jsonb,
  add column if not exists custom_answers jsonb not null default '{}'::jsonb,
  add column if not exists submitted_payload jsonb not null default '{}'::jsonb;

alter table public.sekoly_enrollment_families
  drop constraint if exists sekoly_enrollment_families_custom_answers_object_check;
alter table public.sekoly_enrollment_families
  add constraint sekoly_enrollment_families_custom_answers_object_check
  check (jsonb_typeof(custom_answers) = 'object' and jsonb_typeof(submitted_payload) = 'object');

alter table public.sekoly_enrollment_applications
  drop constraint if exists sekoly_enrollment_applications_custom_answers_object_check;
alter table public.sekoly_enrollment_applications
  add constraint sekoly_enrollment_applications_custom_answers_object_check
  check (jsonb_typeof(custom_answers) = 'object' and jsonb_typeof(submitted_payload) = 'object');

create index if not exists sekoly_enrollment_campaigns_school_form_version_idx
  on public.sekoly_enrollment_campaigns(school_id, form_schema_version desc);

create or replace function sekoly_private.seed_enrollment_checklist()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  schema_doc jsonb;
  schema_docs jsonb;
  schema_version integer;
  inserted_count integer := 0;
begin
  select c.form_schema, c.form_schema_version
    into schema_docs, schema_version
  from public.sekoly_enrollment_campaigns c
  where c.id = new.campaign_id
    and c.school_id = new.school_id;

  if schema_docs is not null and jsonb_typeof(schema_docs->'documents') = 'array' then
    for schema_doc in
      select value
      from jsonb_array_elements(schema_docs->'documents')
      order by coalesce((value->>'order')::integer, 100)
    loop
      if coalesce((schema_doc->>'visible')::boolean, true) then
        insert into public.sekoly_enrollment_checklist_items
          (school_id, application_id, code, label, required, sort_order)
        values (
          new.school_id,
          new.id,
          left(coalesce(nullif(schema_doc->>'code',''), 'OTHER'), 80),
          left(coalesce(nullif(schema_doc->>'label',''), 'Pièce justificative'), 180),
          coalesce((schema_doc->>'required')::boolean, false),
          coalesce((schema_doc->>'order')::integer, 100)
        )
        on conflict (application_id, code) do nothing;
        inserted_count := inserted_count + 1;
      end if;
    end loop;
  end if;

  if inserted_count = 0 then
    insert into public.sekoly_enrollment_checklist_items
      (school_id, application_id, code, label, required, sort_order)
    values
      (new.school_id, new.id, 'BIRTH_CERTIFICATE', 'Acte de naissance', true, 10),
      (new.school_id, new.id, 'CIN_PRIMARY', 'CIN du responsable principal', true, 20),
      (new.school_id, new.id, 'STUDENT_PHOTO', 'Photo d’identité de l’élève', true, 30),
      (new.school_id, new.id, 'RESIDENCE', 'Justificatif de domicile / résidence', false, 40),
      (new.school_id, new.id, 'TRANSFER', 'Certificat de transfert', false, 50),
      (new.school_id, new.id, 'REPORT_CARD', 'Dernier bulletin scolaire', false, 60)
    on conflict (application_id, code) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function sekoly_private.seed_enrollment_checklist()
from public, anon, authenticated;

-- Existing applications keep their current checklist. New submissions use the
-- campaign schema current at the time they are submitted.
