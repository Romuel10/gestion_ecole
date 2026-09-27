import {
  AttendanceRecord,
  CashTransaction,
  DatabaseSchema,
  GradeEntry,
  PaymentMethod,
  SchoolClass,
  SchoolYear,
  Student,
  TimetableSlot,
  TuitionPayment,
} from '../types/school';

const ARCHIVE_YEAR_ID = 'sy-2024-2025';
const CURRENT_YEAR_ID = 'sy-2026-2027';

const LOGO_DATA_URL = 'data:image/png;base64,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';

const LAST_NAMES = [
  'RAKOTOARISOA','RAZAFINDRAKOTO','ANDRIAMBOLOLONA','RAMANANTSOA','RAKOTOMALALA',
  'RASOLOFONIAINA','RANDRIANARISOA','RAKOTONDRABE','RATSIMBAZAFY','RAZAFIMAHATRATRA',
  'ANDRIANARIVELO','RAVELONANOSY','RAHARISON','RAZANADRANTO','RABEMANANJARA',
  'RANAIVOSON','RAKOTOBE','RAZAFINDRAMBOA','ANDRIANTSOA','RAMAROSON',
  'RAVOAVY','RAZAFINDRABE','RABEARISON','RANDRIAMANANTENA','RAJAONARISON',
  'RAKOTOZAFY','RASOAMANANA','ANDRIAMASINORO','RAZAKANDRAINY','RAKOTONIAINA',
  'RAHARIMANANA','RAVELOSON','RANAIVOMANANA','RAKOTONDRAZAKA','RAJOELINA',
  'RANDRIANASOLO','ANDRIANTSALAMA','RASOLOMAMPIANINA','RAKOTONDRAIBE','RAKOTOHERY'
];

const FIRST_NAMES_M = [
  'Andry Sitraka','Tahina','Hery','Feno','Tendry','Toky','Mamy','Iantsa','Tsiry','Nomena',
  'Mickaël','Faneva','Fitahiana','Tanjona','Loïc','Aina','Mendrika','Zo','Lova','Tiana'
];

const FIRST_NAMES_F = [
  'Miora','Fitiavana','Voahirana','Nirina','Harena','Miangaly','Hasina','Fanja','Lalaina','Vola',
  'Onja','Sarobidy','Tahiry','Nantenaina','Sitraka','Soa','Mialy','Koloina','Ariane','Lova'
];

const NEIGHBORHOODS = [
  'Amparibe','Mahamasina','Ankadifotsy','Analakely','Ankorondrano','Andavamamba',
  'Itaosy','Tanjombato','Ambohimanarina','Tsimbazaza','Ivandry','Alasora'
];

const JOBS = [
  'Commerçant','Enseignant','Fonctionnaire','Comptable','Chauffeur','Artisan',
  'Infirmier','Technicien','Entrepreneur','Agriculteur','Employé de bureau','Ingénieur'
];

const PAYMENT_METHODS: PaymentMethod[] = [
  'ESPECES','MVOLA','ORANGE_MONEY','AIRTEL_MONEY','VIREMENT'
];

const MONTHS = [
  'Septembre','Octobre','Novembre','Décembre','Janvier',
  'Février','Mars','Avril','Mai','Juin'
];

const currentYear: SchoolYear = {
  id: CURRENT_YEAR_ID,
  label: '2026 - 2027',
  startDate: '2026-09-01',
  endDate: '2027-06-30',
  isCurrent: true,
  terms: [
    { id: 'term-2026-t1', code: 'TRIMESTRE_1', label: '1er Trimestre', startDate: '2026-09-01', endDate: '2026-12-18', weight: 1, isLocked: false },
    { id: 'term-2026-t2', code: 'TRIMESTRE_2', label: '2ème Trimestre', startDate: '2027-01-04', endDate: '2027-03-26', weight: 1, isLocked: false },
    { id: 'term-2026-t3', code: 'TRIMESTRE_3', label: '3ème Trimestre', startDate: '2027-04-12', endDate: '2027-06-25', weight: 1, isLocked: false },
  ],
};

