// EduGasy Pro - Comprehensive 100% Dynamic Configuration & Database Engine
import React, { useState } from 'react';
import {
  Settings,
  Building,
  Hash,
  Calendar,
  Layers,
  BookOpen,
  Database,
  Save,
  RotateCcw,
  FileDown,
  FileUp,
  CheckCircle2,
  PlusCircle,
  Trash2,
  Sparkles,
} from 'lucide-react';
import {
  DatabaseSchema,
  SchoolConfig,
  MatriculeConfig,
  SchoolYear,
  SchoolClass,
  Subject,
} from '../../types/school';
import { StorageService } from '../../services/storage';
import { MatriculeService } from '../../services/matricule';
import { CalculationService } from '../../services/calculations';
import { Modal } from '../common/Modal';

interface GeneralSettingsViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const GeneralSettingsView: React.FC<GeneralSettingsViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<
    'SCHOOL' | 'MATRICULE' | 'YEARS' | 'CLASSES' | 'SUBJECTS' | 'DATABASE'
  >('SCHOOL');

  // School Identity form state
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig>(db.schoolConfig);

  // Matricule Config form state
  const [matriculeConfig, setMatriculeConfig] = useState<MatriculeConfig>(db.matriculeConfig);

  // Class & Subject Management state
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);

  // New Subject form state
  const [newSubject, setNewSubject] = useState<Partial<Subject>>({
    code: '',
    name: '',
    category: 'LITTERAIRE',
    color: '#3b82f6',
    defaultCoeff: 2,
  });

  // Save School Identity
  const handleSaveSchoolIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedDb: DatabaseSchema = {
      ...db,
      schoolConfig,
    };
    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    onShowToast("Paramètres de l'établissement enregistrés.", 'success');
  };

  // Save Matricule Pattern
  const handleSaveMatriculeConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedDb: DatabaseSchema = {
      ...db,
      matriculeConfig,
    };
    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    onShowToast('Format des matricules mis à jour.', 'success');
  };

  // Add School Year
  const handleAddSchoolYear = () => {
    const nextYearLabel = '2026 - 2027';
    const newYear: SchoolYear = {
      id: `sy-${Date.now()}`,
      label: nextYearLabel,
      startDate: '2026-09-01',
      endDate: '2027-06-30',
      isCurrent: false,
      terms: [
        {
          id: `term-${Date.now()}-1`,
          code: 'TRIMESTRE_1',
          label: '1er Trimestre',
          startDate: '2026-09-01',
          endDate: '2026-12-18',
          weight: 1,
          isLocked: false,
        },
        {
          id: `term-${Date.now()}-2`,
          code: 'TRIMESTRE_2',
          label: '2ème Trimestre',
          startDate: '2027-01-04',
          endDate: '2027-03-26',
          weight: 1,
          isLocked: false,
        },
        {
          id: `term-${Date.now()}-3`,
          code: 'TRIMESTRE_3',
          label: '3ème Trimestre',
          startDate: '2027-04-12',
          endDate: '2027-06-25',
          weight: 1,
          isLocked: false,
        },
      ],
    };

    const updatedDb: DatabaseSchema = {
      ...db,
      schoolYears: [...db.schoolYears, newYear],
    };
    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    onShowToast(`Nouvelle session scolaire (${nextYearLabel}) ajoutée.`, 'success');
  };

  // Backup file upload handler
  const handleBackupUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await StorageService.importBackupJSON(file);
      onUpdateDb(imported);
      onShowToast('Base de données restaurée avec succès !', 'success');
    } catch (err: any) {
      onShowToast(`Échec de la restauration : ${err.message}`, 'error');
    }
  };

  // Reset to default Madagascar data
  const handleResetDefaults = () => {
    if (
      window.confirm(
        'Attention ! Cette action va réinitialiser toutes les données aux valeurs par défaut du Ministère de Madagascar. Continuer ?'
      )
    ) {
      const resetData = StorageService.resetToDefault();
      onUpdateDb(resetData);
      setSchoolConfig(resetData.schoolConfig);
      setMatriculeConfig(resetData.matriculeConfig);
      onShowToast('Données réinitialisées avec succès.', 'info');
    }
  };

  // Live Matricule Preview
  const livePreview = MatriculeService.previewPattern(matriculeConfig);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white m-0">
            Centre de Configuration Système (100% Paramétrable)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Personnalisation complète de l'établissement, du format des matricules, des séries et de la base locale
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            onClick={() => setActiveTab('SCHOOL')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'SCHOOL'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Établissement
          </button>
          <button
            onClick={() => setActiveTab('MATRICULE')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'MATRICULE'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Matricules
          </button>
          <button
            onClick={() => setActiveTab('YEARS')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'YEARS'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Années Scolaires
          </button>
          <button
            onClick={() => setActiveTab('CLASSES')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'CLASSES'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Classes & Séries
          </button>
          <button
            onClick={() => setActiveTab('DATABASE')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'DATABASE'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Base de Données
          </button>
        </div>
      </div>

      {/* TAB 1: IDENTITÉ ÉTABLISSEMENT */}
      {activeTab === 'SCHOOL' && (
        <form onSubmit={handleSaveSchoolIdentity} className="space-y-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 border-b border-slate-100 dark:border-slate-800 pb-2">
              <Building className="w-4 h-4" />
              <span>Informations Officielles du Ministère de l'Éducation Nationale</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Nom Complet de l'Établissement *</label>
                <input
                  type="text"
                  required
                  value={schoolConfig.name}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Sigle / Acronyme *</label>
                <input
                  type="text"
                  required
                  value={schoolConfig.acronym}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, acronym: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Devise de l'École</label>
                <input
                  type="text"
                  value={schoolConfig.motto}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, motto: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Seuil de Moyenne de Passage (/20)</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  value={schoolConfig.passingGrade || 10.0}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, passingGrade: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold font-mono text-blue-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Modèle de Texte du Mot de Rappel d'Écolage</label>
                <textarea
                  rows={2}
                  value={schoolConfig.reminderTemplate || ''}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, reminderTemplate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-sans"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Couleur par défaut des Cartes d'Élèves</label>
                <input
                  type="color"
                  value={schoolConfig.badgeThemeColor || '#1e40af'}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, badgeThemeColor: e.target.value })}
                  className="w-full h-10 p-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Adresse & Lot</label>
                <input
                  type="text"
                  value={schoolConfig.address}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Ville / Localité</label>
                <input
                  type="text"
                  value={schoolConfig.city}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Téléphone de l'Établissement</label>
                <input
                  type="text"
                  value={schoolConfig.phone}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Nom du Directeur / Chef d'Établissement</label>
                <input
                  type="text"
                  value={schoolConfig.directorName}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, directorName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Titre de la Direction</label>
                <input
                  type="text"
                  value={schoolConfig.directorTitle}
                  onChange={(e) => setSchoolConfig({ ...schoolConfig, directorTitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition flex items-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>Enregistrer les Paramètres de l'Établissement</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: GÉNÉRATEUR DE MATRICULES */}
      {activeTab === 'MATRICULE' && (
        <form onSubmit={handleSaveMatriculeConfig} className="space-y-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-5">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 border-b border-slate-100 dark:border-slate-800 pb-2">
              <Hash className="w-4 h-4" />
              <span>Générateur Automatique de Numéros Matricules</span>
            </div>

            {/* Live Interactive Preview */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-purple-950 via-slate-900 to-purple-950 text-white border border-purple-800/60 shadow-lg space-y-2">
              <div className="text-xs uppercase font-bold text-purple-300">
                Aperçu en Direct du Prochain Matricule Généré :
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-300 tracking-wider">
                {livePreview}
              </div>
              <div className="text-[11px] text-purple-200 font-light">
                Variables disponibles : <code className="bg-purple-900/60 px-1 py-0.5 rounded">{'{PREFIX}'}</code>,{' '}
                <code className="bg-purple-900/60 px-1 py-0.5 rounded">{'{YYYY}'}</code>,{' '}
                <code className="bg-purple-900/60 px-1 py-0.5 rounded">{'{YY}'}</code>,{' '}
                <code className="bg-purple-900/60 px-1 py-0.5 rounded">{'{LEVEL}'}</code>,{' '}
                <code className="bg-purple-900/60 px-1 py-0.5 rounded">{'{NUM4}'}</code>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Modèle / Formule du Pattern *</label>
                <input
                  type="text"
                  required
                  value={matriculeConfig.pattern}
                  onChange={(e) => setMatriculeConfig({ ...matriculeConfig, pattern: e.target.value })}
                  placeholder="Ex: LPSM-{YYYY}-{NUM4}"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Préfixe Personnalisé</label>
                <input
                  type="text"
                  value={matriculeConfig.prefix}
                  onChange={(e) => setMatriculeConfig({ ...matriculeConfig, prefix: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Nombre de chiffres incrémentaux</label>
                <select
                  value={matriculeConfig.numDigits}
                  onChange={(e) =>
                    setMatriculeConfig({ ...matriculeConfig, numDigits: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
                >
                  <option value={3}>3 chiffres (001 - 999)</option>
                  <option value={4}>4 chiffres (0001 - 9999)</option>
                  <option value={5}>5 chiffres (00001 - 99999)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Séparateur par défaut</label>
                <input
                  type="text"
                  value={matriculeConfig.separator}
                  onChange={(e) => setMatriculeConfig({ ...matriculeConfig, separator: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-center"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Compteur Actuel (Index de départ)</label>
                <input
                  type="number"
                  min="1"
                  value={matriculeConfig.currentCounter}
                  onChange={(e) =>
                    setMatriculeConfig({ ...matriculeConfig, currentCounter: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition flex items-center space-x-2"
              >
                <Save className="w-4 h-4" />
                <span>Enregistrer le Modèle de Matricule</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: GESTION DES ANNÉES SCOLAIRES */}
      {activeTab === 'YEARS' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Sessions & Années Scolaires Enregistrées
            </h3>
            <button
              onClick={handleAddSchoolYear}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Créer Session Suivante</span>
            </button>
          </div>

          <div className="space-y-3">
            {db.schoolYears.map((sy) => (
              <div
                key={sy.id}
                className={`p-4 rounded-xl border transition ${
                  sy.id === db.currentSchoolYearId
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      Année Scolaire {sy.label}
                    </span>
                    {sy.id === db.currentSchoolYearId && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                        SESSION ACTIVE
                      </span>
                    )}
                  </div>
                  {sy.id !== db.currentSchoolYearId && (
                    <button
                      onClick={() => {
                        const updated: DatabaseSchema = { ...db, currentSchoolYearId: sy.id };
                        StorageService.saveDatabase(updated);
                        onUpdateDb(updated);
                        onShowToast(`Session active basculée sur ${sy.label}`, 'info');
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-blue-600 hover:text-white transition"
                    >
                      Activer cette année
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {sy.terms.map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">{t.label}</div>
                        <div className="text-[10px] text-slate-400">
                          {t.startDate} au {t.endDate}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          t.isLocked ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {t.isLocked ? 'Verrouillé' : 'Ouvert'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: CLASSES & SÉRIES */}
      {activeTab === 'CLASSES' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Grille des Classes, Niveaux & Droits de Scolarité
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {db.classes.map((cls) => {
              const totalCoeff = cls.subjects.reduce((a, b) => a + b.coefficient, 0);
              return (
                <div
                  key={cls.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      {cls.name}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                      Série {cls.serie || 'GEN'}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <div>
                      Niveau : <strong>{cls.level.toUpperCase()}</strong> • Salle :{' '}
                      <strong>{cls.room}</strong>
                    </div>
                    <div>
                      Capacité : <strong>{cls.capacity} élèves</strong> • Matières :{' '}
                      <strong>{cls.subjects.length}</strong> (Total Coeff : {totalCoeff})
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Écolage mensuel :</span>
                      <strong className="text-blue-600 dark:text-blue-400">
                        {CalculationService.formatAriary(cls.monthlyTuitionFee)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Droit Inscription :</span>
                      <strong>{CalculationService.formatAriary(cls.registrationFee)}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: BASE DE DONNÉES & SAUVEGARDE */}
      {activeTab === 'DATABASE' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border-b border-slate-100 dark:border-slate-800 pb-2">
            <Database className="w-4 h-4" />
            <span>Gestion de la Base de Données Locale Autonome</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Download Backup */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <FileDown className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-xs text-slate-900 dark:text-white m-0">
                Sauvegarder la Base (JSON)
              </h4>
              <p className="text-[11px] text-slate-500">
                Téléchargez un instantané complet de tous les élèves, notes, fiches de paie et quittances.
              </p>
              <button
                onClick={() => StorageService.exportBackupJSON(db)}
                className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md transition"
              >
                Exporter Fichier Backup
              </button>
            </div>

            {/* Restore Backup */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <FileUp className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-xs text-slate-900 dark:text-white m-0">
                Restaurer une Sauvegarde
              </h4>
              <p className="text-[11px] text-slate-500">
                Chargez un fichier de sauvegarde .json précédemment exporté pour remplacer la base locale.
              </p>
              <label className="block w-full text-center py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-md cursor-pointer transition">
                <span>Importer Fichier Backup</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleBackupUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Reset to Madagascar Defaults */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-xs text-slate-900 dark:text-white m-0">
                Réinitialisation MEN Madagascar
              </h4>
              <p className="text-[11px] text-slate-500">
                Rétablit le jeu de données d'exemple officiel avec séries L/S/OSE, examens et coefficients.
              </p>
              <button
                onClick={handleResetDefaults}
                className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-md transition"
              >
                Réinitialiser par Défaut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
