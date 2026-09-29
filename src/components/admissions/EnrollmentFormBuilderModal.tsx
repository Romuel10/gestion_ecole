import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  FileCheck2,
  FolderPlus,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  EnrollmentCampaign,
  EnrollmentFormDocument,
  EnrollmentFormField,
  EnrollmentFormFieldType,
  EnrollmentFormSchema,
  EnrollmentFormSection,
} from '../../services/cloudSync';
import { Modal } from '../common/Modal';

interface EnrollmentFormBuilderModalProps {
  campaign: EnrollmentCampaign | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (schema: EnrollmentFormSchema) => Promise<void>;
}

const typeLabel: Record<EnrollmentFormFieldType, string> = {
  TEXT: 'Texte court',
  TEXTAREA: 'Texte long',
  DATE: 'Date',
  EMAIL: 'Email',
  PHONE: 'Téléphone',
  NUMBER: 'Nombre',
  SELECT: 'Liste de choix',
  YES_NO: 'Oui / Non',
  CLASS: 'Classe de l’établissement',
};

const baseSections: EnrollmentFormSection[] = [
  {
    id: 'family_primary',
    scope: 'FAMILY',
    title: 'Responsable principal',
    description: 'Identité et coordonnées du parent ou responsable à contacter en priorité.',
    order: 10,
    visible: true,
    locked: true,
  },
  {
    id: 'family_secondary',
    scope: 'FAMILY',
    title: 'Deuxième responsable',
    description: 'Informations facultatives sur un autre parent ou responsable légal.',
    order: 20,
    visible: true,
  },
  {
    id: 'child_identity',
    scope: 'CHILD',
    title: 'Identité de l’élève',
    description: 'Informations essentielles permettant d’identifier l’enfant et le type de demande.',
    order: 10,
    visible: true,
    locked: true,
  },
  {
    id: 'child_schooling',
    scope: 'CHILD',
    title: 'Scolarité',
    description: 'Classe souhaitée et établissement fréquenté auparavant.',
    order: 20,
    visible: true,
  },
  {
    id: 'child_civil',
    scope: 'CHILD',
    title: 'État civil et adresse',
    description: 'Acte de naissance, adresse et localisation de l’enfant.',
    order: 30,
    visible: true,
  },
  {
    id: 'child_health',
    scope: 'CHILD',
    title: 'Santé et informations utiles',
    description: 'Informations utiles à l’accueil et au suivi de l’élève.',
    order: 40,
    visible: true,
  },
];

const schoolingKeys = new Set(['desiredClassId', 'previousSchool']);
const civilKeys = new Set([
  'birthCertificateNumber',
  'birthCertificateDate',
  'birthCertificatePlace',
  'address',
  'neighborhood',
  'city',
]);
const healthKeys = new Set(['bloodType', 'medicalNotes']);

const legacySectionId = (field: EnrollmentFormField) => {
  if (field.scope === 'FAMILY') {
    return field.group === 'SECONDARY' ? 'family_secondary' : 'family_primary';
  }
  if (schoolingKeys.has(field.key)) return 'child_schooling';
  if (civilKeys.has(field.key)) return 'child_civil';
  if (healthKeys.has(field.key)) return 'child_health';
  return 'child_identity';
};

const cloneSchema = (schema: EnrollmentFormSchema): EnrollmentFormSchema =>
  JSON.parse(JSON.stringify(schema)) as EnrollmentFormSchema;

const safeSlug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);

const normalizeSchema = (schema: EnrollmentFormSchema): EnrollmentFormSchema => {
  const copy = cloneSchema(schema);
  const sections =
    Array.isArray(copy.sections) && copy.sections.length
      ? copy.sections
      : cloneSchema({
          schemaVersion: 2,
          fields: [],
          documents: [],
          sections: baseSections,
        }).sections!;

  const normalizedSections = sections
    .map((section, index) => ({
      ...section,
      visible: section.visible !== false,
      order: Number.isFinite(section.order) ? section.order : (index + 1) * 10,
    }))
    .sort((a, b) => a.order - b.order);

  const sectionIds = new Set(normalizedSections.map((section) => section.id));
  const firstByScope = (scope: EnrollmentFormField['scope']) =>
    normalizedSections.find((section) => section.scope === scope)?.id;

  return {
    ...copy,
    schemaVersion: Math.max(2, Number(copy.schemaVersion || 2)),
    sections: normalizedSections,
    fields: copy.fields.map((field) => {
      const legacy = legacySectionId(field);
      const sectionId =
        field.sectionId && sectionIds.has(field.sectionId)
          ? field.sectionId
          : sectionIds.has(legacy)
            ? legacy
            : firstByScope(field.scope);
      return { ...field, sectionId };
    }),
  };
};

