import React, { useEffect, useState } from 'react';
import { Check, Printer, Sliders } from 'lucide-react';
import { DatabaseSchema, SchoolClass, Student } from '../../types/school';
import { Modal } from '../common/Modal';

interface StudentCardGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  targetClass?: SchoolClass | null;
  db: DatabaseSchema;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const StudentCardGeneratorModal: React.FC<StudentCardGeneratorModalProps> = ({
  isOpen,
  onClose,
  student,
  targetClass,
  db,
  onShowToast,
}) => {
  const [cardTitle, setCardTitle] = useState("CARTE SCOLAIRE");
  const [themeColor, setThemeColor] = useState('#243f5a');
  const [showBirthDate, setShowBirthDate] = useState(true);
  const [showEmergency, setShowEmergency] = useState(true);
  const [showBloodType, setShowBloodType] = useState(false);
  const [showDirectionVisa, setShowDirectionVisa] = useState(true);
  const [showReference, setShowReference] = useState(true);
  const [printMode, setPrintMode] = useState<'SINGLE' | 'BATCH_CLASS'>('SINGLE');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(student?.id || '');

  useEffect(() => {
    if (!isOpen) return;
    const activeYearFallback = db.students.find(
      (candidate) => candidate.schoolYearId === db.currentSchoolYearId
    );
    setSelectedStudentId(student?.id || activeYearFallback?.id || '');
    setThemeColor(db.schoolConfig.badgeThemeColor || '#243f5a');
    setPrintMode('SINGLE');
  }, [isOpen, student?.id, db.currentSchoolYearId, db.schoolConfig.badgeThemeColor]);

  if (!isOpen) return null;

  const colorPresets = [
    { name: 'Bleu institutionnel', value: '#243f5a' },
    { name: 'Vert profond', value: '#285b4d' },
    { name: 'Bordeaux', value: '#733b42' },
    { name: 'Ardoise', value: '#475569' },
  ];

  const selectedStudent = db.students.find((item) => item.id === selectedStudentId) || null;
  const effectiveClass =
    targetClass ||
    (selectedStudent
      ? db.classes.find((item) => item.id === selectedStudent.classId)
      : db.classes[0]);

  const studentsToPrint =
    printMode === 'BATCH_CLASS' && effectiveClass
      ? db.students.filter(
          (item) =>
            item.classId === effectiveClass.id &&
            item.schoolYearId === db.currentSchoolYearId
        )
      : selectedStudent
      ? [selectedStudent]
      : [];

  const handlePrint = () => {
    window.print();
    onShowToast(
      printMode === 'BATCH_CLASS'
        ? `Impression de ${studentsToPrint.length} carte(s) pour ${effectiveClass?.name || 'la classe'}.`
        : `Impression de la carte de ${selectedStudent?.lastName || "l'élève"}.`,
      'success'
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cartes scolaires"
      subtitle="Format institutionnel, aperçu et impression."
      maxWidth="5xl"
      actions={
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="button button--secondary">
            Fermer
          </button>
          <button onClick={handlePrint} className="button button--primary">
            <Printer className="w-4 h-4" />
            {printMode === 'BATCH_CLASS'
              ? `Imprimer la classe (${studentsToPrint.length})`
              : 'Imprimer la carte'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
        <div className="page-panel p-4 space-y-4 text-xs">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <Sliders className="w-4 h-4 text-slate-500" />
            <span className="font-semibold">Paramètres de la carte</span>
          </div>

          <label className="block">
            <span className="block mb-1.5 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
              Intitulé
            </span>
            <input
              type="text"
              value={cardTitle}
              onChange={(event) => setCardTitle(event.target.value)}
              className="settings-input"
            />
          </label>

          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
              Couleur d'identification
            </div>
            <div className="flex gap-2">
              {colorPresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setThemeColor(preset.value)}
                  className="student-card-color"
                  style={{ backgroundColor: preset.value }}
                  title={preset.name}
                >
                  {themeColor === preset.value && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
              Informations visibles
            </div>
            {[
              ['Naissance', showBirthDate, setShowBirthDate],
              ["Contact d'urgence", showEmergency, setShowEmergency],
              ['Groupe sanguin', showBloodType, setShowBloodType],
              ['Référence de carte', showReference, setShowReference],
              ['Visa de la direction', showDirectionVisa, setShowDirectionVisa],
            ].map(([label, checked, setter]) => (
              <label key={String(label)} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  onChange={(event) =>
                    (setter as React.Dispatch<React.SetStateAction<boolean>>)(event.target.checked)
                  }
                />
                <span>{String(label)}</span>
              </label>
            ))}
          </div>

          <label className="block pt-3 border-t border-slate-200 dark:border-slate-800">
            <span className="block mb-1.5 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
              Élève
            </span>
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              className="settings-input"
            >
              {db.students
                .filter((item) => item.schoolYearId === db.currentSchoolYearId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.lastName} {item.firstName} — {item.matricule}
                  </option>
                ))}
            </select>
          </label>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="mb-2 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
              Impression
            </div>
            <div className="grid grid-cols-2 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setPrintMode('SINGLE')}
                className={`px-2 py-2 text-[10.5px] font-semibold ${
                  printMode === 'SINGLE'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-white dark:bg-slate-900'
                }`}
              >
                Une carte
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('BATCH_CLASS')}
                className={`px-2 py-2 text-[10.5px] font-semibold border-l border-slate-200 dark:border-slate-700 ${
                  printMode === 'BATCH_CLASS'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'bg-white dark:bg-slate-900'
                }`}
              >
                Classe
              </button>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Aperçu carte ISO/IEC 7810 ID-1
            </div>
            <div className="text-[10px] text-slate-500">
              {studentsToPrint.length} carte(s)
            </div>
          </div>

          <div
            id="printable-area"
            className="student-card-sheet"
          >
            {studentsToPrint.map((stu) => {
              const schoolClass = db.classes.find((item) => item.id === stu.classId);
              const schoolYear =
                db.schoolYears.find((item) => item.id === stu.schoolYearId)?.label ||
                'Année scolaire';
              return (
                <article
                  key={stu.id}
                  className="student-id-card"
                  style={{ '--card-accent': themeColor } as React.CSSProperties}
                >
                  <div className="student-id-card__accent" />

                  <header className="student-id-card__header">
                    <div className="student-id-card__identity">
                      {db.schoolConfig.logoUrl ? (
                        <img
                          src={db.schoolConfig.logoUrl}
                          alt="Logo établissement"
                          className="student-id-card__logo"
                        />
                      ) : (
                        <div className="student-id-card__logo-fallback">
                          {db.schoolConfig.acronym.slice(0, 3)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="student-id-card__school">{db.schoolConfig.name}</div>
                        <div className="student-id-card__title">{cardTitle}</div>
                      </div>
                    </div>
                    <div className="student-id-card__year">{schoolYear}</div>
                  </header>

                  <div className="student-id-card__body">
                    <div className="student-id-card__photo">
                      {stu.photoUrl ? (
                        <img src={stu.photoUrl} alt={`${stu.lastName} ${stu.firstName}`} />
                      ) : (
                        <div className="student-id-card__initials">
                          {stu.firstName.charAt(0)}
                          {stu.lastName.charAt(0)}
                        </div>
                      )}
                    </div>

                    <div className="student-id-card__details">
                      <div className="student-id-card__name">
                        {stu.lastName.toUpperCase()} {stu.firstName}
                      </div>

                      <div className="student-id-card__grid">
                        <div>
                          <span>Matricule</span>
                          <strong>{stu.matricule}</strong>
                        </div>
                        <div>
                          <span>Classe</span>
                          <strong>{schoolClass?.name || '—'}</strong>
                        </div>
                      </div>

                      {showBirthDate && (
                        <div className="student-id-card__row">
                          <span>Naissance</span>
                          <strong>{stu.birthDate} · {stu.birthPlace}</strong>
                        </div>
                      )}

                      {showEmergency && (
                        <div className="student-id-card__row">
                          <span>Urgence</span>
                          <strong>{stu.emergencyPhone || stu.fatherPhone || '—'}</strong>
                        </div>
                      )}

                      {showBloodType && stu.bloodType && (
                        <div className="student-id-card__row">
                          <span>Groupe sanguin</span>
                          <strong>{stu.bloodType}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  <footer className="student-id-card__footer">
                    <div>
                      {showReference ? (
                        <span>Réf. carte : {stu.matricule}</span>
                      ) : (
                        <span>{db.schoolConfig.city}</span>
                      )}
                    </div>
                    {showDirectionVisa && (
                      <div className="student-id-card__visa">
                        <span>Visa direction</span>
                        <i />
                      </div>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
};
