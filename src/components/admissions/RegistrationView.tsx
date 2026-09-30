import React, { useState } from 'react';
import {
  UserPlus,
  RefreshCw,
  FileCheck,
  CheckCircle2,
  Printer,
  Search,
  User,
  CreditCard,
  Building,
  Calendar,
  Sparkles,
  QrCode,
} from 'lucide-react';
import {
  DatabaseSchema,
  Guardian,
  Student,
  StudentGuardianLink,
  TuitionPayment,
  PaymentMethod,
  StudentStatus,
} from '../../types/school';
import { MatriculeService } from '../../services/matricule';
import { CalculationService } from '../../services/calculations';
import { StorageService } from '../../services/storage';
import { PdfGeneratorService } from '../../services/pdfGenerator';
import {
  CloudSyncService,
  EnrollmentQueueItem,
  cloudEntityUuid,
} from '../../services/cloudSync';
import { OnlineEnrollmentPanel } from './OnlineEnrollmentPanel';

const splitGuardianName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { lastName: '', firstName: '' };
  if (parts.length === 1) return { lastName: parts[0].toUpperCase(), firstName: '' };
  return {
    lastName: parts[0].toUpperCase(),
    firstName: parts.slice(1).join(' '),
  };
};

const normalizedIdentity = (value?: string) =>
  (value || '').replace(/\s+/g, '').toUpperCase();