const archiveYear: SchoolYear = {
  id: ARCHIVE_YEAR_ID,
  label: '2024 - 2025',
  startDate: '2024-09-02',
  endDate: '2025-06-27',
  isCurrent: false,
  terms: [
    { id: 'term-2024-t1', code: 'TRIMESTRE_1', label: '1er Trimestre', startDate: '2024-09-02', endDate: '2024-12-20', weight: 1, isLocked: true },
    { id: 'term-2024-t2', code: 'TRIMESTRE_2', label: '2ème Trimestre', startDate: '2025-01-06', endDate: '2025-03-28', weight: 1, isLocked: true },
    { id: 'term-2024-t3', code: 'TRIMESTRE_3', label: '3ème Trimestre', startDate: '2025-04-14', endDate: '2025-06-27', weight: 1, isLocked: true },
  ],
};

const clamp = (value: number, min = 0, max = 20) =>
  Math.min(max, Math.max(min, value));

const round1 = (value: number) => Math.round(value * 10) / 10;

const pseudo = (key: string) => {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
};

const classAges: Record<string, number> = {
  'cls-7eme-a': 10,
  'cls-6eme-a': 11,
  'cls-5eme-a': 12,
  'cls-4eme-a': 13,
  'cls-3eme-a': 14,
  'cls-2nde-a': 15,
  'cls-1ere-s': 16,
  'cls-1ere-ose': 16,
  'cls-tle-s1': 17,
  'cls-tle-l': 17,
};

const makeExtraClasses = (base: DatabaseSchema): SchoolClass[] => {
  const classMap = new Map(base.classes.map((item) => [item.id, item]));
  const lowerTemplate = classMap.get('cls-3eme-a')!;
  const scienceTemplate = classMap.get('cls-1ere-s')!;

  const clone = (
    id: string,
    code: string,
    name: string,
    room: string,
    source: SchoolClass,
    fee: number,
    mainTeacherId: string
  ): SchoolClass => ({
    ...source,
    id,
    code,
    name,
    room,
    capacity: 35,
    mainTeacherId,
    monthlyTuitionFee: fee,
    registrationFee: Math.round(fee * 1.2),
    reRegistrationFee: Math.round(fee * 0.9),
    subjects: source.subjects.map((subject) => ({ ...subject })),
    nextClassId: undefined,
  });

  return [
    clone('cls-6eme-a', '6EME_A', '6ème A', 'Salle C01 - Collège', lowerTemplate, 55000, 'tea-04'),
    clone('cls-5eme-a', '5EME_A', '5ème A', 'Salle C02 - Collège', lowerTemplate, 58000, 'tea-02'),
    clone('cls-4eme-a', '4EME_A', '4ème A', 'Salle C03 - Collège', lowerTemplate, 62000, 'tea-05'),
    clone('cls-2nde-a', '2NDE_A', 'Seconde A', 'Salle L01 - Lycée', scienceTemplate, 78000, 'tea-03'),
  ];
};

const buildClasses = (base: DatabaseSchema): SchoolClass[] => {
  const classes = [...base.classes.map((item) => ({ ...item, subjects: item.subjects.map((subject) => ({ ...subject })) })), ...makeExtraClasses(base)];
  const nextMap: Record<string, string | undefined> = {
    'cls-7eme-a': 'cls-6eme-a',
    'cls-6eme-a': 'cls-5eme-a',
    'cls-5eme-a': 'cls-4eme-a',
    'cls-4eme-a': 'cls-3eme-a',
    'cls-3eme-a': 'cls-2nde-a',
    'cls-2nde-a': 'cls-1ere-s',
    'cls-1ere-s': 'cls-tle-s1',
    'cls-1ere-ose': 'cls-tle-l',
    'cls-tle-s1': undefined,
    'cls-tle-l': undefined,
  };
  return classes.map((item) => ({ ...item, nextClassId: nextMap[item.id] }));
};

const studentClassOrder = [
  'cls-7eme-a',
  'cls-6eme-a',
  'cls-5eme-a',
  'cls-4eme-a',
  'cls-3eme-a',
  'cls-2nde-a',
  'cls-1ere-s',
  'cls-1ere-ose',
  'cls-tle-s1',
  'cls-tle-l',
];

