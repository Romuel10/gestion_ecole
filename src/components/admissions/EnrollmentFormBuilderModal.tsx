import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileCheck2,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  EnrollmentCampaign,
  EnrollmentFormField,
  EnrollmentFormFieldType,
  EnrollmentFormSchema,
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

const fieldSectionKey = (field: EnrollmentFormField) =>
  field.custom ? `CUSTOM_${field.scope}` : field.group;

const normalizedOptions = (options?: string[]) =>
  Array.from(
    new Set(
      (options ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

export const EnrollmentFormBuilderModal: React.FC<EnrollmentFormBuilderModalProps> = ({
  campaign,
  isOpen,
  onClose,
  onSave,
}) => {
  const initial = campaign?.form_schema;
  const [draft, setDraft] = useState<EnrollmentFormSchema | null>(
    initial ? cloneSchema(initial) : null
  );
  const [saving, setSaving] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customScope, setCustomScope] = useState<'FAMILY' | 'CHILD'>('FAMILY');
  const [customType, setCustomType] = useState<EnrollmentFormFieldType>('TEXT');
  const [customRequired, setCustomRequired] = useState(false);
  const [customOptions, setCustomOptions] = useState('');
  const [customHelp, setCustomHelp] = useState('');

  React.useEffect(() => {
    if (isOpen && campaign?.form_schema) {
      setDraft(cloneSchema(campaign.form_schema));
    }
  }, [isOpen, campaign?.id, campaign?.form_schema_version]);

  const groupedFields = useMemo(() => {
    const groups: Record<string, EnrollmentFormField[]> = {};
    for (const field of draft?.fields ?? []) {
      const key = fieldSectionKey(field);
      (groups[key] ||= []).push(field);
    }
    Object.values(groups).forEach((items) =>
      items.sort((a, b) => a.order - b.order)
    );
    return groups;
  }, [draft]);

  if (!campaign || !draft) return null;

  const updateField = (
    key: string,
    scope: EnrollmentFormField['scope'],
    values: Partial<EnrollmentFormField>
  ) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            fields: current.fields.map((field) =>
              field.key === key && field.scope === scope
                ? { ...field, ...values }
                : field
            ),
          }
        : current
    );
  };

  const moveField = (
    key: string,
    scope: EnrollmentFormField['scope'],
    direction: -1 | 1
  ) => {
    setDraft((current) => {
      if (!current) return current;

      const currentField = current.fields.find(
        (field) => field.key === key && field.scope === scope
      );
      if (!currentField) return current;

      const sectionKey = fieldSectionKey(currentField);
      const sectionFields = current.fields
        .filter((field) => fieldSectionKey(field) === sectionKey)
        .sort((a, b) => a.order - b.order);

      const index = sectionFields.findIndex(
        (field) => field.key === key && field.scope === scope
      );
      const swapIndex = index + direction;
      if (
        index < 0 ||
        swapIndex < 0 ||
        swapIndex >= sectionFields.length
      ) {
        return current;
      }

      const a = sectionFields[index];
      const b = sectionFields[swapIndex];

      return {
        ...current,
        fields: current.fields.map((field) => {
          if (field.key === a.key && field.scope === a.scope) {
            return { ...field, order: b.order };
          }
          if (field.key === b.key && field.scope === b.scope) {
            return { ...field, order: a.order };
          }
          return field;
        }),
      };
    });
  };

  const addCustomField = () => {
    const label = customLabel.trim();
    if (!label) return;
    const options =
      customType === 'SELECT'
        ? normalizedOptions(customOptions.split(/\n|,/))
        : undefined;
    if (customType === 'SELECT' && (!options || options.length === 0)) return;

    const suffix =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Date.now().toString(36);
    const key = `custom_${safeSlug(label) || 'champ'}_${suffix}`;
    const maxOrder = Math.max(0, ...(draft.fields.map((field) => field.order) || [0]));

    setDraft({
      ...draft,
      fields: [
        ...draft.fields,
        {
          key,
          scope: customScope,
          group: 'CUSTOM',
          label,
          type: customType,
          visible: true,
          required: customRequired,
          custom: true,
          order: maxOrder + 10,
          helpText: customHelp.trim() || undefined,
          options,
        },
      ],
    });
    setCustomLabel('');
    setCustomRequired(false);
    setCustomOptions('');
    setCustomHelp('');
    setCustomType('TEXT');
  };

  const deleteCustomField = (field: EnrollmentFormField) => {
    if (!field.custom) return;
    const confirmed = window.confirm(
      `Supprimer le champ « ${field.label} » pour les prochaines inscriptions ? Les dossiers déjà envoyés conserveront leurs réponses.`
    );
    if (!confirmed) return;

    setDraft({
      ...draft,
      fields: draft.fields.filter(
        (item) => !(item.key === field.key && item.scope === field.scope)
      ),
    });
  };

  const draftErrors = useMemo(() => {
    const errors: string[] = [];
    const identities = new Set<string>();

    for (const field of draft?.fields ?? []) {
      const identity = `${field.scope}:${field.key}`;
      if (identities.has(identity)) {
        errors.push(`Le champ « ${field.label || field.key} » existe en double.`);
      }
      identities.add(identity);

      if (field.custom && !field.label.trim()) {
        errors.push('Un champ personnalisé a un libellé vide.');
      }

      if (
        field.visible &&
        field.type === 'SELECT' &&
        normalizedOptions(field.options).length === 0
      ) {
        errors.push(
          `Le champ « ${field.label || field.key} » doit proposer au moins un choix.`
        );
      }
    }

    return Array.from(new Set(errors));
  }, [draft]);

  const save = async () => {
    if (draftErrors.length > 0) return;

    setSaving(true);
    try {
      await onSave({
        ...draft,
        schemaVersion: Math.max(1, Number(draft.schemaVersion || 1)),
        fields: [...draft.fields]
          .map((field) => ({
            ...field,
            label: field.label.trim(),
            helpText: field.helpText?.trim() || undefined,
            required: field.visible ? field.required : false,
            options:
              field.type === 'SELECT'
                ? normalizedOptions(field.options)
                : undefined,
          }))
          .sort((a, b) => a.order - b.order),
        documents: [...draft.documents]
          .map((document) => ({
            ...document,
            required: document.visible ? document.required : false,
          }))
          .sort((a, b) => a.order - b.order),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: EnrollmentFormField) => (
    <div
      key={`${field.scope}:${field.key}`}
      className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
    >
      <div>
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
        {field.custom && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
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
            <div>
              <label className="block text-[9px] font-bold text-slate-400 mb-1">
                Pour qui ?
              </label>
              <select
                className="settings-input"
                value={field.scope}
                onChange={(event) =>
                  updateField(field.key, field.scope, {
                    scope: event.target.value as 'FAMILY' | 'CHILD',
                  })
                }
              >
                <option value="FAMILY">Famille / responsable</option>
                <option value="CHILD">Chaque enfant</option>
              </select>
            </div>
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
                  ['TEXT', 'TEXTAREA', 'DATE', 'EMAIL', 'PHONE', 'NUMBER', 'SELECT', 'YES_NO'] as EnrollmentFormFieldType[]
                ).map((type) => (
                  <option key={type} value={type}>
                    {typeLabel[type]}
                  </option>
                ))}
              </select>
            </div>
            {field.type === 'SELECT' && (
              <div className="md:col-span-3">
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
            <div className="md:col-span-3">
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
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end">
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
            disabled={
              Boolean(field.locked) && field.key !== 'existingMatricule'
            }
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
          title="Monter"
          onClick={() => moveField(field.key, field.scope, -1)}
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Descendre"
          onClick={() => moveField(field.key, field.scope, 1)}
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        {field.custom && (
          <button
            type="button"
            className="icon-button"
            title="Supprimer ce champ personnalisé"
            onClick={() => deleteCustomField(field)}
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
          </button>
        )}
      </div>
    </div>
  );

  const sections: Array<[string, string]> = [
    ['PRIMARY', 'Responsable principal'],
    ['SECONDARY', 'Deuxième responsable'],
    ['CHILD', 'Enfant'],
    ['CUSTOM_FAMILY', 'Champs personnalisés · famille'],
    ['CUSTOM_CHILD', 'Champs personnalisés · enfant'],
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Personnaliser le formulaire parents"
      subtitle={`${campaign.name} · version ${campaign.form_schema_version}`}
      maxWidth="5xl"
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
            disabled={saving || draftErrors.length > 0}
          >
            <Settings2 className="w-3.5 h-3.5" />
            {saving ? 'Enregistrement…' : 'Publier cette configuration'}
          </button>
        </>
      }
    >
      <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-[11px] text-blue-900 dark:text-blue-200">
        Les champs essentiels d’identification restent verrouillés. Les autres peuvent
        être masqués ou rendus facultatifs. Chaque modification crée une nouvelle
        version : les dossiers déjà envoyés conservent exactement le formulaire et
        les réponses qui existaient au moment de leur envoi.
      </div>

      {draftErrors.length > 0 && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-[11px] text-rose-900 dark:text-rose-200">
          <div className="font-semibold mb-1">
            Corrigez la configuration avant de la publier :
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            {draftErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-5">
        {sections.map(([key, label]) => {
          const items = groupedFields[key] ?? [];
          if (!items.length && !key.startsWith('CUSTOM_')) return null;
          return (
            <section key={key} className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                {label}
              </div>
              {items.length ? (
                items.map(renderField)
              ) : (
                <div className="text-[10px] text-slate-400 italic">
                  Aucun champ personnalisé.
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section className="p-4 rounded-xl border border-dashed border-violet-300 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-violet-600" />
          <div>
            <div className="font-semibold text-xs">Ajouter un champ</div>
            <div className="text-[10px] text-slate-500">
              Pour une information propre à l’établissement : transport scolaire,
              langue, personne autorisée, observation administrative, etc.
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
              onChange={(event) =>
                setCustomScope(event.target.value as 'FAMILY' | 'CHILD')
              }
            >
              <option value="FAMILY">Famille / responsable</option>
              <option value="CHILD">Chaque enfant</option>
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
                ['TEXT', 'TEXTAREA', 'DATE', 'EMAIL', 'PHONE', 'NUMBER', 'SELECT', 'YES_NO'] as EnrollmentFormFieldType[]
              ).map((type) => (
                <option key={type} value={type}>
                  {typeLabel[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 min-h-[42px] text-xs font-semibold">
              <input
                type="checkbox"
                checked={customRequired}
                onChange={(event) => setCustomRequired(event.target.checked)}
              />
              Réponse obligatoire
            </label>
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
                placeholder="Un choix par ligne, par exemple :\nÀ pied\nBus scolaire\nVoiture"
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
              placeholder="Une courte précision pour éviter les erreurs de saisie."
            />
          </div>
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={addCustomField}
          disabled={
            !customLabel.trim() ||
            (customType === 'SELECT' && !customOptions.trim())
          }
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter au formulaire
        </button>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-emerald-600" />
          <div>
            <div className="font-semibold text-xs">Pièces justificatives</div>
            <div className="text-[10px] text-slate-500">
              Choisissez les pièces affichées aux familles et celles qui seront
              obligatoires pour considérer le dossier complet.
            </div>
          </div>
        </div>
        {(draft.documents ?? []).map((document) => (
          <div
            key={document.code}
            className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700"
          >
            <div>
              <div className="font-semibold text-xs">{document.label}</div>
              <div className="text-[9px] uppercase text-slate-400">
                {document.scope === 'FAMILY' ? 'Famille' : 'Chaque enfant'}
              </div>
            </div>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-[10px] font-semibold">
                <input
                  type="checkbox"
                  checked={document.visible}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      documents: draft.documents.map((item) =>
                        item.code === document.code
                          ? {
                              ...item,
                              visible: event.target.checked,
                              required: event.target.checked
                                ? item.required
                                : false,
                            }
                          : item
                      ),
                    })
                  }
                />
                Afficher
              </label>
              <label className="flex items-center gap-1.5 text-[10px] font-semibold">
                <input
                  type="checkbox"
                  checked={document.required}
                  disabled={!document.visible}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      documents: draft.documents.map((item) =>
                        item.code === document.code
                          ? { ...item, required: event.target.checked }
                          : item
                      ),
                    })
                  }
                />
                Obligatoire
              </label>
            </div>
          </div>
        ))}
      </section>
    </Modal>
  );
};