const PreviewControl: React.FC<{ field: EnrollmentFormField }> = ({ field }) => {
  const className =
    'w-full min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 text-[10px] text-slate-400';

  if (field.type === 'TEXTAREA') {
    return <textarea className={className} rows={2} disabled placeholder={field.placeholder || ''} />;
  }
  if (field.type === 'SELECT' || field.type === 'CLASS' || field.type === 'YES_NO') {
    return (
      <select className={className} disabled defaultValue="">
        <option value="">
          {field.type === 'CLASS'
            ? 'Choisir une classe'
            : field.type === 'YES_NO'
              ? 'Oui / Non'
              : 'Choisir une option'}
        </option>
      </select>
    );
  }

  return (
    <input
      className={className}
      disabled
      type={
        field.type === 'DATE'
          ? 'date'
          : field.type === 'EMAIL'
            ? 'email'
            : field.type === 'NUMBER'
              ? 'number'
              : 'text'
      }
      placeholder={field.placeholder || ''}
    />
  );
};

export const EnrollmentFormBuilderModal: React.FC<EnrollmentFormBuilderModalProps> = ({
  campaign,
  isOpen,
  onClose,
  onSave,
}) => {
  const initial = campaign?.form_schema;
  const [draft, setDraft] = useState<EnrollmentFormSchema | null>(
    initial ? normalizeSchema(initial) : null
  );
  const [saving, setSaving] = useState(false);
  const [previewScope, setPreviewScope] = useState<'FAMILY' | 'CHILD' | 'DOCUMENTS'>(
    'FAMILY'
  );

  const [customLabel, setCustomLabel] = useState('');
  const [customScope, setCustomScope] = useState<'FAMILY' | 'CHILD'>('FAMILY');
  const [customType, setCustomType] = useState<EnrollmentFormFieldType>('TEXT');
  const [customRequired, setCustomRequired] = useState(false);
  const [customOptions, setCustomOptions] = useState('');
  const [customHelp, setCustomHelp] = useState('');
  const [customSectionId, setCustomSectionId] = useState('');

  const [sectionTitle, setSectionTitle] = useState('');
  const [sectionDescription, setSectionDescription] = useState('');
  const [sectionScope, setSectionScope] = useState<'FAMILY' | 'CHILD'>('FAMILY');

  const [documentLabel, setDocumentLabel] = useState('');
  const [documentScope, setDocumentScope] = useState<'FAMILY' | 'CHILD'>('CHILD');
  const [documentRequired, setDocumentRequired] = useState(false);
  const [documentHelp, setDocumentHelp] = useState('');

  React.useEffect(() => {
    if (isOpen && campaign?.form_schema) {
      const normalized = normalizeSchema(campaign.form_schema);
      setDraft(normalized);
      setCustomSectionId(
        normalized.sections?.find((section) => section.scope === 'FAMILY' && section.visible)
          ?.id || ''
      );
    }
  }, [isOpen, campaign?.id, campaign?.form_schema_version]);

  const sectionsByScope = useMemo(() => {
    const all = [...(draft?.sections ?? [])].sort((a, b) => a.order - b.order);
    return {
      FAMILY: all.filter((section) => section.scope === 'FAMILY'),
      CHILD: all.filter((section) => section.scope === 'CHILD'),
    };
  }, [draft]);

  const fieldsBySection = useMemo(() => {
    const map: Record<string, EnrollmentFormField[]> = {};
    for (const field of draft?.fields ?? []) {
      const sectionId = field.sectionId || legacySectionId(field);
      (map[sectionId] ||= []).push(field);
    }
    Object.values(map).forEach((fields) => fields.sort((a, b) => a.order - b.order));
    return map;
  }, [draft]);

  if (!campaign || !draft) return null;

  const setDraftSafe = (
    updater: (current: EnrollmentFormSchema) => EnrollmentFormSchema
  ) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const updateField = (
    key: string,
    scope: EnrollmentFormField['scope'],
    values: Partial<EnrollmentFormField>
  ) => {
    setDraftSafe((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.key === key && field.scope === scope
          ? { ...field, ...values }
          : field
      ),
    }));
  };

  const updateSection = (id: string, values: Partial<EnrollmentFormSection>) => {
    setDraftSafe((current) => ({
      ...current,
      sections: (current.sections ?? []).map((section) =>
        section.id === id ? { ...section, ...values } : section
      ),
    }));
  };

  const moveSection = (section: EnrollmentFormSection, direction: -1 | 1) => {
    setDraftSafe((current) => {
      const scoped = (current.sections ?? [])
        .filter((item) => item.scope === section.scope)
        .sort((a, b) => a.order - b.order);
      const index = scoped.findIndex((item) => item.id === section.id);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= scoped.length) return current;
      const target = scoped[targetIndex];

      return {
        ...current,
        sections: (current.sections ?? []).map((item) => {
          if (item.id === section.id) return { ...item, order: target.order };
          if (item.id === target.id) return { ...item, order: section.order };
          return item;
        }),
      };
    });
  };

  const moveField = (field: EnrollmentFormField, direction: -1 | 1) => {
    const sectionId = field.sectionId || legacySectionId(field);
    setDraftSafe((current) => {
      const scoped = current.fields
        .filter(
          (item) =>
            item.scope === field.scope &&
            (item.sectionId || legacySectionId(item)) === sectionId
        )
        .sort((a, b) => a.order - b.order);
      const index = scoped.findIndex((item) => item.key === field.key);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= scoped.length) return current;
      const target = scoped[targetIndex];

      return {
        ...current,
        fields: current.fields.map((item) => {
          if (item.key === field.key && item.scope === field.scope) {
            return { ...item, order: target.order };
          }
          if (item.key === target.key && item.scope === target.scope) {
            return { ...item, order: field.order };
          }
          return item;
        }),
      };
    });
  };

  const deleteCustomField = (field: EnrollmentFormField) => {
    if (!field.custom) return;
    setDraftSafe((current) => ({
      ...current,
      fields: current.fields.filter(
        (item) => !(item.key === field.key && item.scope === field.scope)
      ),
    }));
  };

  const addSection = () => {
    const title = sectionTitle.trim();
    if (!title) return;

    const suffix =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Date.now().toString(36);
    const id = `section_${safeSlug(title) || 'bloc'}_${suffix}`;
    const scoped = sectionsByScope[sectionScope];
    const maxOrder = Math.max(0, ...scoped.map((section) => section.order));

    setDraftSafe((current) => ({
      ...current,
      sections: [
        ...(current.sections ?? []),
        {
          id,
          scope: sectionScope,
          title,
          description: sectionDescription.trim() || undefined,
          visible: true,
          order: maxOrder + 10,
        },
      ],
    }));

    setSectionTitle('');
    setSectionDescription('');
  };

  const deleteSection = (section: EnrollmentFormSection) => {
    if (section.locked) return;

    const fallback =
      sectionsByScope[section.scope].find(
        (item) => item.id !== section.id && item.visible && item.locked
      ) ||
      sectionsByScope[section.scope].find(
        (item) => item.id !== section.id && item.visible
      );

    if (!fallback) return;

    setDraftSafe((current) => ({
      ...current,
      sections: (current.sections ?? []).filter((item) => item.id !== section.id),
      fields: current.fields.map((field) =>
        field.sectionId === section.id
          ? { ...field, sectionId: fallback.id }
          : field
      ),
    }));
  };

  const addCustomField = () => {
    const label = customLabel.trim();
    if (!label) return;

    const section =
      sectionsByScope[customScope].find((item) => item.id === customSectionId) ||
      sectionsByScope[customScope].find((item) => item.visible);
    if (!section) return;

    const options =
      customType === 'SELECT'
        ? customOptions
            .split(/\n|,/)
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined;
    if (customType === 'SELECT' && (!options || options.length === 0)) return;

    const suffix =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Date.now().toString(36);
    const key = `custom_${safeSlug(label) || 'champ'}_${suffix}`;
    const sectionFields = fieldsBySection[section.id] ?? [];
    const maxOrder = Math.max(0, ...sectionFields.map((field) => field.order));

    setDraftSafe((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          key,
          scope: customScope,
          group: 'CUSTOM',
          label,
          type: customType,
          visible: true,
          required: customRequired,
          custom: true,
          sectionId: section.id,
          order: maxOrder + 10,
          helpText: customHelp.trim() || undefined,
          options,
        },
      ],
    }));

    setCustomLabel('');
    setCustomRequired(false);
    setCustomOptions('');
    setCustomHelp('');
    setCustomType('TEXT');
  };

  const addCustomDocument = () => {
    const label = documentLabel.trim();
    if (!label) return;

    const suffix =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
        : Date.now().toString(36).toUpperCase();
    const codeBase = safeSlug(label).replace(/_/g, '').slice(0, 24).toUpperCase();
    const code = `CUSTOM_${codeBase || 'DOCUMENT'}_${suffix}`;
    const scoped = draft.documents.filter((item) => item.scope === documentScope);
    const maxOrder = Math.max(0, ...scoped.map((item) => item.order));

    setDraftSafe((current) => ({
      ...current,
      documents: [
        ...current.documents,
        {
          code,
          scope: documentScope,
          label,
          visible: true,
          required: documentRequired,
          order: maxOrder + 10,
          custom: true,
          helpText: documentHelp.trim() || undefined,
        },
      ],
    }));

    setDocumentLabel('');
    setDocumentRequired(false);
    setDocumentHelp('');
  };

  const deleteCustomDocument = (document: EnrollmentFormDocument) => {
    if (!document.custom) return;
    setDraftSafe((current) => ({
      ...current,
      documents: current.documents.filter((item) => item.code !== document.code),
    }));
  };

  const updateDocument = (
    code: string,
    values: Partial<EnrollmentFormDocument>
  ) => {
    setDraftSafe((current) => ({
      ...current,
      documents: current.documents.map((document) =>
        document.code === code ? { ...document, ...values } : document
      ),
    }));
  };

  const moveDocument = (document: EnrollmentFormDocument, direction: -1 | 1) => {
    setDraftSafe((current) => {
      const scoped = current.documents
        .filter((item) => item.scope === document.scope)
        .sort((a, b) => a.order - b.order);
      const index = scoped.findIndex((item) => item.code === document.code);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= scoped.length) return current;
      const target = scoped[targetIndex];

      return {
        ...current,
        documents: current.documents.map((item) => {
          if (item.code === document.code) return { ...item, order: target.order };
          if (item.code === target.code) return { ...item, order: document.order };
          return item;
        }),
      };
    });
  };

  const save = async () => {
    const sections = [...(draft.sections ?? [])].sort((a, b) => a.order - b.order);
    const lockedInvisible = draft.fields.find((field) => {
      if (!field.locked || !field.visible) return false;
      const section = sections.find((item) => item.id === field.sectionId);
      return section && !section.visible;
    });
    if (lockedInvisible) {
      throw new Error(
        `La section contenant « ${lockedInvisible.label} » doit rester visible.`
      );
    }

    setSaving(true);
    try {
      await onSave({
        ...draft,
        schemaVersion: Math.max(2, Number(draft.schemaVersion || 2)),
        sections,
        fields: [...draft.fields].sort((a, b) => a.order - b.order),
        documents: [...draft.documents].sort((a, b) => a.order - b.order),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: EnrollmentFormField) => {
    const availableSections = sectionsByScope[field.scope];

    return (
      <div
        key={`${field.scope}:${field.key}`}
        className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3"
      >
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold text-xs">{field.label}</div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                {typeLabel[field.type]}
              </span>
              {field.custom && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
                  Personnalisé
                </span>
              )}
              {field.locked && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                  Essentiel
                </span>
              )}
            </div>
            {field.helpText && !field.custom && (
              <div className="mt-1 text-[10px] text-slate-500">{field.helpText}</div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[10px] font-semibold">
              <input
                type="checkbox"
                checked={field.visible}
                disabled={Boolean(field.locked)}
                onChange={(event) =>
                  updateField(field.key, field.scope, {
                    visible: event.target.checked,
                    required: event.target.checked ? field.required : false,
                  })
                }
              />
              Afficher
            </label>
            <label className="flex items-center gap-1.5 text-[10px] font-semibold">
              <input
                type="checkbox"
                checked={field.required}
                disabled={Boolean(field.locked) && field.key !== 'existingMatricule'}
                onChange={(event) =>
                  updateField(field.key, field.scope, {
                    required: event.target.checked,
                    visible: event.target.checked ? true : field.visible,
                  })
                }
              />
              Obligatoire
            </label>
            <button
              type="button"
              className="icon-button"
              title="Monter dans la section"
              onClick={() => moveField(field, -1)}
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Descendre dans la section"
              onClick={() => moveField(field, 1)}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            {field.custom && (
              <button
                type="button"
                className="icon-button"
                title="Supprimer ce champ"
                onClick={() => deleteCustomField(field)}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] font-bold text-slate-400 mb-1">
              Section
            </label>
            <select
              className="settings-input"
              value={field.sectionId || legacySectionId(field)}
              disabled={Boolean(field.locked)}
              onChange={(event) =>
                updateField(field.key, field.scope, {
                  sectionId: event.target.value,
                })
              }
            >
              {availableSections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.title}
                </option>
              ))}
            </select>
          </div>

          {field.custom && (
            <div>
              <label className="block text-[9px] font-bold text-slate-400 mb-1">
                Libellé affiché
              </label>
              <input
                className="settings-input"
                value={field.label}
                onChange={(event) =>
                  updateField(field.key, field.scope, {
                    label: event.target.value,
                  })
                }
              />
            </div>
          )}

          {field.custom && (
            <div>
              <label className="block text-[9px] font-bold text-slate-400 mb-1">
                Type de réponse
              </label>
              <select
                className="settings-input"
                value={field.type}
                onChange={(event) =>
                  updateField(field.key, field.scope, {
                    type: event.target.value as EnrollmentFormFieldType,
                    options:
                      event.target.value === 'SELECT'
                        ? field.options?.length
                          ? field.options
                          : ['Choix 1', 'Choix 2']
                        : undefined,
                  })
                }
              >
                {(
                  [
                    'TEXT',
                    'TEXTAREA',
                    'DATE',
                    'EMAIL',
                    'PHONE',
                    'NUMBER',
                    'SELECT',
                    'YES_NO',
                  ] as EnrollmentFormFieldType[]
                ).map((type) => (
                  <option key={type} value={type}>
                    {typeLabel[type]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {field.custom && field.type === 'SELECT' && (
            <div>
              <label className="block text-[9px] font-bold text-slate-400 mb-1">
                Choix proposés
              </label>
              <textarea
                className="settings-input resize-y"
                rows={2}
                value={(field.options ?? []).join('\n')}
                onChange={(event) =>
                  updateField(field.key, field.scope, {
                    options: event.target.value
                      .split(/\n|,/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          )}

          {field.custom && (
            <div className="md:col-span-2">
              <label className="block text-[9px] font-bold text-slate-400 mb-1">
                Aide pour le parent
              </label>
              <input
                className="settings-input"
                value={field.helpText ?? ''}
                onChange={(event) =>
                  updateField(field.key, field.scope, {
                    helpText: event.target.value || undefined,
                  })
                }
                placeholder="Courte précision affichée sous le champ."
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSectionEditor = (section: EnrollmentFormSection) => {
    const fields = fieldsBySection[section.id] ?? [];
    const containsLocked = fields.some((field) => field.locked && field.visible);

    return (
      <section
        key={section.id}
        className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
      >
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 space-y-3">
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-bold text-slate-400 mb-1">
                  Titre de section
                </label>
                <input
                  className="settings-input"
                  value={section.title}
                  onChange={(event) =>
                    updateSection(section.id, { title: event.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-400 mb-1">
                  Description courte
                </label>
                <input
                  className="settings-input"
                  value={section.description ?? ''}
                  onChange={(event) =>
                    updateSection(section.id, {
                      description: event.target.value || undefined,
                    })
                  }
                  placeholder="Explique brièvement ce qui est demandé."
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold">
                <input
                  type="checkbox"
                  checked={section.visible}
                  disabled={Boolean(section.locked) || containsLocked}
                  onChange={(event) =>
                    updateSection(section.id, { visible: event.target.checked })
                  }
                />
                Afficher
              </label>
              <button
                type="button"
                className="icon-button"
                title="Monter la section"
                onClick={() => moveSection(section, -1)}
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Descendre la section"
                onClick={() => moveSection(section, 1)}
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              {!section.locked && (
                <button
                  type="button"
                  className="icon-button"
                  title="Supprimer la section et déplacer ses champs"
                  onClick={() => deleteSection(section)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                </button>
              )}
            </div>
          </div>
          <div className="text-[9px] text-slate-400">
            {fields.length} champ(s)
            {section.locked ? ' · section essentielle' : ''}
          </div>
        </div>

        <div className="p-3 space-y-2">
          {fields.length ? (
            fields.map(renderField)
          ) : (
            <div className="py-4 text-center text-[10px] text-slate-400 italic">
              Cette section est vide. Ajoutez un champ ou déplacez-en un ici.
            </div>
          )}
        </div>
      </section>
    );
  };

  const previewSections =
    previewScope === 'DOCUMENTS'
      ? []
      : sectionsByScope[previewScope].filter((section) => section.visible);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Constructeur du formulaire parents"
      subtitle={`${campaign.name} · version ${campaign.form_schema_version}`}
      maxWidth="7xl"
      actions={
        <>
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
            disabled={saving}
          >
            Annuler
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => void save()}
            disabled={saving}
          >
            <Settings2 className="w-3.5 h-3.5" />
            {saving ? 'Enregistrement…' : 'Publier cette configuration'}
          </button>
        </>
      }
    >
      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-[11px] text-blue-900 dark:text-blue-200">
        Organisez le formulaire en sections courtes et cohérentes. Les champs essentiels
        restent protégés. Les anciennes demandes conservent leur propre version du
        formulaire, même après une nouvelle publication.
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.8fr)] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <section className="space-y-3">
            <div>
              <div className="text-xs font-bold">Sections du formulaire</div>
              <div className="text-[10px] text-slate-500 mt-1">
                Une section regroupe des questions liées entre elles. Vous pouvez la
                renommer, la déplacer, la masquer ou créer vos propres blocs.
              </div>
            </div>

            {(['FAMILY', 'CHILD'] as const).map((scope) => (
              <div key={scope} className="space-y-3">
                <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                  {scope === 'FAMILY' ? 'Famille / responsables' : 'Enfant'}
                </div>
                {sectionsByScope[scope].map(renderSectionEditor)}
              </div>
            ))}
          </section>

          <section className="p-4 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/15 space-y-3">
            <div className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-emerald-600" />
              <div>
                <div className="font-semibold text-xs">Ajouter une section</div>
                <div className="text-[10px] text-slate-500">
                  Ex. Transport scolaire, situation familiale, autorisations ou
                  informations administratives.
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Titre
                </label>
                <input
                  className="settings-input"
                  value={sectionTitle}
                  onChange={(event) => setSectionTitle(event.target.value)}
                  placeholder="Ex. Transport scolaire"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Partie du formulaire
                </label>
                <select
                  className="settings-input"
                  value={sectionScope}
                  onChange={(event) =>
                    setSectionScope(event.target.value as 'FAMILY' | 'CHILD')
                  }
                >
                  <option value="FAMILY">Famille / responsables</option>
                  <option value="CHILD">Chaque enfant</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Description (facultatif)
                </label>
                <input
                  className="settings-input"
                  value={sectionDescription}
                  onChange={(event) => setSectionDescription(event.target.value)}
                  placeholder="Courte explication visible par le parent."
                />
              </div>
            </div>
            <button
              type="button"
              className="button button--secondary"
              onClick={addSection}
              disabled={!sectionTitle.trim()}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Ajouter la section
            </button>
          </section>

          <section className="p-4 rounded-xl border border-dashed border-violet-300 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 space-y-3">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-violet-600" />
              <div>
                <div className="font-semibold text-xs">Ajouter un champ</div>
                <div className="text-[10px] text-slate-500">
                  Ajoutez uniquement une information utile au traitement du dossier.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Libellé
                </label>
                <input
                  className="settings-input"
                  value={customLabel}
                  onChange={(event) => setCustomLabel(event.target.value)}
                  placeholder="Ex. Moyen de transport habituel"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Pour qui ?
                </label>
                <select
                  className="settings-input"
                  value={customScope}
                  onChange={(event) => {
                    const nextScope = event.target.value as 'FAMILY' | 'CHILD';
                    setCustomScope(nextScope);
                    setCustomSectionId(
                      sectionsByScope[nextScope].find((section) => section.visible)?.id ||
                        ''
                    );
                  }}
                >
                  <option value="FAMILY">Famille / responsable</option>
                  <option value="CHILD">Chaque enfant</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Section
                </label>
                <select
                  className="settings-input"
                  value={
                    customSectionId ||
                    sectionsByScope[customScope].find((section) => section.visible)?.id ||
                    ''
                  }
                  onChange={(event) => setCustomSectionId(event.target.value)}
                >
                  {sectionsByScope[customScope]
                    .filter((section) => section.visible)
                    .map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.title}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Type de réponse
                </label>
                <select
                  className="settings-input"
                  value={customType}
                  onChange={(event) =>
                    setCustomType(event.target.value as EnrollmentFormFieldType)
                  }
                >
                  {(
                    [
                      'TEXT',
                      'TEXTAREA',
                      'DATE',
                      'EMAIL',
                      'PHONE',
                      'NUMBER',
                      'SELECT',
                      'YES_NO',
                    ] as EnrollmentFormFieldType[]
                  ).map((type) => (
                    <option key={type} value={type}>
                      {typeLabel[type]}
                    </option>
                  ))}
                </select>
              </div>

              {customType === 'SELECT' && (
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Choix proposés
                  </label>
                  <textarea
                    className="settings-input resize-y"
                    rows={3}
                    value={customOptions}
                    onChange={(event) => setCustomOptions(event.target.value)}
                    placeholder={'Un choix par ligne\nÀ pied\nBus scolaire\nVoiture'}
                  />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-500 mb-1">
                  Aide affichée sous le champ (facultatif)
                </label>
                <input
                  className="settings-input"
                  value={customHelp}
                  onChange={(event) => setCustomHelp(event.target.value)}
                  placeholder="Courte précision pour éviter les erreurs de saisie."
                />
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={customRequired}
                    onChange={(event) => setCustomRequired(event.target.checked)}
                  />
                  Réponse obligatoire
                </label>
              </div>
            </div>

            <button
              type="button"
              className="button button--secondary"
              onClick={addCustomField}
              disabled={
                !customLabel.trim() ||
                (customType === 'SELECT' && !customOptions.trim()) ||
                sectionsByScope[customScope].filter((section) => section.visible)
                  .length === 0
              }
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter au formulaire
            </button>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-600" />
              <div>
                <div className="font-semibold text-xs">Pièces justificatives</div>
                <div className="text-[10px] text-slate-500">
                  L’école peut maintenant définir sa propre liste de pièces, leur libellé,
                  leur ordre et leur caractère obligatoire.
                </div>
              </div>
            </div>

            {(['FAMILY', 'CHILD'] as const).map((scope) => {
              const scopedDocuments = [...draft.documents]
                .filter((document) => document.scope === scope)
                .sort((a, b) => a.order - b.order);

              return (
                <div key={scope} className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                    {scope === 'FAMILY'
                      ? 'Documents de la famille / responsables'
                      : 'Documents pour chaque enfant'}
                  </div>

                  {scopedDocuments.length ? (
                    scopedDocuments.map((document) => (
                      <div
                        key={document.code}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3"
                      >
                        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-xs font-semibold">{document.label}</div>
                              {document.custom && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
                                  Personnalisée
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[8px] font-mono text-slate-400 break-all">
                              {document.code}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1.5 text-[10px] font-semibold">
                              <input
                                type="checkbox"
                                checked={document.visible}
                                onChange={(event) =>
                                  updateDocument(document.code, {
                                    visible: event.target.checked,
                                    required: event.target.checked
                                      ? document.required
                                      : false,
                                  })
                                }
                              />
                              Afficher
                            </label>
                            <label className="flex items-center gap-1.5 text-[10px] font-semibold">
                              <input
                                type="checkbox"
                                checked={document.required}
                                onChange={(event) =>
                                  updateDocument(document.code, {
                                    required: event.target.checked,
                                    visible: event.target.checked
                                      ? true
                                      : document.visible,
                                  })
                                }
                              />
                              Obligatoire
                            </label>
                            <button
                              type="button"
                              className="icon-button"
                              title="Monter"
                              onClick={() => moveDocument(document, -1)}
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              title="Descendre"
                              onClick={() => moveDocument(document, 1)}
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            {document.custom && (
                              <button
                                type="button"
                                className="icon-button"
                                title="Supprimer cette pièce personnalisée"
                                onClick={() => deleteCustomDocument(document)}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 mb-1">
                              Libellé affiché aux parents
                            </label>
                            <input
                              className="settings-input"
                              value={document.label}
                              onChange={(event) =>
                                updateDocument(document.code, {
                                  label: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 mb-1">
                              Aide / précision (facultatif)
                            </label>
                            <input
                              className="settings-input"
                              value={document.helpText ?? ''}
                              onChange={(event) =>
                                updateDocument(document.code, {
                                  helpText: event.target.value || undefined,
                                })
                              }
                              placeholder="Ex. document de moins de 3 mois."
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-slate-400 italic">
                      Aucune pièce dans cette catégorie.
                    </div>
                  )}
                </div>
              );
            })}

            <div className="p-4 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/15 space-y-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <div>
                  <div className="font-semibold text-xs">Ajouter une pièce demandée</div>
                  <div className="text-[10px] text-slate-500">
                    Ex. certificat médical, autorisation parentale, fiche sanitaire,
                    attestation de bourse ou autre document propre à l’école.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Nom de la pièce
                  </label>
                  <input
                    className="settings-input"
                    value={documentLabel}
                    onChange={(event) => setDocumentLabel(event.target.value)}
                    placeholder="Ex. Certificat médical"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Demandée pour
                  </label>
                  <select
                    className="settings-input"
                    value={documentScope}
                    onChange={(event) =>
                      setDocumentScope(event.target.value as 'FAMILY' | 'CHILD')
                    }
                  >
                    <option value="FAMILY">Une fois pour la famille</option>
                    <option value="CHILD">Pour chaque enfant</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Aide / précision (facultatif)
                  </label>
                  <input
                    className="settings-input"
                    value={documentHelp}
                    onChange={(event) => setDocumentHelp(event.target.value)}
                    placeholder="Ex. Délivré depuis moins de trois mois."
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={documentRequired}
                      onChange={(event) => setDocumentRequired(event.target.checked)}
                    />
                    Pièce obligatoire pour considérer le dossier complet
                  </label>
                </div>
              </div>

              <button
                type="button"
                className="button button--secondary"
                onClick={addCustomDocument}
                disabled={!documentLabel.trim()}
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter la pièce
              </button>
            </div>
          </section>
        </div>

        <aside className="xl:sticky xl:top-0 space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-500" />
            <div>
              <div className="text-xs font-bold">Aperçu en temps réel</div>
              <div className="text-[10px] text-slate-500">
                Simulation de ce que le parent verra.
              </div>
            </div>
          </div>

          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {(
              [
                ['FAMILY', 'Famille'],
                ['CHILD', 'Enfant'],
                ['DOCUMENTS', 'Pièces'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPreviewScope(value)}
                className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-bold transition ${
                  previewScope === value
                    ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 max-h-[68vh] overflow-y-auto">
            {previewScope === 'DOCUMENTS' ? (
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-bold">Pièces justificatives</div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    PDF ou photo lisible. Les pièces facultatives peuvent être remises
                    plus tard.
                  </div>
                </div>
                {[...draft.documents]
                  .filter((document) => document.visible)
                  .sort((a, b) => a.order - b.order)
                  .map((document) => (
                    <div
                      key={document.code}
                      className="p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      <div className="text-[10px] font-semibold">{document.label}</div>
                      <div className="mt-1 text-[9px] text-slate-400">
                        {document.required ? 'Obligatoire' : 'Facultatif'} ·{' '}
                        {document.scope === 'FAMILY' ? 'Famille' : 'Chaque enfant'}
                      </div>
                      {document.helpText && (
                        <div className="mt-1 text-[8px] text-slate-400">
                          {document.helpText}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="space-y-4">
                {previewSections.map((section) => {
                  const fields = (fieldsBySection[section.id] ?? []).filter(
                    (field) => field.visible
                  );
                  if (!fields.length) return null;

                  return (
                    <fieldset
                      key={section.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
                    >
                      <legend className="px-1 text-xs font-bold">
                        {section.title}
                      </legend>
                      {section.description && (
                        <div className="text-[9px] text-slate-500 mb-3">
                          {section.description}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {fields.map((field) => (
                          <div
                            key={`${field.scope}:${field.key}`}
                            className={
                              field.type === 'TEXTAREA'
                                ? 'sm:col-span-2'
                                : undefined
                            }
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <label className="text-[9px] font-semibold text-slate-600 dark:text-slate-300">
                                {field.label}
                              </label>
                              <span className="text-[8px] text-slate-400">
                                {field.required ? 'Obligatoire' : 'Facultatif'}
                              </span>
                            </div>
                            <PreviewControl field={field} />
                            {field.helpText && (
                              <div className="mt-1 text-[8px] text-slate-400">
                                {field.helpText}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
};
