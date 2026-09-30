import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Eye,
  Edit2,
  Trash2,
  Printer,
  FileDown,
  UserPlus,
  CreditCard,
  Users,
  X,
  Upload,
  FileSpreadsheet,
} from 'lucide-react';
import { DatabaseSchema, Student } from '../../types/school';
import { StorageService } from '../../services/storage';
import { ExcelExporterService } from '../../services/excelExporter';
import {
  ExcelImportService,
  StudentImportPreview,
} from '../../services/excelImporter';
import { PdfGeneratorService } from '../../services/pdfGenerator';
import { StudentDetailModal } from './StudentDetailModal';
import { StudentFormModal } from './StudentFormModal';
import { StudentCardGeneratorModal } from './StudentCardGeneratorModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ExcelImportModal } from '../common/ExcelImportModal';

interface StudentListViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onOpenNewAdmission: () => void;
  initialSelectedStudentId?: string;
}

export const StudentListView: React.FC<StudentListViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
  onOpenNewAdmission,
  initialSelectedStudentId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [selectedGender, setSelectedGender] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Modals state
  const [viewingStudent, setViewingStudent] = useState<Student | null>(
    initialSelectedStudentId
      ? db.students.find((s) => s.id === initialSelectedStudentId) || null
      : null
  );
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [cardModalStudent, setCardModalStudent] = useState<Student | null>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [studentImportPreview, setStudentImportPreview] =
    useState<StudentImportPreview | null>(null);
  const [studentImportFileName, setStudentImportFileName] = useState('');

  // Focus automatique sur la recherche à l'ouverture de la vue
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!initialSelectedStudentId) return;
    const target = db.students.find(
      (student) =>
        student.id === initialSelectedStudentId &&
        student.schoolYearId === db.currentSchoolYearId
    );
    if (target) setViewingStudent(target);
  }, [initialSelectedStudentId, db.students, db.currentSchoolYearId]);

  const activeYearStudents = db.students.filter(
    (student) => student.schoolYearId === db.currentSchoolYearId
  );

  // Filters
  const filteredStudents = activeYearStudents.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    const matchQuery =
      !q ||
      s.lastName.toLowerCase().includes(q) ||
      s.firstName.toLowerCase().includes(q) ||
      s.matricule.toLowerCase().includes(q);

    const matchClass = selectedClassId === 'ALL' || s.classId === selectedClassId;
    const matchGender = selectedGender === 'ALL' || s.gender === selectedGender;
    const matchStatus = selectedStatus === 'ALL' || s.status === selectedStatus;

    return matchQuery && matchClass && matchGender && matchStatus;
  });

  const classMap = new Map(db.classes.map((c) => [c.id, c.name]));
  const currentSelectedClassObj = db.classes.find((c) => c.id === selectedClassId) || null;

  const handleStudentExcelFile = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (db.classes.length === 0) {
      onShowToast(
        'Configurez d’abord les classes dans Paramètres > Classes avant d’importer les élèves.',
        'error'
      );
      return;
    }

    try {
      const preview = await ExcelImportService.parseStudents(file, db);
      setStudentImportPreview(preview);
      setStudentImportFileName(file.name);
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Impossible de lire ce fichier Excel.',
        'error'
      );
    }
  };

  const confirmStudentImport = () => {
    if (!studentImportPreview || studentImportPreview.issues.length > 0) return;

    const updatedDb: DatabaseSchema = {
      ...db,
      students: [...db.students, ...studentImportPreview.students],
      matriculeConfig: {
        ...db.matriculeConfig,
        currentCounter: studentImportPreview.nextCounter,
      },
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    onShowToast(
      `${studentImportPreview.students.length} élève(s) importé(s) depuis Excel.`,
      'success'
    );
    setStudentImportPreview(null);
    setStudentImportFileName('');
  };

  const handleDeleteStudent = (student: Student) => {
    const hasAcademicHistory = db.grades.some((g) => g.studentId === student.id);
    const hasAttendanceHistory = db.attendanceRecords.some((a) => a.studentId === student.id);
    const hasFinancialHistory = db.tuitionPayments.some((p) => p.studentId === student.id);

    if (hasAcademicHistory || hasAttendanceHistory || hasFinancialHistory) {
      setStudentToDelete(null);
      onShowToast(
        `Impossible de supprimer ${student.lastName} : des notes, présences ou paiements sont déjà liés à cet élève. Conservez sa fiche pour préserver l'historique.`,
        'error'
      );
      return;
    }

    const updatedDb: DatabaseSchema = {
      ...db,
      students: db.students.filter((s) => s.id !== student.id),
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    setStudentToDelete(null);
    onShowToast(`L'élève ${student.lastName} a été retiré.`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Fast Actions */}
      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleStudentExcelFile}
        className="hidden"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => ExcelImportService.downloadStudentsTemplate(db)}
          className="button button--secondary"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Modèle Excel
        </button>
        <button
          type="button"
          onClick={() => importFileRef.current?.click()}
          className="button button--secondary"
        >
          <Upload className="w-3.5 h-3.5" />
          Importer Excel
        </button>
        <button
          type="button"
          onClick={() => {
            setCardModalStudent(filteredStudents[0] || null);
            setIsCardModalOpen(true);
          }}
          className="button button--secondary"
        >
          <CreditCard className="w-3.5 h-3.5" />
          Cartes scolaires
        </button>
        <button
          type="button"
          onClick={() =>
            ExcelExporterService.exportStudents({
              ...db,
              students: activeYearStudents,
            })
          }
          className="button button--secondary"
        >
          <FileDown className="w-3.5 h-3.5" />
          Exporter Excel
        </button>
        <button type="button" onClick={onOpenNewAdmission} className="button button--primary">
          <UserPlus className="w-3.5 h-3.5" />
          Inscrire un élève
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="page-panel p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Rechercher par nom, prénom ou matricule..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-8 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title="Effacer la recherche"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="ALL">Toutes les classes ({db.classes.length})</option>
            {db.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedGender}
            onChange={(e) => setSelectedGender(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="ALL">Tous les genres</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
        </div>

        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="INSCRIT">INSCRIT</option>
            <option value="REINSCRIT">REINSCRIT</option>
            <option value="EN_ATTENTE">EN ATTENTE</option>
            <option value="TRANSFERE">TRANSFERE</option>
          </select>
        </div>
      </div>

      {/* Students Data Table */}
      <div className="page-panel overflow-hidden">
        <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
          <span>
            Affichage de <strong>{filteredStudents.length}</strong> élève(s) sur un effectif total de{' '}
            <strong>{activeYearStudents.length}</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[0.6875rem] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/40">
                <th className="py-3 px-3">Matricule</th>
                <th className="py-3 px-3">Nom & Prénoms</th>
                <th className="py-3 px-3">Classe</th>
                <th className="py-3 px-3">Genre / Âge</th>
                <th className="py-3 px-3">Contact Urgence</th>
                <th className="py-3 px-3">Statut</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredStudents.map((s) => {
                const birthDate = new Date(s.birthDate);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const birthdayNotReached =
                  today.getMonth() < birthDate.getMonth() ||
                  (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
                if (birthdayNotReached) age -= 1;
                return (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group">
                    <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {s.matricule}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {s.lastName} {s.firstName}
                      </div>
                      <div className="text-[0.625rem] text-slate-400">{s.city}</div>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                      {classMap.get(s.classId) || s.classId}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      {s.gender === 'M' ? 'Masculin' : 'Féminin'} • {age} ans
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      <div>{s.emergencyContact}</div>
                      <div className="text-[0.625rem] font-mono text-slate-400">{s.emergencyPhone}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[0.625rem] font-bold ${
                          s.status === 'INSCRIT'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                            : s.status === 'REINSCRIT'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => {
                            setCardModalStudent(s);
                            setIsCardModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 hover:bg-purple-100 transition"
                          title="Imprimer la Carte d'Élève"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setViewingStudent(s)}
                          className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition"
                          title="Consulter le dossier complet"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingStudent(s)}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition"
                          title="Modifier les informations"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => PdfGeneratorService.generateEnrollmentCertificatePDF(s, db)}
                          className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition"
                          title="Imprimer Certificat de Scolarité"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setStudentToDelete(s)}
                          className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* État vide : aucun élève ne correspond aux filtres */}
      {filteredStudents.length === 0 && (
        <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-center space-y-3">
          <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 m-0">
              Aucun élève trouvé
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {activeYearStudents.length === 0
                ? "Aucun élève n'est encore inscrit pour cette année scolaire. Commencez par une nouvelle inscription."
                : 'Aucun élève ne correspond à votre recherche ou aux filtres appliqués.'}
            </p>
          </div>
          {activeYearStudents.length === 0 ? (
            <button
              onClick={onOpenNewAdmission}
              className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Nouvelle Inscription</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedClassId('ALL');
                setSelectedGender('ALL');
                setSelectedStatus('ALL');
              }}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}

      <ExcelImportModal
        isOpen={!!studentImportPreview}
        onClose={() => {
          setStudentImportPreview(null);
          setStudentImportFileName('');
        }}
        title="Importer des élèves depuis Excel"
        fileName={studentImportFileName}
        validCount={studentImportPreview?.students.length || 0}
        validLabel="élève(s)"
        issues={studentImportPreview?.issues || []}
        warnings={studentImportPreview?.warnings || []}
        onConfirm={confirmStudentImport}
      />

      {/* Confirmation de suppression */}
      <ConfirmDialog
        isOpen={!!studentToDelete}
        title="Supprimer l'élève"
        message={
          studentToDelete
            ? `Voulez-vous vraiment supprimer définitivement ${studentToDelete.lastName} ${studentToDelete.firstName} (${studentToDelete.matricule}) ? Ses notes et ses règlements seront également supprimés. Cette action est irréversible.`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => studentToDelete && handleDeleteStudent(studentToDelete)}
        onCancel={() => setStudentToDelete(null)}
      />

      {/* Modals */}
      <StudentDetailModal
        isOpen={!!viewingStudent}
        onClose={() => setViewingStudent(null)}
        student={viewingStudent}
        db={db}
      />

      <StudentFormModal
        isOpen={!!editingStudent}
        onClose={() => setEditingStudent(null)}
        student={editingStudent}
        db={db}
        onUpdateDb={onUpdateDb}
        onShowToast={onShowToast}
      />

      <StudentCardGeneratorModal
        isOpen={isCardModalOpen}
        onClose={() => setIsCardModalOpen(false)}
        student={cardModalStudent}
        targetClass={currentSelectedClassObj}
        db={db}
        onShowToast={onShowToast}
      />
    </div>
  );
};
