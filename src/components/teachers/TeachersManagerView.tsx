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

    const normalizedEmail = (formData.email || '').trim().toLowerCase();
    if (
      normalizedEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ) {
      onShowToast('Adresse e-mail enseignant invalide.', 'error');
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
          ? ({ ...t, ...formData, matricule: normalizedMatricule, email: normalizedEmail } as Teacher)
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
        email: normalizedEmail,
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
      <div className="flex justify-end">
        <button type="button" onClick={handleOpenAdd} className="button button--primary">
          <UserPlus className="w-3.5 h-3.5" />
          Ajouter un enseignant
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="page-panel p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      <div className="page-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Enseignant</th>
                <th>Contrat</th>
                <th>Spécialité</th>
                <th>Charge hebdo.</th>
                <th>Rémunération</th>
                <th>Contact</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeachers.map((teacher) => (
                <tr key={teacher.id}>
                  <td className="font-mono text-slate-500">{teacher.matricule}</td>
                  <td>
                    <div className="font-semibold">{teacher.lastName} {teacher.firstName}</div>
                    <div className="text-[10px] text-slate-500">{teacher.qualification}</div>
                  </td>
                  <td>{teacher.contractType}</td>
                  <td>{teacher.specialtySubjectIds.map((id) => subjectMap.get(id)).filter(Boolean).join(', ') || '—'}</td>
                  <td>{teacher.weeklyAssignedHours} h</td>
                  <td className="font-mono">
                    {teacher.contractType === 'TITULAIRE'
                      ? CalculationService.formatAriary(teacher.baseMonthlySalary)
                      : `${CalculationService.formatAriary(teacher.hourlyRate)}/h`}
                  </td>
                  <td className="text-slate-500">
                    <div className="font-mono">{teacher.phone || '—'}</div>
                    {teacher.email && (
                      <div className="mt-0.5 text-[9px]">{teacher.email}</div>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" onClick={() => handleOpenEdit(teacher)} className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white" title="Modifier">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDeleteTeacher(teacher.id, teacher.lastName)} className="p-1.5 text-slate-400 hover:text-rose-600" title="Supprimer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              <label className="block font-semibold mb-1">E-mail enseignant</label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="enseignant@ecole.mg"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Nécessaire uniquement si cet enseignant doit se connecter à Sekoly Enseignant.
              </p>
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
