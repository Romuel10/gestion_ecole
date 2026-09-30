import { DateInput } from '../common/DateInput';
import { reportInvalidDates } from '../../services/dateInputValidation';
import React, { useState, useEffect } from 'react';
import { DatabaseSchema, Guardian, Student, StudentGuardianLink, StudentStatus } from '../../types/school';
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
    neighborhood: '',
    city: 'Antananarivo',
    classId: db.classes[0]?.id || '',
    status: 'INSCRIT',
    birthCertificateNumber: '',
    birthCertificateDate: '',
    birthCertificatePlace: '',
    fatherName: '',
    fatherPhone: '',
    fatherJob: '',
    fatherCinNumber: '',
    fatherCinIssuedAt: '',
    fatherCinIssuePlace: '',
    fatherEmail: '',
    motherName: '',
    motherPhone: '',
    motherJob: '',
    motherCinNumber: '',
    motherCinIssuedAt: '',
    motherCinIssuePlace: '',
    motherEmail: '',
    guardianName: '',
    guardianPhone: '',
    guardianJob: '',
    guardianCinNumber: '',
    guardianCinIssuedAt: '',
    guardianCinIssuePlace: '',
    guardianEmail: '',
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
        neighborhood: '',
        city: 'Antananarivo',
        classId: db.classes[0]?.id || '',
        status: 'INSCRIT',
        birthCertificateNumber: '',
        birthCertificateDate: '',
        birthCertificatePlace: '',
        fatherName: '',
        fatherPhone: '',
        fatherJob: '',
        fatherCinNumber: '',
        fatherCinIssuedAt: '',
        fatherCinIssuePlace: '',
        fatherEmail: '',
        motherName: '',
        motherPhone: '',
        motherJob: '',
        motherCinNumber: '',
        motherCinIssuedAt: '',
        motherCinIssuePlace: '',
        motherEmail: '',
        guardianName: '',
        guardianPhone: '',
        guardianJob: '',
        guardianCinNumber: '',
        guardianCinIssuedAt: '',
        guardianCinIssuePlace: '',
        guardianEmail: '',
        emergencyContact: '',
        emergencyPhone: '',
        bloodType: 'O+',
        medicalNotes: 'R.A.S',
      });
    }
  }, [student, db.classes]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reportInvalidDates()) return;
    if (!formData.lastName || !formData.firstName) {
      onShowToast('Nom et prénom obligatoires', 'error');
      return;
    }

    if (student) {
      const normalizedMatricule = (formData.matricule || '').trim().toUpperCase();
      if (!normalizedMatricule) {
        onShowToast('Le matricule est obligatoire.', 'error');
        return;
      }

      const duplicateMatricule = db.students.some(
        (candidate) =>
          candidate.id !== student.id &&
          candidate.schoolYearId === student.schoolYearId &&
          candidate.matricule.trim().toUpperCase() === normalizedMatricule
      );
      if (duplicateMatricule) {
        onShowToast(`Le matricule ${normalizedMatricule} est déjà utilisé pour cette année scolaire.`, 'error');
        return;
      }

      const targetClass = db.classes.find((cls) => cls.id === formData.classId);
      if (targetClass && targetClass.id !== student.classId) {
        const currentCount = db.students.filter(
          (candidate) =>
            candidate.schoolYearId === student.schoolYearId &&
            candidate.classId === targetClass.id &&
            candidate.id !== student.id
        ).length;
        if (currentCount >= targetClass.capacity) {
          onShowToast(`La classe ${targetClass.name} a atteint sa capacité maximale (${targetClass.capacity}).`, 'error');
          return;
        }
      }

      // Update existing
      const updatedStudents = db.students.map((s) =>
        s.id === student.id
          ? ({ ...s, ...formData, matricule: normalizedMatricule } as Student)
          : s
      );
      const existingLinks = (db.studentGuardianLinks ?? []).filter(
        (link) => link.studentId === student.id
      );
      const updatedGuardians: Guardian[] = [...(db.guardians ?? [])];
      const updatedLinks: StudentGuardianLink[] = [
        ...(db.studentGuardianLinks ?? []),
      ];

      const compact = (value?: string) =>
        (value || '').replace(/\s+/g, '').toUpperCase();
      const splitName = (value?: string) => {
        const parts = (value || '').trim().split(/\s+/).filter(Boolean);
        return {
          lastName: (parts.shift() || '').toUpperCase(),
          firstName: parts.join(' '),
        };
      };

      const ensureGuardian = (
        relationship: StudentGuardianLink['relationship'],
        values: {
          name?: string;
          phone?: string;
          email?: string;
          cinNumber?: string;
          cinIssuedAt?: string;
          cinIssuePlace?: string;
          occupation?: string;
        }
      ) => {
        if (
          !values.name?.trim() &&
          !values.phone?.trim() &&
          !values.cinNumber?.trim() &&
          !values.email?.trim()
        ) {
          return;
        }

        const existingLink = existingLinks.find(
          (link) => link.relationship === relationship
        );
        let guardian = existingLink
          ? updatedGuardians.find((item) => item.id === existingLink.guardianId)
          : undefined;

        if (!guardian) {
          const cinKey = compact(values.cinNumber);
          const phoneKey = compact(values.phone);
          const emailKey = (values.email || '').trim().toLowerCase();
          guardian = updatedGuardians.find((item) => {
            if (cinKey && compact(item.cinNumber) === cinKey) return true;
            if (phoneKey && compact(item.phonePrimary) === phoneKey) return true;
            if (
              emailKey &&
              (item.email || '').trim().toLowerCase() === emailKey
            ) {
              return true;
            }
            return false;
          });
        }

        const parsedName = splitName(values.name);
        if (!guardian) {
          guardian = {
            id: `gua-${Date.now()}-${relationship.toLowerCase()}`,
            lastName: parsedName.lastName || 'RESPONSABLE',
            firstName: parsedName.firstName,
            phonePrimary: values.phone?.trim() || '',
            email: values.email?.trim().toLowerCase() || undefined,
            cinNumber: values.cinNumber?.trim() || undefined,
            cinIssuedAt: values.cinIssuedAt || undefined,
            cinIssuePlace: values.cinIssuePlace?.trim() || undefined,
            occupation: values.occupation?.trim() || undefined,
            address: formData.address || undefined,
            city: formData.city || undefined,
            nationality: 'Malgache',
            status: 'ACTIVE',
          };
          updatedGuardians.push(guardian);
        } else {
          guardian.lastName =
            parsedName.lastName || guardian.lastName;
          guardian.firstName =
            parsedName.firstName || guardian.firstName;
          guardian.phonePrimary =
            values.phone?.trim() || guardian.phonePrimary;
          guardian.email =
            values.email?.trim().toLowerCase() || guardian.email;
          guardian.cinNumber =
            values.cinNumber?.trim() || guardian.cinNumber;
          guardian.cinIssuedAt =
            values.cinIssuedAt || guardian.cinIssuedAt;
          guardian.cinIssuePlace =
            values.cinIssuePlace?.trim() || guardian.cinIssuePlace;
          guardian.occupation =
            values.occupation?.trim() || guardian.occupation;
        }

        if (!existingLink) {
          const hasPrimary = updatedLinks.some(
            (link) => link.studentId === student.id && link.isPrimary
          );
          updatedLinks.push({
            id: `sg-${student.id}-${guardian.id}`,
            studentId: student.id,
            guardianId: guardian.id,
            relationship,
            isPrimary: !hasPrimary,
            hasLegalCustody: true,
            authorizedPickup: true,
            emergencyPriority: !hasPrimary ? 1 : undefined,
          });
        }
      };

      ensureGuardian('FATHER', {
        name: formData.fatherName,
        phone: formData.fatherPhone,
        email: formData.fatherEmail,
        cinNumber: formData.fatherCinNumber,
        cinIssuedAt: formData.fatherCinIssuedAt,
        cinIssuePlace: formData.fatherCinIssuePlace,
        occupation: formData.fatherJob,
      });
      ensureGuardian('MOTHER', {
        name: formData.motherName,
        phone: formData.motherPhone,
        email: formData.motherEmail,
        cinNumber: formData.motherCinNumber,
        cinIssuedAt: formData.motherCinIssuedAt,
        cinIssuePlace: formData.motherCinIssuePlace,
        occupation: formData.motherJob,
      });
      ensureGuardian('GUARDIAN', {
        name: formData.guardianName,
        phone: formData.guardianPhone,
        email: formData.guardianEmail,
        cinNumber: formData.guardianCinNumber,
        cinIssuedAt: formData.guardianCinIssuedAt,
        cinIssuePlace: formData.guardianCinIssuePlace,
        occupation: formData.guardianJob,
      });

      const updatedDb: DatabaseSchema = {
        ...db,
        students: updatedStudents,
        guardians: updatedGuardians,
        studentGuardianLinks: updatedLinks,
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
            <DateInput
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
          <div>
            <label className="block font-semibold mb-1">Téléphone d'urgence</label>
            <input
              type="text"
              value={formData.emergencyPhone || ''}
              onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Fokontany / quartier</label>
            <input
              type="text"
              value={formData.neighborhood || ''}
              onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">N° acte de naissance</label>
            <input
              type="text"
              value={formData.birthCertificateNumber || ''}
              onChange={(e) => setFormData({ ...formData, birthCertificateNumber: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Date acte de naissance</label>
            <DateInput
              type="date"
              value={formData.birthCertificateDate || ''}
              onChange={(e) => setFormData({ ...formData, birthCertificateDate: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Lieu acte de naissance</label>
            <input
              type="text"
              value={formData.birthCertificatePlace || ''}
              onChange={(e) => setFormData({ ...formData, birthCertificatePlace: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="font-bold mb-3">Responsables légaux & CIN</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="font-semibold">Père</div>
              <input type="text" placeholder="Nom complet" value={formData.fatherName || ''} onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="text" placeholder="Téléphone" value={formData.fatherPhone || ''} onChange={(e) => setFormData({ ...formData, fatherPhone: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="text" placeholder="N° CIN" value={formData.fatherCinNumber || ''} onChange={(e) => setFormData({ ...formData, fatherCinNumber: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <DateInput type="date" value={formData.fatherCinIssuedAt || ''} onChange={(e) => setFormData({ ...formData, fatherCinIssuedAt: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="text" placeholder="Lieu CIN" value={formData.fatherCinIssuePlace || ''} onChange={(e) => setFormData({ ...formData, fatherCinIssuePlace: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="email" placeholder="Email" value={formData.fatherEmail || ''} onChange={(e) => setFormData({ ...formData, fatherEmail: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="text" placeholder="Profession" value={formData.fatherJob || ''} onChange={(e) => setFormData({ ...formData, fatherJob: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            </div>
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="font-semibold">Mère</div>
              <input type="text" placeholder="Nom complet" value={formData.motherName || ''} onChange={(e) => setFormData({ ...formData, motherName: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="text" placeholder="Téléphone" value={formData.motherPhone || ''} onChange={(e) => setFormData({ ...formData, motherPhone: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="text" placeholder="N° CIN" value={formData.motherCinNumber || ''} onChange={(e) => setFormData({ ...formData, motherCinNumber: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <DateInput type="date" value={formData.motherCinIssuedAt || ''} onChange={(e) => setFormData({ ...formData, motherCinIssuedAt: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="text" placeholder="Lieu CIN" value={formData.motherCinIssuePlace || ''} onChange={(e) => setFormData({ ...formData, motherCinIssuePlace: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="email" placeholder="Email" value={formData.motherEmail || ''} onChange={(e) => setFormData({ ...formData, motherEmail: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              <input type="text" placeholder="Profession" value={formData.motherJob || ''} onChange={(e) => setFormData({ ...formData, motherJob: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            </div>

            <div className="sm:col-span-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
              <div className="font-semibold">Tuteur / responsable légal (si différent)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input type="text" placeholder="Nom complet" value={formData.guardianName || ''} onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                <input type="text" placeholder="Téléphone" value={formData.guardianPhone || ''} onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                <input type="text" placeholder="N° CIN" value={formData.guardianCinNumber || ''} onChange={(e) => setFormData({ ...formData, guardianCinNumber: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                <DateInput type="date" value={formData.guardianCinIssuedAt || ''} onChange={(e) => setFormData({ ...formData, guardianCinIssuedAt: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                <input type="text" placeholder="Lieu CIN" value={formData.guardianCinIssuePlace || ''} onChange={(e) => setFormData({ ...formData, guardianCinIssuePlace: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                <input type="email" placeholder="Email" value={formData.guardianEmail || ''} onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                <input type="text" placeholder="Profession" value={formData.guardianJob || ''} onChange={(e) => setFormData({ ...formData, guardianJob: e.target.value })} className="sm:col-span-2 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
              </div>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
};
