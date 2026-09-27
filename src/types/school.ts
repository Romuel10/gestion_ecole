export type SchoolLevel = 'primaire' | 'college' | 'lycee';

export type PaymentMethod = 'ESPECES' | 'MVOLA' | 'ORANGE_MONEY' | 'AIRTEL_MONEY' | 'VIREMENT' | 'CHEQUE';

export type StudentStatus = 'INSCRIT' | 'REINSCRIT' | 'EN_ATTENTE' | 'TRANSFERE' | 'ABANDON';

export type TeacherContract = 'TITULAIRE' | 'VACATAIRE' | 'FRAM' | 'STAGIAIRE';

export type AnnualDecisionOutcome = 'PROMOTE' | 'REPEAT' | 'DISMISS' | 'REVIEW';

export interface AnnualDecisionRule {
  id: string;
  label: string;
  outcome: AnnualDecisionOutcome;
  minAverage: number;
  maxAverage: number;
  maxUnjustifiedAbsences?: number;
  minConductGrade?: number;
}

// Les périodes académiques sont administrables depuis les paramètres.
export type TermType = string;

export interface SchoolConfig {
  id: string;
  name: string;
  acronym: string;
  motto: string;
  menCode?: string; // N° d'immatriculation / Décision d'ouverture
  cisco?: string; // CISCO
  dren?: string; // DREN
  zap?: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  directorName: string;
  directorTitle: string; // Proviseur, Directeur, Chef d'Établissement
  currency: string; // Ariary (Ar)
  logoUrl?: string;
  stampUrl?: string;
  
  // Customization settings
  passingGrade: number; // e.g. 10.00
  schoolMonths: string[]; // ['Septembre', 'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin']
  reminderTemplate: string; // Template for overdue tuition letter
  badgeThemeColor: string; // Color for student ID cards

  // Annual decisions / promotion
  annualDecisionRules?: AnnualDecisionRule[];
  requireAllPeriodsForAnnualDecision?: boolean;
}

export interface MatriculeConfig {
  pattern: string; // e.g., "LPSM-{YYYY}-{NUM4}"
  prefix: string; // "LPSM", "EPP", "COL"
  numDigits: number; // 3, 4, 5
  autoIncrement: boolean;
  currentCounter: number;
  resetEveryYear: boolean;
  includeYear: boolean;
  yearFormat: 'YYYY' | 'YY';
  separator: string;
}

export interface SchoolYear {
  id: string;
  label: string; // "2025-2026"
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  terms: {
    id: string;
    code: TermType;
    label: string; // "1er Trimestre"
    startDate: string;
    endDate: string;
    weight: number;
    isLocked: boolean;
  }[];
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  category: 'LITTERAIRE' | 'SCIENTIFIQUE' | 'HUMAINE' | 'SPORT_DIVERS';
  color: string;
  defaultCoeff: number;
}

export interface ClassSubjectConfig {
  subjectId: string;
  coefficient: number;
  teacherId?: string;
  weeklyHours?: number;
}

export interface SchoolClass {
  id: string;
  code: string;
  name: string;
  level: SchoolLevel;
  serie?: string;
  room: string;
  capacity: number;
  mainTeacherId?: string;
  subjects: ClassSubjectConfig[];
  monthlyTuitionFee: number;
  registrationFee: number;
  reRegistrationFee: number;
  nextClassId?: string;
}

export interface Student {
  id: string;
  matricule: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  birthDate: string;
  birthPlace: string;
  nationality: string;
  address: string;
  neighborhood: string;
  city: string;
  classId: string;
  schoolYearId: string;
  status: StudentStatus;
  enrollmentDate: string;
  
  fatherName?: string;
  fatherPhone?: string;
  fatherJob?: string;
  motherName?: string;
  motherPhone?: string;
  motherJob?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianJob?: string;
  emergencyContact: string;
  emergencyPhone: string;
  
  bloodType?: string;
  medicalNotes?: string;
  previousSchool?: string;
  photoUrl?: string;
  councilDecision?: string; // Admis, Redouble, etc.
}

