// EduGasy Pro - Student Edit & Creation Modal
import React, { useState, useEffect } from 'react';
import { DatabaseSchema, Student, StudentStatus } from '../../types/school';
import { Modal } from '../common/Modal';
import { StorageService } from '../../services/storage';

interface StudentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null; // null if creating new
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  isOpen,
  onClose,
  student,
  db,
  onUpdateDb,
  onShowToast,
}) => {
  const [formData, setFormData] = useState<Partial<Student>>({
    matricule: '',
    lastName: '',
    firstName: '',
    gender: 'M',
    birthDate: '2008-01-01',
    birthPlace: 'Antananarivo',
    nationality: 'Malgache',
    address: '',
    city: 'Antananarivo',
    classId: db.classes[0]?.id || '',
    status: 'INSCRIT',
    fatherName: '',
    fatherPhone: '',
    motherName: '',
    motherPhone: '',
    emergencyContact: '',
    emergencyPhone: '',
    bloodType: 'O+',
    medicalNotes: 'R.A.S',
  });

  useEffect(() => {
    if (student) {
      setFormData(student);
    } else {
      setFormData({
        matricule: '',
        lastName: '',
        firstName: '',
        gender: 'M',
        birthDate: '2008-01-01',
        birthPlace: 'Antananarivo',
        nationality: 'Malgache',
        address: '',
        city: 'Antananarivo',
        classId: db.classes[0]?.id || '',
        status: 'INSCRIT',
        fatherName: '',
        fatherPhone: '',
        motherName: '',
        motherPhone: '',
        emergencyContact: '',
        emergencyPhone: '',
        bloodType: 'O+',
        medicalNotes: 'R.A.S',
      });
    }
  }, [student, db.classes]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lastName || !formData.firstName) {
      onShowToast('Nom et prénom obligatoires', 'error');
      return;
    }

    if (student) {
      // Update existing
      const updatedStudents = db.students.map((s) =>
        s.id === student.id ? ({ ...s, ...formData } as Student) : s
      );
      const updatedDb: DatabaseSchema = {
        ...db,
        students: updatedStudents,
      };
      StorageService.saveDatabase(updatedDb);
      onUpdateDb(updatedDb);
      onShowToast(`Fiche de ${formData.lastName} mise à jour.`, 'success');
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={student ? `Modifier la fiche de ${student.lastName}` : "Nouvel Élève"}
      maxWidth="2xl"
      actions={
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow"
          >
            Enregistrer les modifications
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold mb-1">Matricule</label>
            <input
              type="text"
              value={formData.matricule || ''}
              onChange={(e) => setFormData({ ...formData, matricule: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Classe</label>
            <select
              value={formData.classId || ''}
              onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              {db.classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
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
            <label className="block font-semibold mb-1">Date de Naissance</label>
            <input
              type="date"
              value={formData.birthDate || ''}
              onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Lieu de Naissance</label>
            <input
              type="text"
              value={formData.birthPlace || ''}
              onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">Statut</label>
            <select
              value={formData.status || 'INSCRIT'}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as StudentStatus })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="INSCRIT">INSCRIT</option>
              <option value="REINSCRIT">REINSCRIT</option>
              <option value="EN_ATTENTE">EN ATTENTE</option>
              <option value="TRANSFERE">TRANSFERE</option>
              <option value="ABANDON">ABANDON</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Contact d'Urgence</label>
            <input
              type="text"
              value={formData.emergencyContact || ''}
              onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};