const makeIdentity = (
  identityIndex: number,
  classId: string,
  startYear: number,
  matricule: string,
  yearId: string,
  status: Student['status'],
  enrollmentDate: string
): Student => {
  const gender: Student['gender'] = identityIndex % 2 === 0 ? 'M' : 'F';
  const lastName = LAST_NAMES[identityIndex % LAST_NAMES.length];
  const firstNames = gender === 'M' ? FIRST_NAMES_M : FIRST_NAMES_F;
  const firstName = firstNames[(identityIndex * 7 + 3) % firstNames.length];
  const age = classAges[classId] || 14;
  const birthYear = startYear - age;
  const month = ((identityIndex * 5) % 12) + 1;
  const day = ((identityIndex * 11) % 26) + 1;
  const neighborhood = NEIGHBORHOODS[(identityIndex * 3) % NEIGHBORHOODS.length];
  const phoneSuffix = String(1000000 + ((identityIndex * 7919) % 8999999)).padStart(7, '0');
  const fatherLast = LAST_NAMES[(identityIndex + 9) % LAST_NAMES.length];
  const motherLast = LAST_NAMES[(identityIndex + 17) % LAST_NAMES.length];

  return {
    id: `stu-${yearId}-${String(identityIndex + 1).padStart(3, '0')}`,
    matricule,
    lastName,
    firstName,
    gender,
    birthDate: `${birthYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    birthPlace: identityIndex % 4 === 0 ? 'Antsirabe' : identityIndex % 5 === 0 ? 'Toamasina' : 'Antananarivo',
    nationality: 'Malgache',
    address: `Lot ${(identityIndex % 8) + 1} ${String.fromCharCode(65 + (identityIndex % 18))} ${20 + (identityIndex % 70)}, ${neighborhood}`,
    neighborhood,
    city: 'Antananarivo',
    classId,
    schoolYearId: yearId,
    status,
    enrollmentDate,
    fatherName: `${fatherLast} ${['Hery','Jean','Michel','Andry','Solofo'][identityIndex % 5]}`,
    fatherPhone: `+261 34 ${phoneSuffix.slice(0, 2)} ${phoneSuffix.slice(2, 5)} ${phoneSuffix.slice(5)}`,
    fatherJob: JOBS[identityIndex % JOBS.length],
    motherName: `${motherLast} ${['Fanja','Nirina','Lalao','Hanta','Soa'][identityIndex % 5]}`,
    motherPhone: `+261 33 ${phoneSuffix.slice(0, 2)} ${phoneSuffix.slice(2, 5)} ${phoneSuffix.slice(5)}`,
    motherJob: JOBS[(identityIndex + 4) % JOBS.length],
    emergencyContact: `${motherLast} ${['Fanja','Nirina','Lalao','Hanta','Soa'][identityIndex % 5]}`,
    emergencyPhone: `+261 33 ${phoneSuffix.slice(0, 2)} ${phoneSuffix.slice(2, 5)} ${phoneSuffix.slice(5)}`,
    bloodType: ['O+','A+','B+','AB+'][identityIndex % 4],
    medicalNotes: identityIndex % 17 === 0 ? 'Asthme léger — inhalateur au besoin' : identityIndex % 23 === 0 ? 'Allergie aux arachides signalée' : 'R.A.S',
    previousSchool: identityIndex % 3 === 0 ? 'Établissement privé Antananarivo' : 'LPSM',
  };
};

type ArchiveOutcome = 'PROMOTE' | 'REPEAT' | 'DISMISS';

const archiveOutcomeFor = (classId: string, position: number): ArchiveOutcome => {
  if (classId === 'cls-tle-s1' || classId === 'cls-tle-l') {
    return position < 9 ? 'PROMOTE' : 'DISMISS';
  }
  if (position <= 6) return 'PROMOTE';
  if (position <= 8) return 'REPEAT';
  return 'DISMISS';
};

const baseAverageFor = (outcome: ArchiveOutcome, key: string) => {
  const r = pseudo(key);
  if (outcome === 'PROMOTE') return 10.6 + r * 6.8;
  if (outcome === 'REPEAT') return 7.3 + r * 2.3;
  return 4.3 + r * 2.4;
};

const subjectAverage = (evaluations: number[], examGrade?: number) => {
  const cc = evaluations.length
    ? evaluations.reduce((sum, value) => sum + value, 0) / evaluations.length
    : 0;
  return examGrade === undefined ? round1(cc) : round1((cc + examGrade * 2) / 3);
};

const makeArchiveGrades = (
  students: Student[],
  classes: SchoolClass[],
  outcomes: Map<string, ArchiveOutcome>
): GradeEntry[] => {
  const classMap = new Map(classes.map((item) => [item.id, item]));
  const grades: GradeEntry[] = [];

  students.forEach((student) => {
    const schoolClass = classMap.get(student.classId);
    if (!schoolClass) return;
    const outcome = outcomes.get(student.id) || 'PROMOTE';
    const base = baseAverageFor(outcome, student.id);

    archiveYear.terms.forEach((term, termIndex) => {
      schoolClass.subjects.forEach((subjectConfig, subjectIndex) => {
        const variation = (pseudo(`${student.id}-${term.code}-${subjectConfig.subjectId}`) - 0.5) * 3;
        const termShift = [-0.35, 0.05, 0.35][termIndex] || 0;
        const center = clamp(base + variation + termShift);
        const evaluations = [
          round1(clamp(center - 0.6 + pseudo(`${student.id}-e1-${subjectIndex}`))),
          round1(clamp(center + 0.4 - pseudo(`${student.id}-e2-${subjectIndex}`))),
        ];
        const examGrade = round1(clamp(center + (pseudo(`${student.id}-exam-${termIndex}-${subjectIndex}`) - 0.5) * 1.8));
        grades.push({
          id: `grd-2024-${student.id}-${term.code}-${subjectConfig.subjectId}`,
          studentId: student.id,
          classId: student.classId,
          subjectId: subjectConfig.subjectId,
          termCode: term.code,
          schoolYearId: ARCHIVE_YEAR_ID,
          evaluations,
          examGrade,
          subjectAverage: subjectAverage(evaluations, examGrade),
          teacherComment:
            outcome === 'PROMOTE'
              ? 'Travail régulier et acquis satisfaisants.'
              : outcome === 'REPEAT'
              ? 'Résultats fragiles. Les bases doivent être consolidées.'
              : 'Difficultés importantes malgré les accompagnements proposés.',
          updatedAt: term.endDate,
        });
      });
    });
  });

  return grades;
};

const makeCurrentGrades = (
  students: Student[],
  classes: SchoolClass[]
): GradeEntry[] => {
  const classMap = new Map(classes.map((item) => [item.id, item]));
  const grades: GradeEntry[] = [];

  students.forEach((student, studentIndex) => {
    const schoolClass = classMap.get(student.classId);
    if (!schoolClass) return;
    const base = 8.5 + pseudo(`${student.id}-current-base`) * 8.3;

    schoolClass.subjects.forEach((subjectConfig, subjectIndex) => {
      const center = clamp(
        base +
          (pseudo(`${student.id}-current-${subjectConfig.subjectId}`) - 0.5) * 3
      );
      const evaluations = [
        round1(clamp(center - 0.5 + pseudo(`${student.id}-c1-${subjectIndex}`))),
        round1(clamp(center + 0.3 - pseudo(`${student.id}-c2-${subjectIndex}`))),
      ];
      grades.push({
        id: `grd-2026-${student.id}-TRIMESTRE_1-${subjectConfig.subjectId}`,
        studentId: student.id,
        classId: student.classId,
        subjectId: subjectConfig.subjectId,
        termCode: 'TRIMESTRE_1',
        schoolYearId: CURRENT_YEAR_ID,
        evaluations,
        subjectAverage: subjectAverage(evaluations),
        teacherComment:
          studentIndex % 9 === 0
            ? 'Participation à renforcer, résultats encore irréguliers.'
            : 'Début d’année satisfaisant. Poursuivre les efforts.',
        updatedAt: '2026-09-25',
      });
    });
  });

  return grades;
};

const makePayments = (
  students: Student[],
  classes: SchoolClass[],
  yearId: string,
  yearLabel: string,
  archive = false
): { payments: TuitionPayment[]; cash: CashTransaction[] } => {
  const classMap = new Map(classes.map((item) => [item.id, item]));
  const payments: TuitionPayment[] = [];
  const cash: CashTransaction[] = [];
  let receiptCounter = archive ? 1 : 2001;

  const addPayment = (
    student: Student,
    feeType: TuitionPayment['feeType'],
    amountDue: number,
    monthTarget: string,
    date: string,
    paymentMethod: PaymentMethod,
    discount = 0
  ) => {
    const receiptNumber = `REC-${yearLabel.slice(0, 4)}-${String(receiptCounter).padStart(5, '0')}`;
    const id = `pay-${yearId}-${String(receiptCounter).padStart(5, '0')}`;
    const amount = Math.max(0, amountDue - discount);
    payments.push({
      id,
      receiptNumber,
      studentId: student.id,
      classId: student.classId,
      schoolYearId: yearId,
      feeType,
      monthTarget,
      amount,
      discount,
      totalDue: amountDue,
      paymentDate: date,
      paymentMethod,
      referenceNumber: paymentMethod === 'ESPECES' ? undefined : `SIM-${receiptCounter}-${paymentMethod}`,
      payerName: student.motherName || student.fatherName || 'Parent / Tuteur',
      cashierName: 'Service Caisse LPSM',
      notes: 'Donnée de simulation',
    });
    cash.push({
      id: `cash-${id}`,
      voucherNumber: `TR-${receiptNumber}`,
      type: 'RECETTE',
      category: feeType === 'ECOLAGE_MENSUEL' ? 'Écolages' : 'Inscriptions & Droits',
      amount,
      date,
      paymentMethod,
      beneficiaryOrPayer: student.motherName || student.fatherName || 'Parent / Tuteur',
      description: `${feeType === 'ECOLAGE_MENSUEL' ? 'Écolage' : 'Droit annuel'} - ${student.lastName} ${student.firstName} - ${monthTarget}`,
      relatedReceiptId: id,
      schoolYearId: yearId,
    });
    receiptCounter += 1;
  };

  students.forEach((student, index) => {
    const schoolClass = classMap.get(student.classId);
    if (!schoolClass) return;
    const method = PAYMENT_METHODS[index % PAYMENT_METHODS.length];
    const annualFee =
      student.status === 'REINSCRIT'
        ? schoolClass.reRegistrationFee
        : schoolClass.registrationFee;
    addPayment(
      student,
      student.status === 'REINSCRIT' ? 'REINSCRIPTION' : 'INSCRIPTION',
      annualFee,
      `Droit annuel ${yearLabel.replace(' - ', '-')}`,
      archive ? '2024-08-26' : '2026-08-24',
      method,
      index % 19 === 0 ? 10000 : 0
    );

    const monthsToPay = archive ? MONTHS.length : index % 7 === 0 ? 0 : 1;
    MONTHS.slice(0, monthsToPay).forEach((month, monthIndex) => {
      const calendarYear =
        monthIndex <= 3
          ? Number(yearLabel.slice(0, 4))
          : Number(yearLabel.slice(-4));
      const monthNumber = [9,10,11,12,1,2,3,4,5,6][monthIndex];
      const day = 2 + (index % 7);
      const paymentDate = `${calendarYear}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      addPayment(
        student,
        'ECOLAGE_MENSUEL',
        schoolClass.monthlyTuitionFee,
        month,
        paymentDate,
        PAYMENT_METHODS[(index + monthIndex) % PAYMENT_METHODS.length],
        (index + monthIndex) % 31 === 0 ? 5000 : 0
      );
    });
  });

  return { payments, cash };
};

