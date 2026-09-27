import React, { useState } from 'react';
import {
  Wallet,
  PlusCircle,
  Printer,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  Calendar,
  Sliders,
  Send,
  FileText,
} from 'lucide-react';
import {
  DatabaseSchema,
  TuitionPayment,
  SalaryPayment,
  CashTransaction,
  PaymentMethod,
} from '../../types/school';
import { CalculationService } from '../../services/calculations';
import { StorageService } from '../../services/storage';
import { PdfGeneratorService } from '../../services/pdfGenerator';
import { Modal } from '../common/Modal';

interface FinancesManagerViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialAction?: 'NEW_PAYMENT';
}

export const FinancesManagerView: React.FC<FinancesManagerViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
  initialAction,
}) => {
  const [activeTab, setActiveTab] = useState<'TUITION_GRID' | 'PAYMENTS_HISTORY' | 'PAYROLL' | 'TREASURY'>('TUITION_GRID');
  const [selectedClassId, setSelectedClassId] = useState<string>(db.classes[0]?.id || '');

  // Modals state
  const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = useState(initialAction === 'NEW_PAYMENT');
  const [isNewSalaryModalOpen, setIsNewSalaryModalOpen] = useState(false);
  const [isNewExpenseModalOpen, setIsNewExpenseModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [selectedStudentForReminder, setSelectedStudentForReminder] = useState<string | null>(null);

  // Texte de rappel personnalisable
  const [customReminderText, setCustomReminderText] = useState(
    db.schoolConfig.reminderTemplate ||
      "Chers Parents de l'élève {NOM} ({CLASSE}), sauf erreur de notre part, l'écolage du/des mois de {MOIS_IMPAYES} d'un montant de {MONTANT} reste en attente de règlement à la caisse de l'école. Merci de bien vouloir régulariser cette situation rapidement."
  );

  // New Tuition Payment Form State
  const activeSchoolYear = db.schoolYears.find((y) => y.id === db.currentSchoolYearId);
  const activeSchoolYearStart = activeSchoolYear?.startDate.slice(0, 4) || String(new Date().getFullYear());
  const defaultTuitionMonth = `Novembre ${activeSchoolYearStart}`;
  const defaultSalaryMonth = `Octobre ${activeSchoolYearStart}`;

  const [tuitionForm, setTuitionForm] = useState({
    studentId: db.students.find((s) => s.schoolYearId === db.currentSchoolYearId)?.id || '',
    feeType: 'ECOLAGE_MENSUEL' as TuitionPayment['feeType'],
    monthTarget: defaultTuitionMonth,
    amount: 95000,
    discount: 0,
    paymentMethod: 'ESPECES' as PaymentMethod,
    referenceNumber: '',
    payerName: '',
    notes: '',
  });

  // New Salary Form State
  const [salaryForm, setSalaryForm] = useState({
    teacherId: db.teachers[0]?.id || '',
    month: defaultSalaryMonth,
    hoursWorked: 40,
    advances: 0,
    bonuses: 0,
    paymentMethod: 'VIREMENT' as PaymentMethod,
    referenceNumber: '',
    notes: '',
  });

  // New General Transaction Form State
  const [txForm, setTxForm] = useState({
    type: 'DEPENSE' as 'RECETTE' | 'DEPENSE',
    category: 'Fournitures scolaires & Pédagogie',
    amount: 100000,
    beneficiaryOrPayer: '',
    description: '',
    paymentMethod: 'ESPECES' as PaymentMethod,
  });

  const metrics = CalculationService.computeFinancialMetrics(db);
  const classMap = new Map(db.classes.map((c) => [c.id, c]));
  const studentMap = new Map(db.students.map((s) => [s.id, s]));
  const teacherMap = new Map(db.teachers.map((t) => [t.id, t]));

  const schoolMonths = db.schoolConfig.schoolMonths || [
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
  ];

  const studentsInClass = db.students.filter(
    (s) => s.classId === selectedClassId && s.schoolYearId === db.currentSchoolYearId
  );

  // Handle student select in tuition modal to update default class fee
  const handleStudentSelectInModal = (stuId: string, prefilledMonth?: string) => {
    const stu = studentMap.get(stuId);
    const cls = stu ? classMap.get(stu.classId) : null;
    const defaultAmount = cls ? cls.monthlyTuitionFee : 90000;
    setTuitionForm({
      ...tuitionForm,
      studentId: stuId,
      monthTarget: prefilledMonth || tuitionForm.monthTarget,
      amount: defaultAmount,
      payerName: stu ? `${stu.fatherName || stu.motherName || 'Parent'}` : '',
    });
  };

  // Submit Tuition Payment
  const handleSubmitTuition = (e: React.FormEvent) => {
    e.preventDefault();
    const stu = studentMap.get(tuitionForm.studentId);
    if (!stu) return;

    const baseAmount = Math.max(0, Number(tuitionForm.amount || 0));
    const discount = Math.max(0, Number(tuitionForm.discount || 0));
    const netAmount = Math.max(0, baseAmount - discount);
    if (baseAmount <= 0 || netAmount <= 0) {
      onShowToast('Le montant encaissé doit être supérieur à 0.', 'error');
      return;
    }
    if (discount > baseAmount) {
      onShowToast('La remise ne peut pas dépasser le montant demandé.', 'error');
      return;
    }

    const receiptYear = activeSchoolYearStart;
    const usedReceiptNumbers = db.tuitionPayments
      .map((p) => p.receiptNumber)
      .filter((n) => n.startsWith(`REC-${receiptYear}-`))
      .map((n) => Number(n.split('-').pop()))
      .filter((n) => Number.isFinite(n));
    const nextReceiptSequence = (usedReceiptNumbers.length > 0 ? Math.max(...usedReceiptNumbers) : 0) + 1;
    const receiptNum = `REC-${receiptYear}-${String(nextReceiptSequence).padStart(4, '0')}`;
    const newPayment: TuitionPayment = {
      id: `pay-${Date.now()}`,
      receiptNumber: receiptNum,
      studentId: stu.id,
      classId: stu.classId,
      schoolYearId: db.currentSchoolYearId,
      feeType: tuitionForm.feeType,
      monthTarget: tuitionForm.monthTarget,
      amount: netAmount,
      discount,
      totalDue: baseAmount,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentMethod: tuitionForm.paymentMethod,
      referenceNumber: tuitionForm.referenceNumber,
      payerName: tuitionForm.payerName || `${stu.lastName} Parent`,
      cashierName: 'Service Caisse',
      notes: tuitionForm.notes,
    };

    const newTx: CashTransaction = {
      id: `csh-${Date.now()}`,
      voucherNumber: `TR-${receiptNum}`,
      type: 'RECETTE',
      category: 'Écolages & Scolarité',
      amount: netAmount,
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: tuitionForm.paymentMethod,
      beneficiaryOrPayer: newPayment.payerName,
      description: `Règlement écolage ${stu.lastName} ${stu.firstName} (${newPayment.monthTarget})`,
      relatedReceiptId: newPayment.id,
      schoolYearId: db.currentSchoolYearId,
    };

    const updatedDb: DatabaseSchema = {
      ...db,
      tuitionPayments: [newPayment, ...db.tuitionPayments],
      cashTransactions: [newTx, ...db.cashTransactions],
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    setIsNewPaymentModalOpen(false);
    onShowToast(`Paiement de ${CalculationService.formatAriary(netAmount)} enregistré ! Reçu N° ${receiptNum}`, 'success');

    // Auto generate PDF receipt
    PdfGeneratorService.generateTuitionReceiptPDF(newPayment, updatedDb);
  };

  // Submit Salary Payment
  const handleSubmitSalary = (e: React.FormEvent) => {
    e.preventDefault();
    const teacher = teacherMap.get(salaryForm.teacherId);
    if (!teacher) return;

    const isTitulaire = teacher.contractType === 'TITULAIRE';
    const gross = isTitulaire
      ? teacher.baseMonthlySalary
      : teacher.hourlyRate * Number(salaryForm.hoursWorked);

    const cnaps = Math.round(gross * 0.01);
    const ostie = Math.round(gross * 0.01);
    const advances = Number(salaryForm.advances || 0);
    const bonuses = Number(salaryForm.bonuses || 0);
    const net = gross + bonuses - advances - cnaps - ostie;

    const voucherNum = `SAL-${new Date().getFullYear()}-${String(db.salaryPayments.length + 1).padStart(4, '0')}`;
    const newSalary: SalaryPayment = {
      id: `sal-${Date.now()}`,
      voucherNumber: voucherNum,
      teacherId: teacher.id,
      schoolYearId: db.currentSchoolYearId,
      month: salaryForm.month,
      paymentDate: new Date().toISOString().slice(0, 10),
      contractType: teacher.contractType,
      baseSalaryOrRate: isTitulaire ? teacher.baseMonthlySalary : teacher.hourlyRate,
      hoursWorked: isTitulaire ? 0 : Number(salaryForm.hoursWorked),
      grossSalary: gross,
      advances,
      bonuses,
      cnapsDeduction: cnaps,
      ostieDeduction: ostie,
      otherDeductions: 0,
      netSalary: net,
      paymentMethod: salaryForm.paymentMethod,
      referenceNumber: salaryForm.referenceNumber,
      notes: salaryForm.notes,
    };

    const newTx: CashTransaction = {
      id: `csh-${Date.now()}`,
      voucherNumber: `TR-${voucherNum}`,
      type: 'DEPENSE',
      category: 'Salaires & Vacations',
      amount: net,
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: salaryForm.paymentMethod,
      beneficiaryOrPayer: `${teacher.lastName} ${teacher.firstName}`,
      description: `Règlement salaire ${teacher.lastName} (${salaryForm.month})`,
      schoolYearId: db.currentSchoolYearId,
    };

    const updatedDb: DatabaseSchema = {
      ...db,
      salaryPayments: [newSalary, ...db.salaryPayments],
      cashTransactions: [newTx, ...db.cashTransactions],
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    setIsNewSalaryModalOpen(false);
    onShowToast(`Salaire de ${teacher.lastName} validé (${CalculationService.formatAriary(net)}) !`, 'success');

    PdfGeneratorService.generateSalaryPayslipPDF(newSalary, updatedDb);
  };

  // Submit Miscellaneous Transaction
  const handleSubmitTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const vNum = `TR-${txForm.type === 'RECETTE' ? 'REC' : 'DEP'}-${Date.now().toString().slice(-4)}`;

    const newTx: CashTransaction = {
      id: `csh-${Date.now()}`,
      voucherNumber: vNum,
      type: txForm.type,
      category: txForm.category,
      amount: Number(txForm.amount),
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: txForm.paymentMethod,
      beneficiaryOrPayer: txForm.beneficiaryOrPayer || 'Administration',
      description: txForm.description,
      schoolYearId: db.currentSchoolYearId,
    };

    const updatedDb: DatabaseSchema = {
      ...db,
      cashTransactions: [newTx, ...db.cashTransactions],
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    setIsNewExpenseModalOpen(false);
    onShowToast(`Écriture comptable de ${CalculationService.formatAriary(newTx.amount)} enregistrée !`, 'success');
  };

  // Helper: check if a student paid for a specific month
  const isMonthPaid = (studentId: string, monthName: string) => {
    return db.tuitionPayments.find(
      (p) =>
        p.studentId === studentId &&
        p.schoolYearId === db.currentSchoolYearId &&
        p.feeType === 'ECOLAGE_MENSUEL' &&
        p.monthTarget?.toLowerCase().includes(monthName.toLowerCase())
    );
  };

  // Build reminder text for a student
  const getReminderTextForStudent = (stu: typeof db.students[0]) => {
    const unpaidMonths = schoolMonths.filter((m) => !isMonthPaid(stu.id, m));
    const cls = classMap.get(stu.classId);
    const feePerMonth = cls ? cls.monthlyTuitionFee : 90000;
    const totalDue = unpaidMonths.length * feePerMonth;

    let text = customReminderText;
    text = text.replace('{NOM}', `${stu.lastName} ${stu.firstName}`);
    text = text.replace('{CLASSE}', cls?.name || 'Sa classe');
    text = text.replace('{MOIS_IMPAYES}', unpaidMonths.join(', '));
    text = text.replace('{MONTANT}', CalculationService.formatAriary(totalDue));
    return { text, unpaidMonths, totalDue };
  };

  return (
    <div className="space-y-6">
      {/* En-tête et indicateurs */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white m-0">
            Caisse de l'École : Pointage des Écolages & Salaires
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tableau de pointage des 10 mois, encaissements rapides, rappels de cahier de liaison et paie des professeurs
          </p>
        </div>

        {/* Onglets et actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              onClick={() => setActiveTab('TUITION_GRID')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'TUITION_GRID'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Pointage des 10 Mois
            </button>
            <button
              onClick={() => setActiveTab('PAYMENTS_HISTORY')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'PAYMENTS_HISTORY'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Reçus & Quittances
            </button>
            <button
              onClick={() => setActiveTab('PAYROLL')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'PAYROLL'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Salaires & Vacations
            </button>
            <button
              onClick={() => setActiveTab('TREASURY')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'TREASURY'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Livre de Caisse
            </button>
          </div>

          <button
            onClick={() => setIsNewPaymentModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95 transition"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Encaisser</span>
          </button>
        </div>
      </div>

      {/* 3 Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Recettes Encaissées</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {CalculationService.formatAriary(metrics.grandTotalRevenues)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Écolages : {CalculationService.formatAriary(metrics.totalTuitionCollected)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Dépenses & Salaires</span>
            <ArrowDownRight className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {CalculationService.formatAriary(metrics.grandTotalExpenses)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Salaires profs : {CalculationService.formatAriary(metrics.totalSalariesPaid)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Solde Disponible en Caisse</span>
            <Wallet className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400">
            {CalculationService.formatAriary(metrics.netTreasuryBalance)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Trésorerie de l'école à jour
          </div>
        </div>
      </div>

      {/* TAB 1: GRILLE DE POINTAGE DES 10 MOIS PAR CLASSE */}
      {activeTab === 'TUITION_GRID' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center space-x-3">
              <Calendar className="w-5 h-5 text-blue-600" />
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Sélectionner la classe à pointer
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="text-sm font-extrabold px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-sans"
                >
                  {db.classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} (Écolage : {CalculationService.formatAriary(cls.monthlyTuitionFee)}/mois)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setSelectedStudentForReminder(null);
                  setIsReminderModalOpen(true);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Mots de Rappel Cahier de Liaison</span>
              </button>
            </div>
          </div>

          {/* Pointing Matrix Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50/70 dark:bg-slate-800/50">
                  <th className="py-3 px-3 w-44">Élève ({studentsInClass.length})</th>
                  {schoolMonths.map((m) => (
                    <th key={m} className="py-3 px-1.5 text-center text-[10px]">
                      {m.slice(0, 4)}
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right">État Global</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {studentsInClass.map((student) => {
                  const paidCount = schoolMonths.filter((m) => !!isMonthPaid(student.id, m)).length;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        <div className="truncate font-bold">{student.lastName} {student.firstName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{student.matricule}</div>
                      </td>

                      {schoolMonths.map((m) => {
                        const paidRecord = isMonthPaid(student.id, m);
                        return (
                          <td key={m} className="py-2.5 px-1.5 text-center">
                            {paidRecord ? (
                              <button
                                onClick={() => PdfGeneratorService.generateTuitionReceiptPDF(paidRecord, db)}
                                className="w-7 h-7 mx-auto rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs hover:scale-110 transition shadow-sm"
                                title={`Payé le ${paidRecord.paymentDate} (${paidRecord.receiptNumber}) - Cliquez pour imprimer le reçu`}
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  handleStudentSelectInModal(student.id, `${m} 2025`);
                                  setIsNewPaymentModalOpen(true);
                                }}
                                className="w-7 h-7 mx-auto rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-500 hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center text-[10px] font-bold border border-rose-200 dark:border-rose-900/60 transition"
                                title={`Non réglé pour ${m} - Cliquez pour encaisser`}
                              >
                                -
                              </button>
                            )}
                          </td>
                        );
                      })}

                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              paidCount >= 3
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {paidCount} / {schoolMonths.length} mois
                          </span>
                          <button
                            onClick={() => {
                              setSelectedStudentForReminder(student.id);
                              setIsReminderModalOpen(true);
                            }}
                            className="p-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 text-[10px]"
                            title="Imprimer un mot de rappel personnalisé"
                          >
                            <FileText className="w-3.5 h-3.5" />
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
      )}

      {/* TAB 2: HISTORIQUE DES REÇUS */}
      {activeTab === 'PAYMENTS_HISTORY' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Historique des Reçus & Quittances de Caisse ({db.tuitionPayments.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/40">
                  <th className="py-3 px-3">N° Quittance</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Élève & Classe</th>
                  <th className="py-3 px-3">Type & Mois</th>
                  <th className="py-3 px-3">Règlement</th>
                  <th className="py-3 px-3 text-right">Montant Versé</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {db.tuitionPayments.map((p) => {
                  const stu = studentMap.get(p.studentId);
                  const cls = classMap.get(p.classId);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {p.receiptNumber}
                      </td>
                      <td className="py-3 px-3 text-slate-500">{p.paymentDate}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {stu ? `${stu.lastName} ${stu.firstName}` : 'Élève'}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {cls?.name} • Mat: {stu?.matricule}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {p.feeType.replace('_', ' ')}
                        </span>
                        <div className="text-[11px] text-slate-400">{p.monthTarget}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                        {CalculationService.formatAriary(p.amount)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => PdfGeneratorService.generateTuitionReceiptPDF(p, db)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition inline-flex items-center space-x-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Reçu PDF</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PAIE DES PROFESSEURS */}
      {activeTab === 'PAYROLL' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Fiches de Paie des Enseignants & Personnel
            </h3>
            <button
              onClick={() => setIsNewSalaryModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Émettre Fiche de Paie</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/40">
                  <th className="py-3 px-3">N° Fiche</th>
                  <th className="py-3 px-3">Mois / Date</th>
                  <th className="py-3 px-3">Enseignant</th>
                  <th className="py-3 px-3">Statut / Base</th>
                  <th className="py-3 px-3 text-right">Brut</th>
                  <th className="py-3 px-3 text-right">Retenues</th>
                  <th className="py-3 px-3 text-right">Net à Payer</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {db.salaryPayments.map((sal) => {
                  const t = teacherMap.get(sal.teacherId);
                  return (
                    <tr key={sal.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="py-3 px-3 font-mono font-bold text-purple-600 dark:text-purple-400">
                        {sal.voucherNumber}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{sal.month}</div>
                        <div className="text-[10px] text-slate-400">{sal.paymentDate}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {t ? `${t.lastName} ${t.firstName}` : 'Enseignant'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                          {sal.contractType}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        {CalculationService.formatAriary(sal.grossSalary)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                        -{CalculationService.formatAriary(sal.cnapsDeduction + sal.ostieDeduction + sal.advances)}
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-sm text-purple-600 dark:text-purple-400">
                        {CalculationService.formatAriary(sal.netSalary)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => PdfGeneratorService.generateSalaryPayslipPDF(sal, db)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 hover:bg-purple-100 transition inline-flex items-center space-x-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Fiche PDF</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: GRAND LIVRE DE CAISSE */}
      {activeTab === 'TREASURY' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Grand Livre de Caisse & Écritures ({db.cashTransactions.length})
            </h3>
            <button
              onClick={() => setIsNewExpenseModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nouvelle Écriture</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/40">
                  <th className="py-3 px-3">Pièce N°</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Catégorie</th>
                  <th className="py-3 px-3">Bénéficiaire / Tiers</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {db.cashTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="py-3 px-3 font-mono font-bold text-slate-600 dark:text-slate-400">
                      {tx.voucherNumber}
                    </td>
                    <td className="py-3 px-3 text-slate-500">{tx.date}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          tx.type === 'RECETTE'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">{tx.category}</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{tx.beneficiaryOrPayer}</td>
                    <td className="py-3 px-3 text-slate-500 truncate max-w-xs">{tx.description}</td>
                    <td
                      className={`py-3 px-3 text-right font-extrabold text-sm ${
                        tx.type === 'RECETTE'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {tx.type === 'RECETTE' ? '+' : '-'}
                      {CalculationService.formatAriary(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fenêtre de rappel (cahier de liaison) */}
      <Modal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        title="Mots de Rappel d'Écolage pour Cahier de Liaison"
        subtitle="Personnalisez le message et imprimez les billets découpables pour les parents"
        maxWidth="4xl"
        actions={
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsReminderModalOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800"
            >
              Fermer
            </button>
            <button
              onClick={() => {
                window.print();
                onShowToast("Impression des billets de rappel d'écolage lancée.", 'success');
              }}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white flex items-center space-x-1.5 shadow"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer les Billets de Rappel</span>
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {/* Customizer */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="font-bold flex items-center space-x-1.5 text-slate-700 dark:text-slate-300">
              <Sliders className="w-4 h-4 text-amber-500" />
              <span>Personnaliser le texte du message de rappel :</span>
            </div>
            <textarea
              rows={3}
              value={customReminderText}
              onChange={(e) => setCustomReminderText(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-sans"
            />
            <div className="text-[10px] text-slate-400">
              Variables disponibles : <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">{'{NOM}'}</code>,{' '}
              <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">{'{CLASSE}'}</code>,{' '}
              <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">{'{MOIS_IMPAYES}'}</code>,{' '}
              <code className="bg-slate-200 dark:bg-slate-800 px-1 rounded">{'{MONTANT}'}</code>
            </div>
          </div>

          {/* Printable preview slips */}
          <div id="printable-area" className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto p-2">
            {studentsInClass
              .filter((s) => !selectedStudentForReminder || s.id === selectedStudentForReminder)
              .map((stu) => {
                const { unpaidMonths, text } = getReminderTextForStudent(stu);
                if (unpaidMonths.length === 0) return null;

                return (
                  <div
                    key={stu.id}
                    className="p-4 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/50 text-slate-900 font-sans space-y-2 shadow-sm relative"
                  >
                    <div className="flex items-center justify-between border-b border-amber-200 pb-1.5">
                      <div className="font-extrabold text-[10px] uppercase text-amber-900">
                        {db.schoolConfig.name}
                      </div>
                      <div className="text-[9px] font-mono font-bold text-amber-800">
                        Rappel d'Écolage
                      </div>
                    </div>

                    <p className="text-[10px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                      {text}
                    </p>

                    <div className="pt-2 border-t border-amber-200 flex items-center justify-between text-[9px] text-slate-500 font-medium">
                      <span>Date : {new Date().toLocaleDateString('fr-FR')}</span>
                      <span className="italic">Le Service Caisse</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </Modal>

      {/* Fenêtre : nouvel encaissement d'écolage */}
      <Modal
        isOpen={isNewPaymentModalOpen}
        onClose={() => setIsNewPaymentModalOpen(false)}
        title="Encaisser un Écolage / Frais de Scolarité"
        subtitle="Délivrance immédiate de la quittance numérotée avec tampon de l'école"
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmitTuition} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1">Sélectionner l'Élève *</label>
            <select
              value={tuitionForm.studentId}
              onChange={(e) => handleStudentSelectInModal(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              {db.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.lastName} {s.firstName} ({s.matricule} - {classMap.get(s.classId)?.name})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Type de Frais</label>
              <select
                value={tuitionForm.feeType}
                onChange={(e) => setTuitionForm({ ...tuitionForm, feeType: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="ECOLAGE_MENSUEL">Écolage Mensuel</option>
                <option value="INSCRIPTION">Droit d'Inscription</option>
                <option value="REINSCRIPTION">Droit de Réinscription</option>
                <option value="EXAMEN_OFFICIEL">Frais Examen (CEPE/BEPC/BAC)</option>
                <option value="UNIFORME_FOURNITURE">Uniforme / Fournitures</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Mois Concerné</label>
              <select
                value={tuitionForm.monthTarget}
                onChange={(e) => setTuitionForm({ ...tuitionForm, monthTarget: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium"
              >
                {schoolMonths.map((m) => (
                  <option key={m} value={`${m} 2025`}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Montant perçu (Ariary) *</label>
              <input
                type="number"
                min="0"
                step="500"
                required
                value={tuitionForm.amount}
                onChange={(e) => setTuitionForm({ ...tuitionForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-extrabold text-blue-600 dark:text-blue-400 text-sm"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Mode de Règlement *</label>
              <select
                value={tuitionForm.paymentMethod}
                onChange={(e) => setTuitionForm({ ...tuitionForm, paymentMethod: e.target.value as PaymentMethod })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="ESPECES">Espèces (Caisse)</option>
                <option value="MVOLA">MVola</option>
                <option value="ORANGE_MONEY">Orange Money</option>
                <option value="AIRTEL_MONEY">Airtel Money</option>
                <option value="VIREMENT">Virement Bancaire (BOA/BNI...)</option>
                <option value="CHEQUE">Chèque</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Payeur (Nom du déposant)</label>
              <input
                type="text"
                value={tuitionForm.payerName}
                onChange={(e) => setTuitionForm({ ...tuitionForm, payerName: e.target.value })}
                placeholder="Ex: M. RAKOTOMALALA Henri"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Réf / N° Transaction</label>
              <input
                type="text"
                value={tuitionForm.referenceNumber}
                onChange={(e) => setTuitionForm({ ...tuitionForm, referenceNumber: e.target.value })}
                placeholder="Ex: MV-948210 / CHQ-8821"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          {/* Résumé clair de l'opération avant validation */}
          {(() => {
            const stu = studentMap.get(tuitionForm.studentId);
            const cls = stu ? classMap.get(stu.classId) : null;
            const netAmount = Math.max(0, Number(tuitionForm.amount) - Number(tuitionForm.discount || 0));
            return (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="font-bold uppercase tracking-wider text-[10px] text-slate-500">Récapitulatif de l'opération</div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Élève</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {stu ? `${stu.lastName} ${stu.firstName}` : '—'} {cls ? `(${cls.name})` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Écolage mensuel de la classe</span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {cls ? CalculationService.formatAriary(cls.monthlyTuitionFee) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-slate-200 dark:border-slate-700 pt-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Montant encaissé</span>
                  <span className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                    {CalculationService.formatAriary(netAmount)}
                  </span>
                </div>
                {cls && Number(tuitionForm.amount) !== cls.monthlyTuitionFee && tuitionForm.feeType === 'ECOLAGE_MENSUEL' && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 m-0">
                    Le montant saisi diffère du tarif de la classe ({CalculationService.formatAriary(cls.monthlyTuitionFee)}). Vérifiez s'il s'agit d'un ajout volontaire.
                  </p>
                )}
              </div>
            );
          })()}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2"
          >
            <Printer className="w-4 h-4" />
            <span>Valider le Règlement & Émettre le Reçu PDF</span>
          </button>
        </form>
      </Modal>

      {/* MODAL 2: NOUVELLE FICHE DE PAIE */}
      <Modal
        isOpen={isNewSalaryModalOpen}
        onClose={() => setIsNewSalaryModalOpen(false)}
        title="Émettre une Fiche de Paie Enseignant"
        subtitle="Calculs automatiques CNaPS 1% et OSTIE 1% selon législation Madagascar"
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmitSalary} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1">Sélectionner l'Enseignant *</label>
            <select
              value={salaryForm.teacherId}
              onChange={(e) => setSalaryForm({ ...salaryForm, teacherId: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              {db.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.lastName} {t.firstName} ({t.contractType} -{' '}
                  {t.contractType === 'TITULAIRE'
                    ? CalculationService.formatAriary(t.baseMonthlySalary)
                    : `${CalculationService.formatAriary(t.hourlyRate)}/h`}
                  )
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Mois de rémunération</label>
              <input
                type="text"
                value={salaryForm.month}
                onChange={(e) => setSalaryForm({ ...salaryForm, month: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Heures effectuées (si Vacataire)</label>
              <input
                type="number"
                min="0"
                value={salaryForm.hoursWorked}
                onChange={(e) => setSalaryForm({ ...salaryForm, hoursWorked: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Avances / Acomptes déduits</label>
              <input
                type="number"
                min="0"
                value={salaryForm.advances}
                onChange={(e) => setSalaryForm({ ...salaryForm, advances: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Primes / Indemnités</label>
              <input
                type="number"
                min="0"
                value={salaryForm.bonuses}
                onChange={(e) => setSalaryForm({ ...salaryForm, bonuses: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Mode de Règlement</label>
              <select
                value={salaryForm.paymentMethod}
                onChange={(e) => setSalaryForm({ ...salaryForm, paymentMethod: e.target.value as PaymentMethod })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <option value="VIREMENT">Virement Bancaire (BOA/BNI...)</option>
                <option value="MVOLA">MVola</option>
                <option value="ORANGE_MONEY">Orange Money</option>
                <option value="ESPECES">Espèces (Caisse)</option>
                <option value="CHEQUE">Chèque</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Réf Virement / Transaction</label>
              <input
                type="text"
                value={salaryForm.referenceNumber}
                onChange={(e) => setSalaryForm({ ...salaryForm, referenceNumber: e.target.value })}
                placeholder="Ex: VIR-SAL-00441"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-lg shadow-purple-600/30 transition flex items-center justify-center space-x-2"
          >
            <Printer className="w-4 h-4" />
            <span>Valider la Paie & Télécharger le Bulletin de Salaire</span>
          </button>
        </form>
      </Modal>

      {/* MODAL 3: ÉCRITURE COMPTABLE */}
      <Modal
        isOpen={isNewExpenseModalOpen}
        onClose={() => setIsNewExpenseModalOpen(false)}
        title="Nouvelle Écriture de Caisse"
        subtitle="Enregistrement d'une dépense d'exploitation ou d'une recette diverse"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitTransaction} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Type d'opération</label>
              <select
                value={txForm.type}
                onChange={(e) => setTxForm({ ...txForm, type: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                <option value="DEPENSE">DÉPENSE (Sortie)</option>
                <option value="RECETTE">RECETTE (Entrée)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Montant en Ariary *</label>
              <input
                type="number"
                min="0"
                required
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-extrabold text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Catégorie Comptable</label>
            <select
              value={txForm.category}
              onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <option value="Fournitures scolaires & Pédagogie">Fournitures scolaires & Pédagogie</option>
              <option value="Électricité & Eau JIRAMA">Électricité & Eau JIRAMA</option>
              <option value="Internet & Télécommunications">Internet & Télécommunications</option>
              <option value="Loyer des locaux">Loyer des locaux</option>
              <option value="Travaux, Entretien & Maintenance">Travaux, Entretien & Maintenance</option>
              <option value="Diverses dépenses imprévues">Diverses dépenses imprévues</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Bénéficiaire / Tiers</label>
            <input
              type="text"
              required
              value={txForm.beneficiaryOrPayer}
              onChange={(e) => setTxForm({ ...txForm, beneficiaryOrPayer: e.target.value })}
              placeholder="Ex: Fournisseur Papeterie / JIRAMA"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">Description / Motif</label>
            <textarea
              rows={2}
              value={txForm.description}
              onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
              placeholder="Détail de la pièce justificative..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition"
          >
            Enregistrer dans le Grand Livre
          </button>
        </form>
      </Modal>
    </div>
  );
};
