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
} from 'lucide-react';
import { DatabaseSchema, Student, TuitionPayment, PaymentMethod, StudentStatus } from '../../types/school';
import { MatriculeService } from '../../services/matricule';
import { CalculationService } from '../../services/calculations';
import { StorageService } from '../../services/storage';
import { PdfGeneratorService } from '../../services/pdfGenerator';

interface RegistrationViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const RegistrationView: React.FC<RegistrationViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'NEW_ADMISSION' | 'RE_REGISTRATION' | 'LOG'>('NEW_ADMISSION');

  // Form State for New Admission
  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    gender: 'M' as 'M' | 'F',
    birthDate: '2008-01-15',
    birthPlace: 'Antananarivo',
    nationality: 'Malgache',
    address: '',
    neighborhood: '',
    city: 'Antananarivo',
    classId: db.classes[0]?.id || '',
    fatherName: '',
    fatherPhone: '',
    fatherJob: '',
    motherName: '',
    motherPhone: '',
    motherJob: '',
    guardianName: '',
    guardianPhone: '',
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
      fatherName: formData.fatherName,
      fatherPhone: formData.fatherPhone,
      fatherJob: formData.fatherJob,
      motherName: formData.motherName,
      motherPhone: formData.motherPhone,
      motherJob: formData.motherJob,
      guardianName: formData.guardianName,
      guardianPhone: formData.guardianPhone,
      emergencyContact: formData.emergencyContact || `${formData.fatherName || formData.motherName} (Parent)`,
      emergencyPhone: formData.emergencyPhone || formData.fatherPhone || formData.motherPhone || '',
      bloodType: formData.bloodType,
      medicalNotes: formData.medicalNotes,
      previousSchool: formData.previousSchool,
    };

    let updatedPayments = [...db.tuitionPayments];
    let updatedTransactions = [...db.cashTransactions];
    let newPaymentObj: TuitionPayment | null = null;

    if (formData.payFeeNow) {
      const regFee = selectedClass.registrationFee || 100000;
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

    const updatedDb: DatabaseSchema = {
      ...db,
      matriculeConfig: {
        ...db.matriculeConfig,
        currentCounter: updatedCounter,
      },
      students: [newStudent, ...db.students],
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

    // Reset Form
    setFormData({
      lastName: '',
      firstName: '',
      gender: 'M',
      birthDate: '2008-01-15',
      birthPlace: 'Antananarivo',
      nationality: 'Malgache',
      address: '',
      neighborhood: '',
      city: 'Antananarivo',
      classId: db.classes[0]?.id || '',
      fatherName: '',
      fatherPhone: '',
      fatherJob: '',
      motherName: '',
      motherPhone: '',
      motherJob: '',
      guardianName: '',
      guardianPhone: '',
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

    const reRegFee = targetClass.reRegistrationFee || 80000;
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

    const updatedDb: DatabaseSchema = {
      ...db,
      students: [newEnrollmentStudent, ...db.students],
      tuitionPayments: [newPayment, ...db.tuitionPayments],
      cashTransactions: [newTransaction, ...db.cashTransactions],
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);

    onShowToast(`Réinscription de ${selectedStudentForReReg.lastName} validée avec succès !`, 'success');
    PdfGeneratorService.generateTuitionReceiptPDF(newPayment, updatedDb);

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

  const classMap = new Map(db.classes.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      {/* En-tête du module */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white m-0">
            Guichet des Inscriptions & Réinscriptions
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Admission rapide, assignation de matricule paramétrable, quittance et certificat instantanés
          </p>
        </div>

        <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            onClick={() => setActiveTab('NEW_ADMISSION')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center space-x-1.5 ${
              activeTab === 'NEW_ADMISSION'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Nouvelle Inscription</span>
          </button>
          <button
            onClick={() => setActiveTab('RE_REGISTRATION')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center space-x-1.5 ${
              activeTab === 'RE_REGISTRATION'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Réinscription Express</span>
          </button>
          <button
            onClick={() => setActiveTab('LOG')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center space-x-1.5 ${
              activeTab === 'LOG'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>
              Registre ({db.students.filter((student) => student.schoolYearId === db.currentSchoolYearId).length})
            </span>
          </button>
        </div>
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
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nom de famille (Fianakaviana) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: RAKOTOMALALA"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Prénoms (Fanampin'anarana) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Andry Sitraka"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Sexe *
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="M">Masculin (Lahy)</option>
                      <option value="F">Féminin (Vavy)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Date de Naissance *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Lieu de Naissance *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Maternité Befelatanana, Antananarivo"
                      value={formData.birthPlace}
                      onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nationalité
                    </label>
                    <input
                      type="text"
                      value={formData.nationality}
                      onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Adresse Résidentielle & Lot *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Lot IV B 25, Ankadifotsy"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Fokontany / Ville
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Mahamasina, Antananarivo"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nom complet du Père
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: RAKOTOMALALA Henri"
                      value={formData.fatherName}
                      onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone Père (Mobile / MVola)
                    </label>
                    <input
                      type="text"
                      placeholder="+261 34 00 000 00"
                      value={formData.fatherPhone}
                      onChange={(e) => setFormData({ ...formData, fatherPhone: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nom complet de la Mère
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: RAZANAMPARANY Hanta"
                      value={formData.motherName}
                      onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone Mère (Mobile / OM)
                    </label>
                    <input
                      type="text"
                      placeholder="+261 33 00 000 00"
                      value={formData.motherPhone}
                      onChange={(e) => setFormData({ ...formData, motherPhone: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Contact d'Urgence Prioritaire
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Mme RAZANAMPARANY Hanta (Mère)"
                      value={formData.emergencyContact}
                      onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Téléphone d'Urgence Direct
                    </label>
                    <input
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
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Classe d'affectation *
                  </label>
                  <select
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
                    Généré et incrémenté automatiquement selon vos règles de configuration
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Établissement d'origine (Passage / Transfert)
                  </label>
                  <input
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
                      Montant fixé : {CalculationService.formatAriary(selectedClass.registrationFee || 100000)}
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
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Remise / réduction (Ariary)
                      </label>
                      <input
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
                              (selectedClass.registrationFee || 100000) - Number(formData.discount || 0)
                            )
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Mode de Règlement *
                      </label>
                      <select
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
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Référence / N° Transaction
                      </label>
                      <input
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
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nouvelle Classe de Passage *
                  </label>
                  <select
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
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mode de Règlement *
                  </label>
                  <select
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
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Référence de Paiement
                  </label>
                  <input
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

      {/* Onglet : registre des admissions */}
      {activeTab === 'LOG' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Registre Matricule Officiel des Élèves Inscrits
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
