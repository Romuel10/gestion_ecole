import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  Moon,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react';
import type { DatabaseSchema, SchoolClass, Subject } from '../../types/school';
import {
  finishFirstSetup,
  setupErrors,
  splitSetupTerms,
} from '../../services/firstSetup';
import { StorageService } from '../../services/storage';
import { DateInput } from '../common/DateInput';
import { reportInvalidDates } from '../../services/dateInputValidation';

const steps = [
  'Votre école',
  'Année scolaire',
  'Classes et frais',
  'Matières',
  'Vérification',
];
type Props = {
  db: DatabaseSchema;
  onUpdateDb: (db: DatabaseSchema) => void;
  onComplete: (db: DatabaseSchema) => void;
  onShowToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  isDark: boolean;
  onToggleTheme: () => void;
};

export function SchoolSetupWizard({
  db,
  onUpdateDb,
  onComplete,
  onShowToast,
  isDark,
  onToggleTheme,
}: Props) {
  const [draft, setDraft] = useState(() => structuredClone(db));
  const [step, setStep] = useState(
    Math.min(4, Math.max(0, db.schoolConfig.setupState?.step || 0)),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const year = draft.schoolYears.find(
    (item) => item.id === draft.currentSchoolYearId,
  )!;
  const config = draft.schoolConfig;
  const updateConfig = (key: string, value: string) =>
    setDraft((current) => ({
      ...current,
      schoolConfig: { ...current.schoolConfig, [key]: value },
    }));
  const updateYear = (patch: Partial<typeof year>) =>
    setDraft((current) => ({
      ...current,
      schoolYears: current.schoolYears.map((item) =>
        item.id === year.id ? { ...item, ...patch } : item,
      ),
    }));
  const updateClass = (id: string, patch: Partial<SchoolClass>) =>
    setDraft((current) => ({
      ...current,
      classes: current.classes.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  const updateSubject = (id: string, patch: Partial<Subject>) =>
    setDraft((current) => ({
      ...current,
      subjects: current.subjects.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
      classes:
        patch.defaultCoeff === undefined
          ? current.classes
          : current.classes.map((cls) => ({
              ...cls,
              subjects: cls.subjects.map((subject) =>
                subject.subjectId === id
                  ? { ...subject, coefficient: patch.defaultCoeff! }
                  : subject,
              ),
            })),
    }));
  const navigate = async (next: number) => {
    if (busy || reportInvalidDates()) return;
    const problems = next > step ? setupErrors(draft, step) : [];
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    try {
      const proposed =
        next > 4
          ? finishFirstSetup(draft)
          : {
              ...draft,
              schoolConfig: { ...config, setupState: { step: next } },
            };
      const saved = await StorageService.saveDatabaseOrNotify(
        proposed,
        db,
        onShowToast,
      );
      if (!saved) return;
      onUpdateDb(saved);
      setDraft(saved);
      if (next > 4) {
        onShowToast(
          'Votre école est prête. Vous pouvez importer les enseignants et les élèves.',
          'success',
        );
        onComplete(saved);
      } else {
        setStep(next);
        window.scrollTo({ top: 0 });
      }
    } catch (error) {
      setErrors([
        error instanceof Error ? error.message : 'Configuration impossible.',
      ]);
    } finally {
      setBusy(false);
    }
  };
  const field = (
    label: string,
    key: string,
    required = false,
    type = 'text',
  ) => (
    <label className="block" key={key}>
      <span className="block mb-1 text-xs font-semibold">
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        className="settings-input"
        type={type}
        value={String(config[key as keyof typeof config] ?? '')}
        onChange={(event) => updateConfig(key, event.target.value)}
        required={required}
      />
    </label>
  );
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8 text-slate-800 dark:text-slate-100">
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div className="flex gap-3 items-center">
            <GraduationCap className="w-9 h-9 text-teal-700 dark:text-teal-300 shrink-0" />
            <div>
              <p className="text-xs font-bold tracking-widest text-teal-700 dark:text-teal-300">
                BIENVENUE DANS SEKOLY
              </p>
              <h1 className="text-xl sm:text-2xl font-bold">
                Configurons votre école
              </h1>
            </div>
          </div>
          <button
            className="button button--secondary"
            type="button"
            onClick={onToggleTheme}
            aria-label="Changer le thème"
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Cet assistant vous accompagne avant la première utilisation. Chaque
          étape validée est enregistrée ; vous pourrez reprendre après avoir
          fermé le logiciel.
        </p>
        <ol
          className="grid grid-cols-2 sm:grid-cols-5 gap-2"
          aria-label="Étapes de configuration"
        >
          {steps.map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? 'step' : undefined}
              className={`rounded-lg p-3 text-xs border ${step === index ? 'bg-teal-800 text-white border-teal-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}
            >
              <span className="font-bold mr-2">
                {index < step ? '✓' : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <form
          className="page-panel p-4 sm:p-6 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate(step + 1);
          }}
        >
          <h2 className="text-lg font-bold">{steps[step]}</h2>
          {step === 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              {field('Nom de l’établissement', 'name', true)}
              {field('Sigle de l’école', 'acronym', true)}
              {field('Ville', 'city', true)}
              {field('Adresse', 'address')}
              {field('Téléphone', 'phone')}
              {field('Email', 'email', false, 'email')}
              {field('Nom du directeur', 'directorName')}
              {field('Titre du directeur', 'directorTitle')}
              {field('Devise', 'currency', true)}
              {field('Devise de l’école / slogan', 'motto')}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <label>
                  Libellé de l’année
                  <input
                    className="settings-input mt-1"
                    value={year.label}
                    onChange={(event) =>
                      updateYear({ label: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Début de l’année
                  <DateInput
                    className="settings-input mt-1"
                    value={year.startDate}
                    onChange={(event) =>
                      updateYear({ startDate: event.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Fin de l’année
                  <DateInput
                    className="settings-input mt-1"
                    value={year.endDate}
                    onChange={(event) =>
                      updateYear({ endDate: event.target.value })
                    }
                    required
                  />
                </label>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => updateYear({ terms: splitSetupTerms(year) })}
              >
                Répartir en 3 trimestres
              </button>
              <p className="text-xs text-slate-500">
                Ajustez les dates des périodes selon votre calendrier scolaire.
              </p>
              {year.terms.map((term, index) => (
                <fieldset
                  key={term.id}
                  className="grid sm:grid-cols-3 gap-3 border border-slate-200 dark:border-slate-700 rounded-lg p-3"
                >
                  <legend className="text-xs font-bold px-1">
                    Période {index + 1}
                  </legend>
                  <label>
                    Nom
                    <input
                      className="settings-input"
                      value={term.label}
                      required
                      onChange={(event) =>
                        updateYear({
                          terms: year.terms.map((item) =>
                            item.id === term.id
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Début
                    <DateInput
                      className="settings-input"
                      value={term.startDate}
                      required
                      onChange={(event) =>
                        updateYear({
                          terms: year.terms.map((item) =>
                            item.id === term.id
                              ? { ...item, startDate: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Fin
                    <DateInput
                      className="settings-input"
                      value={term.endDate}
                      required
                      onChange={(event) =>
                        updateYear({
                          terms: year.terms.map((item) =>
                            item.id === term.id
                              ? { ...item, endDate: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                </fieldset>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Créez les classes où vous inscrirez les élèves. Les frais
                peuvent être nuls.
              </p>
              {draft.classes.map((cls, index) => (
                <fieldset
                  key={cls.id}
                  className="border border-slate-200 dark:border-slate-700 p-3 rounded-lg"
                >
                  <legend className="text-xs font-bold px-1">
                    Classe {index + 1}
                  </legend>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <label>
                      Code
                      <input
                        className="settings-input"
                        value={cls.code}
                        required
                        onChange={(event) =>
                          updateClass(cls.id, {
                            code: event.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label>
                      Nom de la classe
                      <input
                        className="settings-input"
                        value={cls.name}
                        required
                        onChange={(event) =>
                          updateClass(cls.id, { name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Niveau
                      <select
                        className="settings-input"
                        value={cls.level}
                        onChange={(event) =>
                          updateClass(cls.id, {
                            level: event.target.value as SchoolClass['level'],
                          })
                        }
                      >
                        <option value="primaire">Primaire</option>
                        <option value="college">Collège</option>
                        <option value="lycee">Lycée</option>
                      </select>
                    </label>
                    <label>
                      Effectif maximal
                      <input
                        className="settings-input"
                        type="number"
                        min="1"
                        step="1"
                        value={cls.capacity}
                        onChange={(event) =>
                          updateClass(cls.id, {
                            capacity: Number(event.target.value),
                          })
                        }
                        required
                      />
                    </label>
                    <label>
                      Écolage mensuel ({config.currency})
                      <input
                        className="settings-input"
                        type="number"
                        min="0"
                        value={cls.monthlyTuitionFee}
                        onChange={(event) =>
                          updateClass(cls.id, {
                            monthlyTuitionFee: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Frais d’inscription ({config.currency})
                      <input
                        className="settings-input"
                        type="number"
                        min="0"
                        value={cls.registrationFee}
                        onChange={(event) =>
                          updateClass(cls.id, {
                            registrationFee: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Frais de réinscription ({config.currency})
                      <input
                        className="settings-input"
                        type="number"
                        min="0"
                        value={cls.reRegistrationFee}
                        onChange={(event) =>
                          updateClass(cls.id, {
                            reRegistrationFee: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="button button--secondary mt-3"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        classes: current.classes.filter(
                          (item) => item.id !== cls.id,
                        ),
                      }))
                    }
                  >
                    <Trash2 size={14} /> Supprimer cette classe
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                className="button button--secondary"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    classes: [
                      ...current.classes,
                      {
                        id: crypto.randomUUID(),
                        code: '',
                        name: '',
                        level: 'college',
                        room: '',
                        capacity: 40,
                        subjects: current.subjects.map((subject) => ({
                          subjectId: subject.id,
                          coefficient: subject.defaultCoeff,
                        })),
                        monthlyTuitionFee: 0,
                        registrationFee: 0,
                        reRegistrationFee: 0,
                      },
                    ],
                  }))
                }
              >
                <Plus size={14} /> Ajouter une classe
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Ajoutez les matières puis choisissez les classes qui les
                enseignent. Vous pourrez affecter les professeurs dans les
                paramètres.
              </p>
              {draft.subjects.map((subject, index) => (
                <fieldset
                  key={subject.id}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg p-3"
                >
                  <legend className="text-xs font-bold px-1">
                    Matière {index + 1}
                  </legend>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <label>
                      Code matière
                      <input
                        className="settings-input"
                        value={subject.code}
                        required
                        onChange={(event) =>
                          updateSubject(subject.id, {
                            code: event.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label>
                      Nom de la matière
                      <input
                        className="settings-input"
                        value={subject.name}
                        required
                        onChange={(event) =>
                          updateSubject(subject.id, {
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Coefficient
                      <input
                        className="settings-input"
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={subject.defaultCoeff}
                        required
                        onChange={(event) =>
                          updateSubject(subject.id, {
                            defaultCoeff: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-3">
                    {draft.classes.map((cls) => (
                      <label
                        key={cls.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={cls.subjects.some(
                            (item) => item.subjectId === subject.id,
                          )}
                          onChange={(event) =>
                            updateClass(cls.id, {
                              subjects: event.target.checked
                                ? [
                                    ...cls.subjects,
                                    {
                                      subjectId: subject.id,
                                      coefficient: subject.defaultCoeff,
                                    },
                                  ]
                                : cls.subjects.filter(
                                    (item) => item.subjectId !== subject.id,
                                  ),
                            })
                          }
                        />
                        {cls.name}
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="button button--secondary mt-3"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        subjects: current.subjects.filter(
                          (item) => item.id !== subject.id,
                        ),
                        classes: current.classes.map((cls) => ({
                          ...cls,
                          subjects: cls.subjects.filter(
                            (item) => item.subjectId !== subject.id,
                          ),
                        })),
                      }))
                    }
                  >
                    <Trash2 size={14} /> Supprimer cette matière
                  </button>
                </fieldset>
              ))}
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  const id = crypto.randomUUID();
                  setDraft((current) => ({
                    ...current,
                    subjects: [
                      ...current.subjects,
                      {
                        id,
                        code: '',
                        name: '',
                        defaultCoeff: 1,
                        category: 'LITTERAIRE',
                        color: '#183f4a',
                      },
                    ],
                    classes: current.classes.map((cls) => ({
                      ...cls,
                      subjects: [
                        ...cls.subjects,
                        { subjectId: id, coefficient: 1 },
                      ],
                    })),
                  }));
                }}
              >
                <Plus size={14} /> Ajouter une matière
              </button>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg bg-teal-50 dark:bg-teal-950/40 p-4">
                <h3 className="font-bold">
                  {config.name} ({config.acronym})
                </h3>
                <p className="text-sm mt-1">
                  {config.city} · {year.label} · {year.terms.length} périodes
                </p>
                <p className="text-sm mt-2">
                  {draft.classes.length} classe(s) · {draft.subjects.length}{' '}
                  matière(s)
                </p>
              </div>
              {draft.classes.map((cls) => (
                <p key={cls.id} className="text-sm">
                  <strong>{cls.name}</strong> —{' '}
                  {cls.subjects
                    .map(
                      (item) =>
                        draft.subjects.find(
                          (subject) => subject.id === item.subjectId,
                        )?.name,
                    )
                    .join(', ')}{' '}
                  · Écolage : {cls.monthlyTuitionFee} {config.currency}
                </p>
              ))}
              <p className="text-sm text-slate-500">
                Après validation, importez vos enseignants et vos élèves depuis
                Excel. Tous ces paramètres restent modifiables dans Paramètres.
              </p>
            </div>
          )}
          {errors.length > 0 && (
            <div
              role="alert"
              className="bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 rounded-lg p-3 text-sm"
            >
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}
          <footer className="flex flex-wrap justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              className="button button--secondary"
              disabled={step === 0 || busy}
              onClick={() => void navigate(step - 1)}
            >
              <ArrowLeft size={15} /> Précédent
            </button>
            <button
              type="submit"
              className="button button--primary"
              disabled={busy}
            >
              {busy
                ? 'Enregistrement…'
                : step === 4
                  ? 'Terminer la configuration'
                  : 'Enregistrer et continuer'}
              {step === 4 ? <Check size={15} /> : <ArrowRight size={15} />}
            </button>
          </footer>
        </form>
      </div>
    </main>
  );
}