interface RegistrationViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onConfigureSchool: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const RegistrationView: React.FC<RegistrationViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
  onConfigureSchool,
}) => {
  const [activeTab, setActiveTab] = useState<
    'NEW_ADMISSION' | 'RE_REGISTRATION' | 'ONLINE' | 'LOG'
  >('NEW_ADMISSION');
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null);

  // Form State for New Admission
  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    gender: 'M' as 'M' | 'F',
    birthDate: '',
    birthPlace: 'Antananarivo',
    nationality: 'Malgache',
    address: '',
    neighborhood: '',
    city: 'Antananarivo',
    classId: db.classes[0]?.id || '',
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
    previousSchool: '',
    
    // Financial payment details
    payFeeNow: true,
    paymentMethod: 'ESPECES' as PaymentMethod,
    referenceNumber: '',
    payerName: '',
    discount: 0,
  });

  // Re-registration search state
  const [reRegSearch, setReRegSearch] = useState('');
  const [selectedStudentForReReg, setSelectedStudentForReReg] = useState<Student | null>(null);
  const [targetClassId, setTargetClassId] = useState(db.classes[0]?.id || '');
  const [reRegPayMethod, setReRegPayMethod] = useState<PaymentMethod>('ESPECES');
  const [reRegReference, setReRegReference] = useState('');

  const activeSchoolYear = db.schoolYears.find((year) => year.id === db.currentSchoolYearId);
  const activeSchoolYearStart = activeSchoolYear?.startDate.slice(0, 4) || String(new Date().getFullYear());
  const generatedMatriculePreview = MatriculeService.previewPattern(db.matriculeConfig, activeSchoolYearStart);
  const selectedClass = db.classes.find((c) => c.id === formData.classId) || db.classes[0];

  const getNextReceiptNumber = () => {
    const usedNumbers = db.tuitionPayments
      .map((payment) => payment.receiptNumber)
      .filter((number) => number.startsWith(`REC-${activeSchoolYearStart}-`))
      .map((number) => Number(number.split('-').pop()))
      .filter((number) => Number.isFinite(number));
    const nextSequence = (usedNumbers.length > 0 ? Math.max(...usedNumbers) : 0) + 1;
    return `REC-${activeSchoolYearStart}-${String(nextSequence).padStart(4, '0')}`;
  };

  const handleNewAdmissionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.lastName.trim() || !formData.firstName.trim()) {
      onShowToast('Veuillez renseigner le nom et le prénom de l\'élève.', 'error');
      return;
    }
    if (!selectedClass) {
      onShowToast('Veuillez créer ou sélectionner une classe avant l’inscription.', 'error');
      return;
    }

    const classEnrollmentCount = db.students.filter(
      (student) =>
        student.schoolYearId === db.currentSchoolYearId &&
        student.classId === selectedClass.id
    ).length;
    if (classEnrollmentCount >= selectedClass.capacity) {
      onShowToast(
        `La classe ${selectedClass.name} a atteint sa capacité maximale (${selectedClass.capacity} élèves).`,
        'error'
      );
      return;
    }

    // 1. Generate unique matricule & update counter
    const { matricule, updatedCounter } = MatriculeService.generateNextMatricule(
      db.matriculeConfig,
      db.students,
      { level: selectedClass.level, year: activeSchoolYearStart }
    );

    const newStudentId = `stu-${Date.now()}`;
    const newStudent: Student = {
      id: newStudentId,
      matricule,
      lastName: formData.lastName.trim().toUpperCase(),
      firstName: formData.firstName.trim(),
      gender: formData.gender,
      birthDate: formData.birthDate,
      birthPlace: formData.birthPlace,
      nationality: formData.nationality,
      address: formData.address,
      neighborhood: formData.neighborhood,
      city: formData.city,
      classId: formData.classId,
      schoolYearId: db.currentSchoolYearId,
      status: 'INSCRIT',
      enrollmentDate: new Date().toISOString().slice(0, 10),
      birthCertificateNumber: formData.birthCertificateNumber,
      birthCertificateDate: formData.birthCertificateDate,
      birthCertificatePlace: formData.birthCertificatePlace,
      fatherName: formData.fatherName,
      fatherPhone: formData.fatherPhone,
      fatherJob: formData.fatherJob,
      fatherCinNumber: formData.fatherCinNumber,
      fatherCinIssuedAt: formData.fatherCinIssuedAt,
      fatherCinIssuePlace: formData.fatherCinIssuePlace,
      fatherEmail: formData.fatherEmail,
      motherName: formData.motherName,
      motherPhone: formData.motherPhone,
      motherJob: formData.motherJob,
      motherCinNumber: formData.motherCinNumber,
      motherCinIssuedAt: formData.motherCinIssuedAt,
      motherCinIssuePlace: formData.motherCinIssuePlace,
      motherEmail: formData.motherEmail,
      guardianName: formData.guardianName,
      guardianPhone: formData.guardianPhone,
      guardianJob: formData.guardianJob,
      guardianCinNumber: formData.guardianCinNumber,
      guardianCinIssuedAt: formData.guardianCinIssuedAt,
      guardianCinIssuePlace: formData.guardianCinIssuePlace,
      guardianEmail: formData.guardianEmail,
      emergencyContact: formData.emergencyContact || `${formData.fatherName || formData.motherName} (Parent)`,
      emergencyPhone: formData.emergencyPhone || formData.fatherPhone || formData.motherPhone || '',
      bloodType: formData.bloodType,
      medicalNotes: formData.medicalNotes,
      previousSchool: formData.previousSchool,
    };

    let updatedPayments = [...db.tuitionPayments];
    let updatedTransactions = [...db.cashTransactions];
    let newPaymentObj: TuitionPayment | null = null;

    if (formData.payFeeNow && (selectedClass.registrationFee ?? 0) > 0) {
      const regFee = selectedClass?.registrationFee ?? 0;
      const discount = Math.max(0, Number(formData.discount || 0));
      if (discount > regFee) {
        onShowToast('La remise ne peut pas dépasser le droit d’inscription.', 'error');
        return;
      }
      const actualAmount = regFee - discount;
      if (actualAmount <= 0) {
        onShowToast('Le montant encaissé doit être supérieur à 0.', 'error');
        return;
      }
      const receiptNum = getNextReceiptNumber();

      newPaymentObj = {
        id: `pay-${Date.now()}`,
        receiptNumber: receiptNum,
        studentId: newStudentId,
        classId: formData.classId,
        schoolYearId: db.currentSchoolYearId,
        feeType: 'INSCRIPTION',
        monthTarget: `Droit Annuel Inscription`,
        amount: actualAmount,
        discount,
        totalDue: regFee,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: formData.paymentMethod,
        referenceNumber: formData.referenceNumber,
        payerName: formData.payerName || `${formData.fatherName || formData.motherName || 'Parent'}`,
        cashierName: 'Service Caisse & Admission',
        notes: `Inscription en classe de ${selectedClass.name}`,
      };

      updatedPayments.push(newPaymentObj);

      // Add to cash flow journal
      updatedTransactions.push({
        id: `csh-${Date.now()}`,
        voucherNumber: `TR-${receiptNum}`,
        type: 'RECETTE',
        category: 'Inscriptions & Droits',
        amount: actualAmount,
        date: new Date().toISOString().slice(0, 10),
        paymentMethod: formData.paymentMethod,
        beneficiaryOrPayer: newPaymentObj.payerName,
        description: `Droit d'inscription pour l'élève ${newStudent.lastName} ${newStudent.firstName} (${selectedClass.name})`,
        relatedReceiptId: newPaymentObj.id,
        schoolYearId: db.currentSchoolYearId,
      });
    }

    const nextGuardians: Guardian[] = [...(db.guardians ?? [])];
    const nextGuardianLinks: StudentGuardianLink[] = [
      ...(db.studentGuardianLinks ?? []),
    ];
    let guardianSequence = 0;
    let primaryAssigned = false;

    const registerGuardian = (
      relationship: StudentGuardianLink['relationship'],
      values: {
        name: string;
        phone: string;
        email?: string;
        cinNumber?: string;
        cinIssuedAt?: string;
        cinIssuePlace?: string;
        occupation?: string;
      }
    ) => {
      if (!values.name.trim() && !values.phone.trim() && !values.cinNumber?.trim()) {
        return;
      }

      const cinKey = normalizedIdentity(values.cinNumber);
      const phoneKey = normalizedIdentity(values.phone);
      const emailKey = (values.email || '').trim().toLowerCase();
      let guardian = nextGuardians.find((item) => {
        if (cinKey && normalizedIdentity(item.cinNumber) === cinKey) return true;
        if (phoneKey && normalizedIdentity(item.phonePrimary) === phoneKey) return true;
        if (emailKey && (item.email || '').trim().toLowerCase() === emailKey) return true;
        return false;
      });

      const name = splitGuardianName(values.name);
      if (!guardian) {
        guardian = {
          id: `gua-${Date.now()}-${guardianSequence++}`,
          lastName: name.lastName || values.name.trim().toUpperCase(),
          firstName: name.firstName,
          phonePrimary: values.phone.trim(),
          email: emailKey || undefined,
          cinNumber: values.cinNumber?.trim() || undefined,
          cinIssuedAt: values.cinIssuedAt || undefined,
          cinIssuePlace: values.cinIssuePlace?.trim() || undefined,
          occupation: values.occupation?.trim() || undefined,
          address: formData.address || undefined,
          city: formData.city || undefined,
          nationality: 'Malgache',
          status: 'ACTIVE',
        };
        nextGuardians.push(guardian);
      } else {
        Object.assign(guardian, {
          phonePrimary: values.phone.trim() || guardian.phonePrimary,
          email: emailKey || guardian.email,
          cinNumber: values.cinNumber?.trim() || guardian.cinNumber,
          cinIssuedAt: values.cinIssuedAt || guardian.cinIssuedAt,
          cinIssuePlace: values.cinIssuePlace?.trim() || guardian.cinIssuePlace,
          occupation: values.occupation?.trim() || guardian.occupation,
        });
      }

      const isPrimary = !primaryAssigned;
      if (isPrimary) primaryAssigned = true;
      nextGuardianLinks.push({
        id: `sg-${newStudentId}-${guardian.id}`,
        studentId: newStudentId,
        guardianId: guardian.id,
        relationship,
        isPrimary,
        hasLegalCustody: true,
        authorizedPickup: true,
        emergencyPriority: isPrimary ? 1 : undefined,
      });
    };

    registerGuardian('FATHER', {
      name: formData.fatherName,
      phone: formData.fatherPhone,
      email: formData.fatherEmail,
      cinNumber: formData.fatherCinNumber,
      cinIssuedAt: formData.fatherCinIssuedAt,
      cinIssuePlace: formData.fatherCinIssuePlace,
      occupation: formData.fatherJob,
    });
    registerGuardian('MOTHER', {
      name: formData.motherName,
      phone: formData.motherPhone,
      email: formData.motherEmail,
      cinNumber: formData.motherCinNumber,
      cinIssuedAt: formData.motherCinIssuedAt,
      cinIssuePlace: formData.motherCinIssuePlace,
      occupation: formData.motherJob,
    });
    registerGuardian('GUARDIAN', {
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
      matriculeConfig: {
        ...db.matriculeConfig,
        currentCounter: updatedCounter,
      },
      students: [newStudent, ...db.students],
      guardians: nextGuardians,
      studentGuardianLinks: nextGuardianLinks,
      tuitionPayments: updatedPayments,
      cashTransactions: updatedTransactions,
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);

    onShowToast(`Élève ${newStudent.lastName} inscrit(e) avec succès ! Matricule : ${matricule}`, 'success');

    // Auto generate documents
    if (newPaymentObj) {
      PdfGeneratorService.generateTuitionReceiptPDF(newPaymentObj, updatedDb);
    }
    PdfGeneratorService.generateEnrollmentCertificatePDF(newStudent, updatedDb);

    if (pendingApplicationId && CloudSyncService.isConnected()) {
      const applicationId = pendingApplicationId;
      setPendingApplicationId(null);
      void (async () => {
        try {
          await CloudSyncService.syncLocalStructure(updatedDb);
          await CloudSyncService.finalizeEnrollmentApplication(
            applicationId,
            matricule,
            newPaymentObj ? 'PAID' : 'PENDING'
          );
          onShowToast(
            'Le dossier QR a été confirmé et synchronisé dans le Cloud.',
            'success'
          );
        } catch (error) {
          console.warn('Finalisation préinscription QR:', error);
          onShowToast(
            'Inscription enregistrée localement. La confirmation Cloud sera à reprendre après reconnexion.',
            'info'
          );
        }
      })();
    }

    // Reset Form
    setFormData({
      lastName: '',
      firstName: '',
      gender: 'M',
      birthDate: '',
      birthPlace: 'Antananarivo',
      nationality: 'Malgache',
      address: '',
      neighborhood: '',
      city: 'Antananarivo',
      classId: db.classes[0]?.id || '',
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
      previousSchool: '',
      payFeeNow: true,
      paymentMethod: 'ESPECES',
      referenceNumber: '',
      payerName: '',
      discount: 0,
    });
  };

  const handleReRegistrationSubmit = () => {
    if (!selectedStudentForReReg) return;
    const targetClass = db.classes.find((c) => c.id === targetClassId) || db.classes[0];
    if (!targetClass) {
      onShowToast('Aucune classe cible disponible.', 'error');
      return;
    }

    const alreadyRegistered = db.students.some(
      (student) =>
        student.matricule === selectedStudentForReReg.matricule &&
        student.schoolYearId === db.currentSchoolYearId
    );
    if (alreadyRegistered) {
      onShowToast(
        `${selectedStudentForReReg.lastName} est déjà inscrit(e) pour l’année scolaire active.`,
        'error'
      );
      return;
    }

    const targetClassEnrollmentCount = db.students.filter(
      (student) =>
        student.schoolYearId === db.currentSchoolYearId &&
        student.classId === targetClass.id
    ).length;
    if (targetClassEnrollmentCount >= targetClass.capacity) {
      onShowToast(
        `La classe ${targetClass.name} a atteint sa capacité maximale (${targetClass.capacity} élèves).`,
        'error'
      );
      return;
    }

    const reRegFee = targetClass.reRegistrationFee ?? 0;
    if (reRegFee <= 0) {
      onShowToast('Le droit de réinscription doit être supérieur à 0.', 'error');
      return;
    }

    const receiptNum = getNextReceiptNumber();
    const now = Date.now();
    const enrollmentDate = new Date().toISOString().slice(0, 10);
    const newEnrollmentStudent: Student = {
      ...selectedStudentForReReg,
      id: `stu-${now}`,
      classId: targetClass.id,
      schoolYearId: db.currentSchoolYearId,
      status: 'REINSCRIT' as StudentStatus,
      enrollmentDate,
      councilDecision: undefined,
    };

    const newPayment: TuitionPayment = {
      id: `pay-${now}`,
      receiptNumber: receiptNum,
      studentId: newEnrollmentStudent.id,
      classId: targetClass.id,
      schoolYearId: db.currentSchoolYearId,
      feeType: 'REINSCRIPTION',
      monthTarget: `Droit Annuel Réinscription`,
      amount: reRegFee,
      discount: 0,
      totalDue: reRegFee,
      paymentDate: enrollmentDate,
      paymentMethod: reRegPayMethod,
      referenceNumber: reRegReference,
      payerName: selectedStudentForReReg.fatherName || selectedStudentForReReg.motherName || 'Parent',
      cashierName: 'Service Caisse & Admission',
      notes: `Réinscription en classe de ${targetClass.name}`,
    };

    const newTransaction = {
      id: `csh-${now}`,
      voucherNumber: `TR-${receiptNum}`,
      type: 'RECETTE' as const,
      category: 'Inscriptions & Droits',
      amount: reRegFee,
      date: enrollmentDate,
      paymentMethod: reRegPayMethod,
      beneficiaryOrPayer: newPayment.payerName,
      description: `Droit de réinscription pour ${selectedStudentForReReg.lastName} ${selectedStudentForReReg.firstName} (${targetClass.name})`,
      relatedReceiptId: newPayment.id,
      schoolYearId: db.currentSchoolYearId,
    };

    const carriedGuardianLinks = (db.studentGuardianLinks ?? [])
      .filter((link) => link.studentId === selectedStudentForReReg.id)
      .map((link) => ({
        ...link,
        id: `sg-${newEnrollmentStudent.id}-${link.guardianId}`,
        studentId: newEnrollmentStudent.id,
      }));

    const updatedDb: DatabaseSchema = {
      ...db,
      students: [newEnrollmentStudent, ...db.students],
      studentGuardianLinks: [
        ...(db.studentGuardianLinks ?? []),
        ...carriedGuardianLinks,
      ],
      tuitionPayments: [newPayment, ...db.tuitionPayments],
      cashTransactions: [newTransaction, ...db.cashTransactions],
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);

    onShowToast(`Réinscription de ${selectedStudentForReReg.lastName} validée avec succès !`, 'success');
    PdfGeneratorService.generateTuitionReceiptPDF(newPayment, updatedDb);

    if (pendingApplicationId && CloudSyncService.isConnected()) {
      const applicationId = pendingApplicationId;
      setPendingApplicationId(null);
      void (async () => {
        try {
          await CloudSyncService.syncLocalStructure(updatedDb);
          await CloudSyncService.finalizeEnrollmentApplication(
            applicationId,
            newEnrollmentStudent.matricule,
            'PAID'
          );
          onShowToast(
            'La réinscription QR a été confirmée dans le dossier famille Cloud.',
            'success'
          );
        } catch (error) {
          console.warn('Finalisation réinscription QR:', error);
          onShowToast(
            'Réinscription enregistrée localement. La confirmation Cloud sera à reprendre après reconnexion.',
            'info'
          );
        }
      })();
    }

    setSelectedStudentForReReg(null);
    setReRegSearch('');
  };

  const schoolYearStartMap = new Map(
    db.schoolYears.map((year) => [year.id, year.startDate])
  );
  const latestHistoricalEnrollmentByMatricule = new Map<string, Student>();
  db.students
    .filter((student) => student.schoolYearId !== db.currentSchoolYearId)
    .sort((a, b) =>
      (schoolYearStartMap.get(b.schoolYearId) || '').localeCompare(
        schoolYearStartMap.get(a.schoolYearId) || ''
      )
    )
    .forEach((student) => {
      if (!latestHistoricalEnrollmentByMatricule.has(student.matricule)) {
        latestHistoricalEnrollmentByMatricule.set(student.matricule, student);
      }
    });

  const filteredStudentsForReReg = Array.from(latestHistoricalEnrollmentByMatricule.values()).filter((s) => {
    const q = reRegSearch.toLowerCase().trim();
    if (!q) return false;

    const alreadyPresentInActiveYear = db.students.some(
      (current) =>
        current.matricule === s.matricule &&
        current.schoolYearId === db.currentSchoolYearId
    );
    if (alreadyPresentInActiveYear) return false;

    return (
      s.lastName.toLowerCase().includes(q) ||
      s.firstName.toLowerCase().includes(q) ||
      s.matricule.toLowerCase().includes(q)
    );
  });

  const prepareOnlineApplication = (application: EnrollmentQueueItem) => {
    if (application.application_type === 'RE_REGISTRATION') {
      setPendingApplicationId(application.id);
      setReRegSearch(application.existing_matricule || application.child_last_name);
      setActiveTab('RE_REGISTRATION');
      onShowToast(
        'Dossier de réinscription chargé. Vérifiez l’élève puis confirmez sa nouvelle classe.',
        'info'
      );
      return;
    }

    const family = application.family;
    const primaryRelationship = family?.relationship || 'GUARDIAN';
    setPendingApplicationId(application.id);
    setFormData((current) => ({
      ...current,
      lastName: application.child_last_name,
      firstName: application.child_first_name,
      gender: application.child_gender || 'M',
      birthDate: application.child_birth_date || current.birthDate,
      birthPlace: application.child_birth_place || '',
      nationality: application.child_nationality || 'Malgache',
      address: application.child_address || family?.address || '',
      neighborhood: application.child_neighborhood || '',
      city: application.child_city || family?.city || '',
      classId:
        db.classes.find(
          (item) =>
            cloudEntityUuid(
              'class',
              `${db.currentSchoolYearId}:${item.id}`
            ) === application.desired_class_id
        )?.id || current.classId,
      previousSchool: application.previous_school || '',
      birthCertificateNumber: application.birth_certificate_number || '',
      birthCertificateDate: application.birth_certificate_date || '',
      birthCertificatePlace: application.birth_certificate_place || '',
      bloodType: application.blood_type || '',
      medicalNotes: application.medical_notes || '',
      fatherName:
        primaryRelationship === 'FATHER'
          ? `${family?.guardian_last_name || ''} ${family?.guardian_first_name || ''}`.trim()
          : current.fatherName,
      fatherPhone:
        primaryRelationship === 'FATHER'
          ? family?.phone_primary || ''
          : current.fatherPhone,
      fatherEmail:
        primaryRelationship === 'FATHER' ? family?.email || '' : current.fatherEmail,
      fatherCinNumber:
        primaryRelationship === 'FATHER'
          ? family?.cin_number || ''
          : current.fatherCinNumber,
      fatherCinIssuedAt:
        primaryRelationship === 'FATHER'
          ? family?.cin_issued_at || ''
          : current.fatherCinIssuedAt,
      fatherCinIssuePlace:
        primaryRelationship === 'FATHER'
          ? family?.cin_issue_place || ''
          : current.fatherCinIssuePlace,
      fatherJob:
        primaryRelationship === 'FATHER'
          ? family?.occupation || ''
          : current.fatherJob,
      motherName:
        primaryRelationship === 'MOTHER'
          ? `${family?.guardian_last_name || ''} ${family?.guardian_first_name || ''}`.trim()
          : current.motherName,
      motherPhone:
        primaryRelationship === 'MOTHER'
          ? family?.phone_primary || ''
          : current.motherPhone,
      motherEmail:
        primaryRelationship === 'MOTHER' ? family?.email || '' : current.motherEmail,
      motherCinNumber:
        primaryRelationship === 'MOTHER'
          ? family?.cin_number || ''
          : current.motherCinNumber,
      motherCinIssuedAt:
        primaryRelationship === 'MOTHER'
          ? family?.cin_issued_at || ''
          : current.motherCinIssuedAt,
      motherCinIssuePlace:
        primaryRelationship === 'MOTHER'
          ? family?.cin_issue_place || ''
          : current.motherCinIssuePlace,
      motherJob:
        primaryRelationship === 'MOTHER'
          ? family?.occupation || ''
          : current.motherJob,
      guardianName:
        !['FATHER', 'MOTHER'].includes(primaryRelationship)
          ? `${family?.guardian_last_name || ''} ${family?.guardian_first_name || ''}`.trim()
          : current.guardianName,
      guardianPhone:
        !['FATHER', 'MOTHER'].includes(primaryRelationship)
          ? family?.phone_primary || ''
          : current.guardianPhone,
      guardianEmail:
        !['FATHER', 'MOTHER'].includes(primaryRelationship)
          ? family?.email || ''
          : current.guardianEmail,
      guardianCinNumber:
        !['FATHER', 'MOTHER'].includes(primaryRelationship)
          ? family?.cin_number || ''
          : current.guardianCinNumber,
      guardianCinIssuedAt:
        !['FATHER', 'MOTHER'].includes(primaryRelationship)
          ? family?.cin_issued_at || ''
          : current.guardianCinIssuedAt,
      guardianCinIssuePlace:
        !['FATHER', 'MOTHER'].includes(primaryRelationship)
          ? family?.cin_issue_place || ''
          : current.guardianCinIssuePlace,
      guardianJob:
        !['FATHER', 'MOTHER'].includes(primaryRelationship)
          ? family?.occupation || ''
          : current.guardianJob,
      emergencyContact: family
        ? `${family.guardian_last_name} ${family.guardian_first_name}`.trim()
        : current.emergencyContact,
      emergencyPhone: family?.phone_primary || current.emergencyPhone,
      payFeeNow: false,
    }));
    setActiveTab('NEW_ADMISSION');
    onShowToast(
      'Dossier QR prérempli. Appelez la famille, vérifiez les pièces puis validez l’inscription.',
      'info'
    );
  };

  const classMap = new Map(db.classes.map((c) => [c.id, c.name]));

  if (db.classes.length === 0) return (
    <section className="page-panel p-6 space-y-3">
      <h2 className="text-lg font-semibold">Préparez votre première inscription</h2>
      <p>Ajoutez d’abord les classes de l’établissement dans Paramètres → Classes, puis définissez leurs capacités et leurs frais.</p>
      <button type="button" className="button button--primary" onClick={onConfigureSchool}>Ouvrir les paramètres</button>
    </section>
  );

  return (
    <div className="space-y-6">
      <div className="page-panel p-2 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('NEW_ADMISSION')}
          className={`px-3 py-2 rounded-md text-[11.5px] font-semibold transition ${
            activeTab === 'NEW_ADMISSION'
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Nouvelle inscription
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('RE_REGISTRATION')}
          className={`px-3 py-2 rounded-md text-[11.5px] font-semibold transition ${
            activeTab === 'RE_REGISTRATION'
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Réinscription
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ONLINE')}
          className={`px-3 py-2 rounded-md text-[11.5px] font-semibold transition flex items-center gap-1.5 ${
            activeTab === 'ONLINE'
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          Préinscriptions QR
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('LOG')}
          className={`px-3 py-2 rounded-md text-[11.5px] font-semibold transition ${
            activeTab === 'LOG'
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Registre ({db.students.filter((student) => student.schoolYearId === db.currentSchoolYearId).length})
        </button>
      </div>

      {/* Onglet : nouvelle inscription */}
      {activeTab === 'NEW_ADMISSION' && (
        <form onSubmit={handleNewAdmissionSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Col 1 & 2: Student & Parent Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Identity Box */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <User className="w-4 h-4" />
                  <span>1. Identité Civile de l'Élève</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="admission-field-1" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nom de famille (Fianakaviana) *
                    </label>
                    <input id="admission-field-1"
                      type="text"
                      required
                      placeholder="Ex: RAKOTOMALALA"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label htmlFor="admission-field-2" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Prénoms (Fanampin'anarana) *
                    </label>
                    <input id="admission-field-2"
                      type="text"
                      required
                      placeholder="Ex: Andry Sitraka"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="admission-field-3" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Sexe *
                    </label>
                    <select id="admission-field-3"
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="M">Masculin (Lahy)</option>
                      <option value="F">Féminin (Vavy)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="admission-field-4" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Date de Naissance *
                    </label>
                    <input id="admission-field-4"
                      type="date"
                      required
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="admission-field-5" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Lieu de Naissance *
                    </label>
                    <input id="admission-field-5"
                      type="text"
                      required
                      placeholder="Ex: Maternité Befelatanana, Antananarivo"
                      value={formData.birthPlace}
                      onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="admission-field-6" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nationalité
                    </label>
                    <input id="admission-field-6"
                      type="text"
                      value={formData.nationality}
                      onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="admission-field-7" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Adresse Résidentielle & Lot *
                    </label>
                    <input id="admission-field-7"
                      type="text"
                      placeholder="Ex: Lot IV B 25, Ankadifotsy"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="admission-field-8" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Fokontany / Ville
                    </label>
                    <input id="admission-field-8"
                      type="text"
                      placeholder="Ex: Mahamasina, Antananarivo"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label htmlFor="admission-field-9" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      N° acte de naissance
                    </label>
                    <input id="admission-field-9"
                      type="text"
                      value={formData.birthCertificateNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, birthCertificateNumber: e.target.value })
                      }
                      placeholder="Référence de l'acte"
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="admission-field-10" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Date de l'acte
                    </label>
                    <input id="admission-field-10"
                      type="date"
                      value={formData.birthCertificateDate}
                      onChange={(e) =>
                        setFormData({ ...formData, birthCertificateDate: e.target.value })
                      }
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="admission-field-11" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Lieu de délivrance
                    </label>
                    <input id="admission-field-11"
                      type="text"
                      value={formData.birthCertificatePlace}
                      onChange={(e) =>
                        setFormData({ ...formData, birthCertificatePlace: e.target.value })
                      }
                      placeholder="Commune / arrondissement"
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>
              </div>

              {/* Parents / Tuteurs Box */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <Building className="w-4 h-4" />
                  <span>2. Parents & Personnes à Contacter en Urgence</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="admission-field-12" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nom complet du Père
                    </label>
                    <input id="admission-field-12"
                      type="text"
                      placeholder="Ex: RAKOTOMALALA Henri"
                      value={formData.fatherName}
                      onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="admission-field-13" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone Père (Mobile / MVola)
                    </label>
                    <input id="admission-field-13"
                      type="text"
                      placeholder="+261 34 00 000 00"
                      value={formData.fatherPhone}
                      onChange={(e) => setFormData({ ...formData, fatherPhone: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label htmlFor="admission-field-14" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nom complet de la Mère
                    </label>
                    <input id="admission-field-14"
                      type="text"
                      placeholder="Ex: RAZANAMPARANY Hanta"
                      value={formData.motherName}
                      onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="admission-field-15" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone Mère (Mobile / OM)
                    </label>
                    <input id="admission-field-15"
                      type="text"
                      placeholder="+261 33 00 000 00"
                      value={formData.motherPhone}
                      onChange={(e) => setFormData({ ...formData, motherPhone: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Pièces & coordonnées du père
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="N° CIN père"
                        value={formData.fatherCinNumber}
                        onChange={(e) => setFormData({ ...formData, fatherCinNumber: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="date"
                        title="Date de délivrance CIN père"
                        value={formData.fatherCinIssuedAt}
                        onChange={(e) => setFormData({ ...formData, fatherCinIssuedAt: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="text"
                        placeholder="Lieu de délivrance CIN"
                        value={formData.fatherCinIssuePlace}
                        onChange={(e) => setFormData({ ...formData, fatherCinIssuePlace: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="email"
                        placeholder="Email père"
                        value={formData.fatherEmail}
                        onChange={(e) => setFormData({ ...formData, fatherEmail: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="text"
                        placeholder="Profession du père"
                        value={formData.fatherJob}
                        onChange={(e) => setFormData({ ...formData, fatherJob: e.target.value })}
                        className="sm:col-span-2 w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Pièces & coordonnées de la mère
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="N° CIN mère"
                        value={formData.motherCinNumber}
                        onChange={(e) => setFormData({ ...formData, motherCinNumber: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="date"
                        title="Date de délivrance CIN mère"
                        value={formData.motherCinIssuedAt}
                        onChange={(e) => setFormData({ ...formData, motherCinIssuedAt: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="text"
                        placeholder="Lieu de délivrance CIN"
                        value={formData.motherCinIssuePlace}
                        onChange={(e) => setFormData({ ...formData, motherCinIssuePlace: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="email"
                        placeholder="Email mère"
                        value={formData.motherEmail}
                        onChange={(e) => setFormData({ ...formData, motherEmail: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                      <input
                        type="text"
                        placeholder="Profession de la mère"
                        value={formData.motherJob}
                        onChange={(e) => setFormData({ ...formData, motherJob: e.target.value })}
                        className="sm:col-span-2 w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 space-y-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Tuteur / responsable légal si différent des parents
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input
                      type="text"
                      placeholder="Nom complet"
                      value={formData.guardianName}
                      onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="text"
                      placeholder="Téléphone"
                      value={formData.guardianPhone}
                      onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="text"
                      placeholder="N° CIN"
                      value={formData.guardianCinNumber}
                      onChange={(e) => setFormData({ ...formData, guardianCinNumber: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={formData.guardianEmail}
                      onChange={(e) => setFormData({ ...formData, guardianEmail: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="date"
                      title="Date de délivrance CIN tuteur"
                      value={formData.guardianCinIssuedAt}
                      onChange={(e) => setFormData({ ...formData, guardianCinIssuedAt: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="text"
                      placeholder="Lieu CIN"
                      value={formData.guardianCinIssuePlace}
                      onChange={(e) => setFormData({ ...formData, guardianCinIssuePlace: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="text"
                      placeholder="Profession"
                      value={formData.guardianJob}
                      onChange={(e) => setFormData({ ...formData, guardianJob: e.target.value })}
                      className="sm:col-span-2 w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label htmlFor="admission-field-16" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Contact d'Urgence Prioritaire
                    </label>
                    <input id="admission-field-16"
                      type="text"
                      placeholder="Ex: Mme RAZANAMPARANY Hanta (Mère)"
                      value={formData.emergencyContact}
                      onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="admission-field-17" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone d'Urgence Direct
                    </label>
                    <input id="admission-field-17"
                      type="text"
                      placeholder="+261 34 00 000 00"
                      value={formData.emergencyPhone}
                      onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Col 3: Academic Assignment & Financial Payment */}
            <div className="space-y-6">
              {/* Class & Matricule Box */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <Calendar className="w-4 h-4" />
                  <span>3. Classe & Matricule</span>
                </div>

                <div>
                  <label htmlFor="admission-field-18" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Classe d'affectation *
                  </label>
                  <select id="admission-field-18"
                    value={formData.classId}
                    onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                    className="w-full text-xs px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                  >
                    {db.classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} ({cls.level.toUpperCase()} - Série {cls.serie || 'GEN'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Live Matricule Preview */}
                <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-blue-900 dark:text-blue-300">
                    <span className="font-semibold">Format Matricule :</span>
                    <span className="font-mono text-[10px] text-blue-500">{db.matriculeConfig.pattern}</span>
                  </div>
                  <div className="text-sm font-extrabold font-mono text-blue-600 dark:text-blue-400">
                    {generatedMatriculePreview}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Format défini dans les paramètres de matricule
                  </div>
                </div>

                <div>
                  <label htmlFor="admission-field-19" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Établissement d'origine (Passage / Transfert)
                  </label>
                  <input id="admission-field-19"
                    type="text"
                    placeholder="Ex: Collège Saint-Joseph Antsirabe"
                    value={formData.previousSchool}
                    onChange={(e) => setFormData({ ...formData, previousSchool: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Financial Box */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <CreditCard className="w-4 h-4" />
                  <span>4. Droits d'Inscription & Caisse</span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700">
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Encaisser les droits immédiatement
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Montant fixé : {CalculationService.formatAriary(selectedClass?.registrationFee ?? 0)}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.payFeeNow}
                    onChange={(e) => setFormData({ ...formData, payFeeNow: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                {formData.payFeeNow && (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label htmlFor="admission-field-20" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Remise / réduction (Ariary)
                      </label>
                      <input id="admission-field-20"
                        type="number"
                        min="0"
                        step="500"
                        value={formData.discount}
                        onChange={(e) => setFormData({ ...formData, discount: Number(e.target.value) })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                      />
                      {Number(formData.discount || 0) > 0 && (
                        <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                          Net à encaisser : {CalculationService.formatAriary(
                            Math.max(
                              0,
                              (selectedClass?.registrationFee ?? 0) - Number(formData.discount || 0)
                            )
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label htmlFor="admission-field-21" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Mode de Règlement *
                      </label>
                      <select id="admission-field-21"
                        value={formData.paymentMethod}
                        onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as PaymentMethod })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="ESPECES">Espèces (Caisse)</option>
                        <option value="MVOLA">MVola (Telma)</option>
                        <option value="ORANGE_MONEY">Orange Money</option>
                        <option value="AIRTEL_MONEY">Airtel Money</option>
                        <option value="VIREMENT">Virement Bancaire (BOA, BNI...)</option>
                        <option value="CHEQUE">Chèque Bancaire</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="admission-field-22" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Référence / N° Transaction
                      </label>
                      <input id="admission-field-22"
                        type="text"
                        placeholder="Ex: TXN-MV-993812 / N° Chèque"
                        value={formData.referenceNumber}
                        onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition active:scale-95 flex items-center justify-center space-x-2"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Valider l'Inscription & Générer les Actes</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: RÉINSCRIPTION EXPRESS */}
      {activeTab === 'RE_REGISTRATION' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Rechercher un élève existant pour la nouvelle année scolaire
            </h3>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={reRegSearch}
                onChange={(e) => setReRegSearch(e.target.value)}
                placeholder="Taper le nom, prénom ou matricule de l'élève..."
                className="w-full text-xs pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Results */}
            {filteredStudentsForReReg.length > 0 && !selectedStudentForReReg && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                {filteredStudentsForReReg.map((student) => (
                  <div
                    key={student.id}
                    onClick={() => {
                      setSelectedStudentForReReg(student);
                      setTargetClassId(student.classId);
                    }}
                    className="p-3 flex items-center justify-between hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer transition"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900 dark:text-white">
                        {student.lastName} {student.firstName}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Matricule: <span className="font-mono">{student.matricule}</span> • Classe actuelle:{' '}
                        {classMap.get(student.classId)}
                      </div>
                    </div>
                    <button className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600 text-white">
                      Sélectionner
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected student form */}
          {selectedStudentForReReg && (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-700 shadow-lg space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">
                    Dossier Sélectionné
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {selectedStudentForReReg.lastName} {selectedStudentForReReg.firstName}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Matricule conservé : {selectedStudentForReReg.matricule}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStudentForReReg(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
                >
                  Changer d'élève
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="admission-field-23" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nouvelle Classe de Passage *
                  </label>
                  <select id="admission-field-23"
                    value={targetClassId}
                    onChange={(e) => setTargetClassId(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  >
                    {db.classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} (Droits : {CalculationService.formatAriary(cls.reRegistrationFee)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="admission-field-24" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mode de Règlement *
                  </label>
                  <select id="admission-field-24"
                    value={reRegPayMethod}
                    onChange={(e) => setReRegPayMethod(e.target.value as PaymentMethod)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ESPECES">Espèces (Caisse)</option>
                    <option value="MVOLA">MVola</option>
                    <option value="ORANGE_MONEY">Orange Money</option>
                    <option value="AIRTEL_MONEY">Airtel Money</option>
                    <option value="VIREMENT">Virement Bancaire</option>
                    <option value="CHEQUE">Chèque</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="admission-field-25" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Référence de Paiement
                  </label>
                  <input id="admission-field-25"
                    type="text"
                    placeholder="Ex: Réf MVola / Chèque"
                    value={reRegReference}
                    onChange={(e) => setReRegReference(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <button
                onClick={handleReRegistrationSubmit}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Valider la Réinscription & Imprimer la Quittance</span>
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'ONLINE' && (
        <OnlineEnrollmentPanel
          db={db}
          onShowToast={onShowToast}
          onPrepare={prepareOnlineApplication}
        />
      )}

      {/* Onglet : registre des admissions */}
      {activeTab === 'LOG' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Registre des élèves inscrits
            </h3>
            <button
              onClick={() =>
                StorageService.exportStudentsCSV({
                  ...db,
                  students: db.students.filter(
                    (student) => student.schoolYearId === db.currentSchoolYearId
                  ),
                })
              }
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition"
            >
              Exporter Registre (CSV)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-2.5 px-3">Matricule</th>
                  <th className="py-2.5 px-3">Nom & Prénoms</th>
                  <th className="py-2.5 px-3">Classe</th>
                  <th className="py-2.5 px-3">Date Admission</th>
                  <th className="py-2.5 px-3">Statut</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {db.students
                  .filter((student) => student.schoolYearId === db.currentSchoolYearId)
                  .map((student) => (
                  <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {student.matricule}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      {student.lastName} {student.firstName}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {classMap.get(student.classId) || student.classId}
                    </td>
                    <td className="py-3 px-3 text-slate-500">{student.enrollmentDate}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                        {student.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right space-x-2">
                      <button
                        onClick={() => PdfGeneratorService.generateEnrollmentCertificatePDF(student, db)}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 inline-flex items-center space-x-1"
                        title="Imprimer le certificat de scolarité"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Certificat</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
