import React, { useEffect, useState } from 'react';
import {
  UserPlus,
  Edit2,
  Trash2,
  Award,
  Clock,
  Search,
} from 'lucide-react';
import { DatabaseSchema, Teacher, TeacherContract } from '../../types/school';
import { CalculationService } from '../../services/calculations';
import { StorageService } from '../../services/storage';
import { Modal } from '../common/Modal';

interface TeachersManagerViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialTeacherId?: string;
}

export const TeachersManagerView: React.FC<TeachersManagerViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
  initialTeacherId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [contractFilter, setContractFilter] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  const [formData, setFormData] = useState<Partial<Teacher>>({
    matricule: '',
    lastName: '',
    firstName: '',
    gender: 'M',
    phone: '',
    email: '',
    address: 'Antananarivo',
    contractType: 'TITULAIRE',
    qualification: 'CAPEN',
    specialtySubjectIds: [],
    assignedClassIds: [],
    baseMonthlySalary: 1200000,
    hourlyRate: 15000,
    weeklyAssignedHours: 18,
    hireDate: new Date().toISOString().slice(0, 10),
    cinNumber: '',
  });

  const subjectMap = new Map(db.subjects.map((s) => [s.id, s.name]));

  useEffect(() => {
    if (!initialTeacherId) return;
    const teacher = db.teachers.find((item) => item.id === initialTeacherId);
    if (!teacher) return;
    setEditingTeacher(teacher);
    setFormData(teacher);
    setIsModalOpen(true);
  }, [initialTeacherId, db.teachers]);

  const filteredTeachers = db.teachers.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    const matchQuery =
      !q ||
      t.lastName.toLowerCase().includes(q) ||
      t.firstName.toLowerCase().includes(q) ||
      t.matricule.toLowerCase().includes(q);

    const matchContract = contractFilter === 'ALL' || t.contractType === contractFilter;
    return matchQuery && matchContract;
  });

  const handleOpenAdd = () => {
    setEditingTeacher(null);
    const usedTeacherNumbers = db.teachers
      .map((teacher) => Number(teacher.matricule.match(/(\d+)$/)?.[1] || 0))
      .filter((value) => Number.isFinite(value));
    const nextTeacherNumber = (usedTeacherNumbers.length > 0 ? Math.max(...usedTeacherNumbers) : 0) + 1;
    setFormData({
      matricule: `ENS-${String(nextTeacherNumber).padStart(3, '0')}`,
      lastName: '',
      firstName: '',
      gender: 'M',
      phone: '+261 34 ',
      email: '',
      address: 'Antananarivo',
      contractType: 'TITULAIRE',
      qualification: 'CAPEN',
      specialtySubjectIds: [db.subjects[0]?.id || ''],
      assignedClassIds: [db.classes[0]?.id || ''],
      baseMonthlySalary: 1200000,
      hourlyRate: 15000,
      weeklyAssignedHours: 18,
      hireDate: new Date().toISOString().slice(0, 10),
      cinNumber: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData(teacher);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lastName || !formData.firstName) {
      onShowToast('Nom et prénom obligatoires', 'error');
      return;
    }

    const normalizedMatricule = (formData.matricule || '').trim().toUpperCase();
    if (!normalizedMatricule) {
      onShowToast('Le matricule enseignant est obligatoire.', 'error');
      return;
    }
    const matriculeAlreadyUsed = db.teachers.some(
      (teacher) =>
        teacher.id !== editingTeacher?.id &&
        teacher.matricule.trim().toUpperCase() === normalizedMatricule
    );
    if (matriculeAlreadyUsed) {
      onShowToast(`Le matricule ${normalizedMatricule} est déjà utilisé.`, 'error');
      return;
    }

    let updatedTeachers = [...db.teachers];

    if (editingTeacher) {
      updatedTeachers = updatedTeachers.map((t) =>
        t.id === editingTeacher.id
          ? ({ ...t, ...formData, matricule: normalizedMatricule } as Teacher)
          : t
      );
      onShowToast(`Enseignant ${formData.lastName} modifié avec succès.`, 'success');
    } else {
      const newTeacher: Teacher = {
        id: `tea-${Date.now()}`,
        matricule: normalizedMatricule,
        lastName: (formData.lastName || '').toUpperCase(),
        firstName: formData.firstName || '',
        gender: formData.gender || 'M',
        phone: formData.phone || '',
        email: formData.email || '',
        address: formData.address || 'Antananarivo',
        contractType: formData.contractType || 'TITULAIRE',
        qualification: formData.qualification || 'CAPEN',
        specialtySubjectIds: formData.specialtySubjectIds || [],
        assignedClassIds: formData.assignedClassIds || [],
        baseMonthlySalary: Number(formData.baseMonthlySalary || 0),
        hourlyRate: Number(formData.hourlyRate || 0),
        weeklyAssignedHours: Number(formData.weeklyAssignedHours || 0),
        hireDate: formData.hireDate || new Date().toISOString().slice(0, 10),
        cinNumber: formData.cinNumber || '',
      };
      updatedTeachers.push(newTeacher);
      onShowToast(`Enseignant ${newTeacher.lastName} ajouté au corps professoral.`, 'success');
    }

    const updatedDb: DatabaseSchema = {
      ...db,
      teachers: updatedTeachers,
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    setIsModalOpen(false);
  };

  const handleDeleteTeacher = (id: string, name: string) => {
    const isAssignedToClass = db.classes.some(
      (cls) => cls.mainTeacherId === id || cls.subjects.some((subject) => subject.teacherId === id)
    );
    const hasTimetable = db.timetableSlots.some((slot) => slot.teacherId === id);
    const hasSalaryHistory = db.salaryPayments.some((payment) => payment.teacherId === id);

    if (isAssignedToClass || hasTimetable || hasSalaryHistory) {
      onShowToast(
        `Impossible de supprimer ${name} : cet enseignant est encore lié à une classe, un emploi du temps ou un historique de salaire.`,
        'error'
      );
      return;
    }

    if (window.confirm(`Supprimer l'enseignant ${name} ?`)) {
      const updated = db.teachers.filter((t) => t.id !== id);
      const updatedDb: DatabaseSchema = { ...db, teachers: updated };
      StorageService.saveDatabase(updatedDb);
      onUpdateDb(updatedDb);
      onShowToast('Enseignant supprimé.', 'info');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white m-0">
            Corps Professoral & Affectations Pédagogiques
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Gestion des enseignants titulaires, vacataires, matières dispensées et rémunérations
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 active:scale-95 transition"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Ajouter Enseignant</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher enseignant par nom, prénom ou matricule..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <select
            value={contractFilter}
            onChange={(e) => setContractFilter(e.target.value)}
            className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="ALL">Tous les statuts de contrat</option>
            <option value="TITULAIRE">Titulaires (Salaire mensuel fixe)</option>
            <option value="VACATAIRE">Vacataires (Taux horaire)</option>
            <option value="FRAM">Maîtres FRAM</option>
          </select>
        </div>
      </div>

      {/* Teacher Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTeachers.map((teacher) => (
          <div
            key={teacher.id}
            className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4 hover:border-blue-400 transition"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-base">
                  {teacher.firstName.charAt(0)}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white m-0">
                    {teacher.lastName} {teacher.firstName}
                  </h4>
                  <div className="text-[10px] font-mono text-slate-400">{teacher.matricule}</div>
                </div>
              </div>

              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  teacher.contractType === 'TITULAIRE'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                }`}
              >
                {teacher.contractType}
              </span>
            </div>

            {/* Qualifications & Subject tags */}
            <div className="space-y-2 text-xs">
              <div className="text-slate-600 dark:text-slate-400 flex items-center space-x-1.5">
                <Award className="w-3.5 h-3.5 text-blue-500" />
                <span className="truncate">{teacher.qualification}</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {teacher.specialtySubjectIds.map((sid) => (
                  <span
                    key={sid}
                    className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-semibold"
                  >
                    {subjectMap.get(sid) || sid}
                  </span>
                ))}
              </div>
            </div>

            {/* Salary info & weekly hours */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-[11px] flex items-center justify-between">
              <div className="flex items-center space-x-1 text-slate-500">
                <Clock className="w-3 h-3" />
                <span>{teacher.weeklyAssignedHours}h / sem</span>
              </div>
              <div className="font-extrabold text-slate-900 dark:text-white">
                {teacher.contractType === 'TITULAIRE'
                  ? CalculationService.formatAriary(teacher.baseMonthlySalary)
                  : `${CalculationService.formatAriary(teacher.hourlyRate)}/h`}
              </div>
            </div>

            {/* Footer with Contact & Actions */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-[140px]">
                {teacher.phone}
              </span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handleOpenEdit(teacher)}
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Modifier"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteTeacher(teacher.id, teacher.lastName)}
                  className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Teacher Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTeacher ? `Modifier Enseignant ${editingTeacher.lastName}` : 'Nouvel Enseignant'}
        subtitle="Affectation des disciplines et paramètres contractuels"
        maxWidth="2xl"
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Matricule Enseignant *</label>
              <input
                type="text"
                required
                value={formData.matricule || ''}
                onChange={(e) => setFormData({ ...formData, matricule: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Type de Contrat *</label>
              <select
                value={formData.contractType || 'TITULAIRE'}
                onChange={(e) =>
                  setFormData({ ...formData, contractType: e.target.value as TeacherContract })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="TITULAIRE">Titulaire (Mensuel)</option>
                <option value="VACATAIRE">Vacataire (Horaire)</option>
                <option value="FRAM">Maître FRAM</option>
                <option value="STAGIAIRE">Stagiaire</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Nom *</label>
              <input
                type="text"
                required
                value={formData.lastName || ''}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Prénom *</label>
              <input
                type="text"
                required
                value={formData.firstName || ''}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Diplôme / Qualification *</label>
              <input
                type="text"
                value={formData.qualification || ''}
                onChange={(e) => setFormData({ ...formData, qualification: e.target.value })}
                placeholder="Ex: CAPEN Mathématiques (ENS)"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Téléphone de contact *</label>
              <input
                type="text"
                required
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Salaire de Base Mensuel (Ariary)</label>
              <input
                type="number"
                min="0"
                step="10000"
                value={formData.baseMonthlySalary || 0}
                onChange={(e) => setFormData({ ...formData, baseMonthlySalary: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Taux Horaire Vacation (Ariary/h)</label>
              <input
                type="number"
                min="0"
                step="1000"
                value={formData.hourlyRate || 0}
                onChange={(e) => setFormData({ ...formData, hourlyRate: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition"
          >
            Enregistrer l'Enseignant
          </button>
        </form>
      </Modal>
    </div>
  );
};
