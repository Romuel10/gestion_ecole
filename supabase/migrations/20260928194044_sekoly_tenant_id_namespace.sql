update public.sekoly_schools
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('id_namespace_version', 1)
where not (coalesce(settings, '{}'::jsonb) ? 'id_namespace_version');