const makeAttendance = (
  students: Student[],
  yearId: string
): AttendanceRecord[] => {
  const archive = yearId === ARCHIVE_YEAR_ID;
  const dates = archive
    ? ['2024-10-08','2025-02-11','2025-05-13']
    : ['2026-09-14','2026-09-22'];
  const records: AttendanceRecord[] = [];

  students.forEach((student, index) => {
    dates.forEach((date, dateIndex) => {
      const selector = (index + dateIndex * 3) % 11;
      if (selector > 3) return;
      const type: AttendanceRecord['type'] =
        selector === 0
          ? 'ABSENT_NON_JUSTIFIE'
          : selector === 1
          ? 'ABSENT_JUSTIFIE'
          : 'RETARD';
      records.push({
        id: `att-${yearId}-${student.id}-${dateIndex}`,
        studentId: student.id,
        classId: student.classId,
        date,
        type,
        minutesLate: type === 'RETARD' ? 10 + (index % 25) : undefined,
        reason:
          type === 'ABSENT_JUSTIFIE'
            ? 'Raison familiale / médicale signalée'
            : type === 'RETARD'
            ? 'Transport / circulation'
            : undefined,
      });
    });
  });

  return records;
};

const makeTimetable = (
  classes: SchoolClass[],
  subjectColors: Map<string, string>
): TimetableSlot[] => {
  const slots = [
    { day: 1 as const, start: '07:30', end: '09:00' },
    { day: 1 as const, start: '09:15', end: '10:45' },
    { day: 1 as const, start: '11:00', end: '12:30' },
    { day: 1 as const, start: '13:30', end: '15:00' },
    { day: 1 as const, start: '15:15', end: '16:45' },
    { day: 2 as const, start: '07:30', end: '09:00' },
    { day: 2 as const, start: '09:15', end: '10:45' },
    { day: 2 as const, start: '11:00', end: '12:30' },
    { day: 2 as const, start: '13:30', end: '15:00' },
    { day: 2 as const, start: '15:15', end: '16:45' },
    { day: 3 as const, start: '07:30', end: '09:00' },
    { day: 3 as const, start: '09:15', end: '10:45' },
    { day: 3 as const, start: '11:00', end: '12:30' },
    { day: 4 as const, start: '07:30', end: '09:00' },
    { day: 4 as const, start: '09:15', end: '10:45' },
    { day: 4 as const, start: '11:00', end: '12:30' },
    { day: 4 as const, start: '13:30', end: '15:00' },
    { day: 4 as const, start: '15:15', end: '16:45' },
    { day: 5 as const, start: '07:30', end: '09:00' },
    { day: 5 as const, start: '09:15', end: '10:45' },
    { day: 5 as const, start: '11:00', end: '12:30' },
    { day: 5 as const, start: '13:30', end: '15:00' },
    { day: 5 as const, start: '15:15', end: '16:45' },
  ];
  const result: TimetableSlot[] = [];
  const teacherBusy = new Set<string>();
  const classBusy = new Set<string>();

  classes.forEach((schoolClass, classIndex) => {
    schoolClass.subjects.forEach((subjectConfig, subjectIndex) => {
      if (!subjectConfig.teacherId) return;
      for (let offset = 0; offset < slots.length; offset += 1) {
        const slot = slots[(classIndex * 3 + subjectIndex + offset) % slots.length];
        const slotKey = `${slot.day}-${slot.start}`;
        const teacherKey = `${subjectConfig.teacherId}-${slotKey}`;
        const classKey = `${schoolClass.id}-${slotKey}`;
        if (teacherBusy.has(teacherKey) || classBusy.has(classKey)) continue;
        teacherBusy.add(teacherKey);
        classBusy.add(classKey);
        result.push({
          id: `tt-sim-${schoolClass.id}-${subjectConfig.subjectId}`,
          dayOfWeek: slot.day,
          startTime: slot.start,
          endTime: slot.end,
          classId: schoolClass.id,
          subjectId: subjectConfig.subjectId,
          teacherId: subjectConfig.teacherId,
          room: schoolClass.room,
          color: subjectColors.get(subjectConfig.subjectId) || '#64748b',
        });
        break;
      }
    });
  });

  return result;
};