export interface AnnualDecisionResult {
  student: Student;
  annualAverage: number;
  completedPeriods: number;
  totalPeriods: number;
  outcome: AnnualDecisionOutcome;
  label: string;
  destinationClassId?: string;
  destinationClassName?: string;
  reasons: string[];
}

export interface GradeEntry {
  id: string;
  studentId: string;
  classId: string;
  subjectId: string;
  termCode: TermType;
  schoolYearId: string;
  evaluations: number[];
  examGrade?: number;
  subjectAverage: number;
  teacherComment?: string;
  updatedAt: string;
}

export interface ReportCardSummary {
  studentId: string;
  student: Student;
  schoolClass: SchoolClass;
  termCode: TermType;
  schoolYearId: string;
  subjectDetails: {
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    coefficient: number;
    evaluations: number[];
    examGrade?: number;
    average: number;
    weightedPoints: number;
    teacherName?: string;
    teacherComment?: string;
    rankInSubject: number;
    classMax: number;
    classMin: number;
    classAvg: number;
  }[];
  totalPoints: number;
  totalCoefficients: number;
  generalAverage: number;
  rank: number;
  classSize: number;
  classGeneralAverage: number;
  classMaxAverage: number;
  classMinAverage: number;
  honorMention: string;
  absencesJustified: number;
  absencesUnjustified: number;
  latenessCount: number;
  conductGrade: number;
  councilDecision?: string;
}

export interface Teacher {
  id: string;
  matricule: string;
  lastName: string;
  firstName: string;
  gender: 'M' | 'F';
  phone: string;
  email: string;
  address: string;
  contractType: TeacherContract;
  qualification: string;
  specialtySubjectIds: string[];
  assignedClassIds: string[];
  baseMonthlySalary: number;
  hourlyRate: number;
  weeklyAssignedHours: number;
  hireDate: string;
  cinNumber: string;
  cinDateAndPlace?: string;
  bankAccountInfo?: string;
}

export interface TuitionPayment {
  id: string;
  receiptNumber: string;
  studentId: string;
  classId: string;
  schoolYearId: string;
  feeType: 'INSCRIPTION' | 'REINSCRIPTION' | 'ECOLAGE_MENSUEL' | 'EXAMEN_OFFICIEL' | 'UNIFORME_FOURNITURE' | 'AUTRE';
  monthTarget?: string; // "Septembre", "Octobre", "Novembre 2025", etc.
  amount: number;
  discount: number;
  totalDue: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  payerName: string;
  cashierName: string;
  notes?: string;
}

export interface SalaryPayment {
  id: string;
  voucherNumber: string;
  teacherId: string;
  schoolYearId: string;
  month: string;
  paymentDate: string;
  contractType: TeacherContract;
  baseSalaryOrRate: number;
  hoursWorked: number;
  grossSalary: number;
  advances: number;
  bonuses: number;
  cnapsDeduction: number;
  ostieDeduction: number;
  otherDeductions: number;
  netSalary: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
}

export interface CashTransaction {
  id: string;
  voucherNumber: string;
  type: 'RECETTE' | 'DEPENSE';
  category: string;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod;
  beneficiaryOrPayer: string;
  description: string;
  relatedReceiptId?: string;
  schoolYearId: string;
}

export interface TimetableSlot {
  id: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  room: string;
  color?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  type: 'PRESENT' | 'ABSENT_JUSTIFIE' | 'ABSENT_NON_JUSTIFIE' | 'RETARD';
  minutesLate?: number;
  reason?: string;
}

export interface DatabaseSchema {
  version: string;
  lastUpdated: string;
  schoolConfig: SchoolConfig;
  matriculeConfig: MatriculeConfig;
  schoolYears: SchoolYear[];
  currentSchoolYearId: string;
  currentTermCode: TermType;
  subjects: Subject[];
  classes: SchoolClass[];
  students: Student[];
  teachers: Teacher[];
  grades: GradeEntry[];
  tuitionPayments: TuitionPayment[];
  salaryPayments: SalaryPayment[];
  cashTransactions: CashTransaction[];
  timetableSlots: TimetableSlot[];
  attendanceRecords: AttendanceRecord[];
}
