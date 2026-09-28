create index if not exists sekoly_enrollment_checklist_school_document_idx
  on public.sekoly_enrollment_checklist_items(school_id, document_id);

create index if not exists sekoly_enrollment_documents_school_guardian_idx
  on public.sekoly_enrollment_documents(school_id, guardian_id);

create index if not exists sekoly_enrollment_documents_verified_by_idx
  on public.sekoly_enrollment_documents(verified_by);