export const buildSimulationDatabase = (base: DatabaseSchema): DatabaseSchema => {
  const classes = buildClasses(base);
  const classMap = new Map(classes.map((item) => [item.id, item]));
  const outcomes = new Map<string, ArchiveOutcome>();

  const archiveStudents: Student[] = [];
  let identityIndex = 0;
  studentClassOrder.forEach((classId) => {
    for (let position = 0; position < 10; position += 1) {
      const matricule = `LPSM-2024-${String(identityIndex + 1).padStart(4, '0')}`;
      const student = makeIdentity(
        identityIndex,
        classId,
        2024,
        matricule,
        ARCHIVE_YEAR_ID,
        identityIndex % 4 === 0 ? 'REINSCRIT' : 'INSCRIT',
        `2024-08-${String(19 + (identityIndex % 10)).padStart(2, '0')}`
      );
      const outcome = archiveOutcomeFor(classId, position);
      const destinationId =
        outcome === 'PROMOTE'
          ? classMap.get(classId)?.nextClassId
          : outcome === 'REPEAT'
          ? classId
          : undefined;
      student.councilDecision =
        outcome === 'PROMOTE'
          ? destinationId
            ? `Admis — ${classMap.get(destinationId)?.name || 'classe supérieure'}`
            : 'Admis — fin de cycle'
          : outcome === 'REPEAT'
          ? `Redoublant — ${classMap.get(classId)?.name || ''}`
          : 'Remis à la famille';
      archiveStudents.push(student);
      outcomes.set(student.id, outcome);
      identityIndex += 1;
    }
  });

  const continuing = archiveStudents
    .map((student) => {
      const outcome = outcomes.get(student.id)!;
      const destinationId =
        outcome === 'PROMOTE'
          ? classMap.get(student.classId)?.nextClassId
          : outcome === 'REPEAT'
          ? student.classId
          : undefined;
      return { student, destinationId };
    })
    .filter((item): item is { student: Student; destinationId: string } => Boolean(item.destinationId));

  const currentStudents: Student[] = continuing.map(({ student, destinationId }, index) => ({
    ...student,
    id: `stu-${CURRENT_YEAR_ID}-returning-${String(index + 1).padStart(3, '0')}`,
    classId: destinationId,
    schoolYearId: CURRENT_YEAR_ID,
    status: 'REINSCRIT',
    enrollmentDate: `2026-08-${String(18 + (index % 11)).padStart(2, '0')}`,
    councilDecision: undefined,
    previousSchool: 'LPSM — année 2024-2025 archivée',
  }));

  const newStudentCount = 100 - currentStudents.length;
  for (let i = 0; i < newStudentCount; i += 1) {
    const classId = studentClassOrder[i % studentClassOrder.length];
    const newIdentityIndex = 100 + i;
    currentStudents.push(
      makeIdentity(
        newIdentityIndex,
        classId,
        2026,
        `LPSM-2026-${String(101 + i).padStart(4, '0')}`,
        CURRENT_YEAR_ID,
        'INSCRIT',
        `2026-08-${String(20 + (i % 9)).padStart(2, '0')}`
      )
    );
  }

  const archiveGrades = makeArchiveGrades(archiveStudents, classes, outcomes);
  const currentGrades = makeCurrentGrades(currentStudents, classes);

  const archiveFinance = makePayments(
    archiveStudents,
    classes,
    ARCHIVE_YEAR_ID,
    archiveYear.label,
    true
  );
  const currentFinance = makePayments(
    currentStudents,
    classes,
    CURRENT_YEAR_ID,
    currentYear.label,
    false
  );

  const salaryPayments = base.teachers.map((teacher, index) => {
    const grossSalary =
      teacher.contractType === 'VACATAIRE'
        ? teacher.hourlyRate * 36
        : teacher.baseMonthlySalary;
    const bonuses = index % 3 === 0 ? 50000 : 0;
    const cnapsDeduction = Math.round(grossSalary * 0.01);
    const ostieDeduction = Math.round(grossSalary * 0.01);
    const netSalary = grossSalary + bonuses - cnapsDeduction - ostieDeduction;
    return {
      id: `sal-sim-2026-${teacher.id}`,
      voucherNumber: `SAL-2026-09-${String(index + 1).padStart(3, '0')}`,
      teacherId: teacher.id,
      schoolYearId: CURRENT_YEAR_ID,
      month: 'Septembre 2026',
      paymentDate: '2026-09-25',
      contractType: teacher.contractType,
      baseSalaryOrRate:
        teacher.contractType === 'VACATAIRE'
          ? teacher.hourlyRate
          : teacher.baseMonthlySalary,
      hoursWorked: teacher.contractType === 'VACATAIRE' ? 36 : 0,
      grossSalary,
      advances: 0,
      bonuses,
      cnapsDeduction,
      ostieDeduction,
      otherDeductions: 0,
      netSalary,
      paymentMethod: 'VIREMENT' as PaymentMethod,
      referenceNumber: `SIM-SAL-${index + 1}`,
      notes: 'Salaire de simulation — septembre 2026',
    };
  });

  const salaryCash: CashTransaction[] = salaryPayments.map((salary) => ({
    id: `cash-${salary.id}`,
    voucherNumber: `TR-${salary.voucherNumber}`,
    type: 'DEPENSE',
    category: 'Salaires & Vacations',
    amount: salary.netSalary,
    date: salary.paymentDate,
    paymentMethod: salary.paymentMethod,
    beneficiaryOrPayer:
      base.teachers.find((teacher) => teacher.id === salary.teacherId)?.lastName ||
      'Enseignant',
    description: `Salaire ${salary.month}`,
    schoolYearId: CURRENT_YEAR_ID,
  }));

  const operatingExpenses: CashTransaction[] = [
    { id: 'cash-sim-exp-1', voucherNumber: 'TR-DEP-2026-001', type: 'DEPENSE', category: 'Fournitures scolaires & Pédagogie', amount: 680000, date: '2026-09-05', paymentMethod: 'ESPECES', beneficiaryOrPayer: 'Papeterie Centrale', description: 'Rentrée : cahiers de textes, papier et consommables', schoolYearId: CURRENT_YEAR_ID },
    { id: 'cash-sim-exp-2', voucherNumber: 'TR-DEP-2026-002', type: 'DEPENSE', category: 'Électricité & Eau JIRAMA', amount: 395000, date: '2026-09-17', paymentMethod: 'MVOLA', beneficiaryOrPayer: 'JIRAMA', description: 'Facture eau et électricité', schoolYearId: CURRENT_YEAR_ID },
    { id: 'cash-sim-exp-3', voucherNumber: 'TR-DEP-2026-003', type: 'DEPENSE', category: 'Internet & Télécommunications', amount: 175000, date: '2026-09-20', paymentMethod: 'VIREMENT', beneficiaryOrPayer: 'Opérateur Internet', description: 'Connexion administration et salle informatique', schoolYearId: CURRENT_YEAR_ID },
  ];

  const subjectColors = new Map(base.subjects.map((subject) => [subject.id, subject.color]));
  const timetableSlots = makeTimetable(classes, subjectColors);

  const teacherAssignments = new Map<string, Set<string>>();
  classes.forEach((schoolClass) => {
    schoolClass.subjects.forEach((subject) => {
      if (!subject.teacherId) return;
      if (!teacherAssignments.has(subject.teacherId)) {
        teacherAssignments.set(subject.teacherId, new Set());
      }
      teacherAssignments.get(subject.teacherId)!.add(schoolClass.id);
    });
  });

  return {
    ...base,
    version: '3.0.0',
    lastUpdated: new Date().toISOString(),
    currentSchoolYearId: CURRENT_YEAR_ID,
    currentTermCode: 'TRIMESTRE_1',
    schoolConfig: {
      ...base.schoolConfig,
      logoUrl: LOGO_DATA_URL,
      documentLogoPosition: 'LEFT',
      documentLogoWidthMm: 18,
      badgeThemeColor: '#1f4f7a',
    },
    matriculeConfig: {
      ...base.matriculeConfig,
      pattern: 'LPSM-{YYYY}-{NUM4}',
      currentCounter: 129,
      resetEveryYear: false,
    },
    schoolYears: [currentYear, archiveYear],
    classes,
    teachers: base.teachers.map((teacher) => ({
      ...teacher,
      assignedClassIds: Array.from(teacherAssignments.get(teacher.id) || []),
    })),
    students: [...currentStudents, ...archiveStudents],
    grades: [...currentGrades, ...archiveGrades],
    tuitionPayments: [...currentFinance.payments, ...archiveFinance.payments],
    salaryPayments,
    cashDayClosures: [],
    cashTransactions: [
      ...currentFinance.cash,
      ...archiveFinance.cash,
      ...salaryCash,
      ...operatingExpenses,
    ],
    timetableSlots,
    attendanceRecords: [
      ...makeAttendance(currentStudents, CURRENT_YEAR_ID),
      ...makeAttendance(archiveStudents, ARCHIVE_YEAR_ID),
    ],
  };
};
