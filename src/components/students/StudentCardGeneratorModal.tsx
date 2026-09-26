// EduGasy Pro - 100% Customizable Student ID Card Generator
import React, { useState } from 'react';
import {
  Printer,
  Sliders,
  Palette,
  Check,
  QrCode,
  ShieldCheck,
  Sparkles,
  Users,
  Eye,
} from 'lucide-react';
import { DatabaseSchema, Student, SchoolClass } from '../../types/school';
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
  const [cardTitle, setCardTitle] = useState("CARTE D'IDENTITÉ SCOLAIRE");
  const [themeColor, setThemeColor] = useState('#1e40af'); // Navy blue default
  const [showQrCode, setShowQrCode] = useState(true);
  const [showBirthDate, setShowBirthDate] = useState(true);
  const [showEmergency, setShowEmergency] = useState(true);
  const [showBloodType, setShowBloodType] = useState(false);
  const [showStamp, setShowStamp] = useState(true);
  const [printMode, setPrintMode] = useState<'SINGLE' | 'BATCH_CLASS'>('SINGLE');

  if (!isOpen) return null;

  const colorPresets = [
    { name: 'Bleu Marine', value: '#1e40af' },
    { name: 'Vert Émeraude', value: '#047857' },
    { name: 'Bordeaux / Rubis', value: '#991b1b' },
    { name: 'Indigo Royal', value: '#4338ca' },
    { name: 'Ardoise Foncée', value: '#334155' },
    { name: 'Ambre Doré', value: '#b45309' },
  ];

  const currentYear = db.schoolYears.find((y) => y.id === db.currentSchoolYearId)?.label || '2025-2026';
  const effectiveClass = targetClass || (student ? db.classes.find((c) => c.id === student.classId) : db.classes[0]);
  const studentsToPrint = printMode === 'BATCH_CLASS' && effectiveClass
    ? db.students.filter((s) => s.classId === effectiveClass.id && s.schoolYearId === db.currentSchoolYearId)
    : student
    ? [student]
    : [];

  const handlePrint = () => {
    window.print();
    onShowToast(
      printMode === 'BATCH_CLASS'
        ? `Impression de la planche de ${studentsToPrint.length} cartes pour ${effectiveClass?.name} lancée.`
        : `Impression de la carte de ${student?.lastName} lancée.`,
      'success'
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Générateur de Cartes Scolaires Personnalisables"
      subtitle="Personnalisation des couleurs, mentions, code QR et impression individuelle ou par planche"
      maxWidth="5xl"
      actions={
        <div className="flex items-center space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800"
          >
            Fermer
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-1.5 shadow-md shadow-blue-600/30"
          >
            <Printer className="w-4 h-4" />
            <span>
              {printMode === 'BATCH_CLASS'
                ? `Imprimer la Planche (${studentsToPrint.length} cartes)`
                : "Imprimer cette Carte"}
            </span>
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 1 Col: Customization Controls */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4 text-xs">
          <div className="font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5 border-b pb-2">
            <Sliders className="w-4 h-4 text-blue-500" />
            <span>Personnalisation du Design</span>
          </div>

          <div>
            <label className="block font-semibold mb-1">Titre de la Carte</label>
            <input
              type="text"
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border font-semibold"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">Couleur Principale du Badge</label>
            <div className="flex flex-wrap gap-2">
              {colorPresets.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setThemeColor(c.value)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition border-2 ${
                    themeColor === c.value ? 'border-white scale-110 shadow-md ring-2 ring-blue-500' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                >
                  {themeColor === c.value && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <span className="font-semibold block text-slate-700 dark:text-slate-300">
              Mentions à afficher :
            </span>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showQrCode}
                onChange={(e) => setShowQrCode(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded"
              />
              <span>Code QR / Code-Barres Sécurisé</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showBirthDate}
                onChange={(e) => setShowBirthDate(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded"
              />
              <span>Date et Lieu de Naissance</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showEmergency}
                onChange={(e) => setShowEmergency(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded"
              />
              <span>Contact d'Urgence / Parent</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showBloodType}
                onChange={(e) => setShowBloodType(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded"
              />
              <span>Groupe Sanguin</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showStamp}
                onChange={(e) => setShowStamp(e.target.checked)}
                className="w-3.5 h-3.5 text-blue-600 rounded"
              />
              <span>Cachet & Visa de la Direction</span>
            </label>
          </div>

          <div className="pt-2 border-t space-y-2">
            <span className="font-semibold block text-slate-700 dark:text-slate-300">
              Mode d'Impression :
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPrintMode('SINGLE')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition ${
                  printMode === 'SINGLE'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                }`}
              >
                Carte Seule
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('BATCH_CLASS')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition ${
                  printMode === 'BATCH_CLASS'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                }`}
              >
                Planche Classe ({effectiveClass?.name})
              </button>
            </div>
          </div>
        </div>

        {/* Right 2 Cols: Live Visual Preview & Printable Area */}
        <div className="lg:col-span-2 space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Aperçu Réel Avant Impression (Format Badge Standard)</span>
            <span className="text-[10px] text-slate-500 font-normal">
              {studentsToPrint.length} carte(s) sélectionnée(s)
            </span>
          </div>

          {/* Printable Container */}
          <div id="printable-area" className="flex flex-wrap gap-4 justify-center p-4 bg-slate-200/50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800 max-h-[500px] overflow-y-auto">
            {studentsToPrint.map((stu) => {
              const cls = db.classes.find((c) => c.id === stu.classId);
              return (
                <div
                  key={stu.id}
                  className="w-[330px] h-[205px] rounded-xl overflow-hidden shadow-xl border bg-white text-slate-900 flex flex-col justify-between font-sans relative flex-shrink-0 select-none"
                  style={{ borderColor: themeColor }}
                >
                  {/* Card Header */}
                  <div
                    className="px-3 py-1.5 text-white flex items-center justify-between relative overflow-hidden"
                    style={{ backgroundColor: themeColor }}
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center font-bold text-[10px]">
                        {db.schoolConfig.acronym?.slice(0, 3) || 'EDG'}
                      </div>
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-tight leading-none">
                          {db.schoolConfig.name}
                        </div>
                        <div className="text-[7.5px] font-medium opacity-90 leading-tight">
                          {cardTitle}
                        </div>
                      </div>
                    </div>
                    <div className="text-[8px] font-mono font-bold bg-white/20 px-1.5 py-0.5 rounded">
                      {currentYear}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="px-3 py-2 flex items-start space-x-3 flex-1">
                    {/* Photo Box */}
                    <div className="w-16 h-20 rounded-lg border-2 border-slate-300 bg-slate-100 flex flex-col items-center justify-center text-slate-400 flex-shrink-0 relative overflow-hidden shadow-inner">
                      <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center font-bold text-slate-600 text-xs">
                        {stu.firstName.charAt(0)}
                      </div>
                      <span className="text-[7px] uppercase font-bold mt-1 text-slate-400">Photo</span>
                    </div>

                    {/* Student Info */}
                    <div className="flex-1 space-y-0.5 text-[8.5px] leading-tight">
                      <div>
                        <span className="text-slate-400 uppercase text-[7px] block">Nom & Prénoms :</span>
                        <strong className="text-[10px] font-bold text-slate-900 block truncate">
                          {stu.lastName} {stu.firstName}
                        </strong>
                      </div>

                      <div className="grid grid-cols-2 gap-1 pt-0.5">
                        <div>
                          <span className="text-slate-400 text-[7px] block">Matricule :</span>
                          <strong className="font-mono font-bold" style={{ color: themeColor }}>
                            {stu.matricule}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[7px] block">Classe :</span>
                          <strong className="font-bold text-slate-900">
                            {cls?.name || 'Générale'}
                          </strong>
                        </div>
                      </div>

                      {showBirthDate && (
                        <div>
                          <span className="text-slate-400 text-[7px] block">Né(e) le :</span>
                          <span className="text-slate-700">
                            {stu.birthDate} à {stu.birthPlace}
                          </span>
                        </div>
                      )}

                      {showEmergency && (
                        <div>
                          <span className="text-slate-400 text-[7px] block">Urgence :</span>
                          <span className="text-slate-700 font-mono">
                            {stu.emergencyPhone || stu.fatherPhone || '-'}
                          </span>
                        </div>
                      )}

                      {showBloodType && stu.bloodType && (
                        <div>
                          <span className="text-slate-400 text-[7px]">Groupe Sanguin : </span>
                          <strong className="text-rose-600">{stu.bloodType}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Bar */}
                  <div className="px-3 py-1 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[7.5px] text-slate-500">
                    {showQrCode ? (
                      <div className="flex items-center space-x-1">
                        <QrCode className="w-3.5 h-3.5 text-slate-700" />
                        <span className="font-mono text-[7px]">ID:{stu.matricule}</span>
                      </div>
                    ) : (
                      <span>{db.schoolConfig.city || 'Madagascar'}</span>
                    )}

                    {showStamp && (
                      <div className="text-right">
                        <span className="italic text-[7px] text-slate-400">Le Proviseur / Direction</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
};
