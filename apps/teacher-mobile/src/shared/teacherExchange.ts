import * as XLSX from 'xlsx';
import type {
  AttendanceRecord,
  DatabaseSchema,
  GradeEntry,
  SchoolYear,
  Teacher,
} from '../../../../src/types/school';

export type ExchangeIssue = { row: number; message: string };
export type ExchangeGrade = {
  studentId: string;
  subjectId: string;
  termCode: string;
  evaluations: number[];
  evaluationWeights?: number[];
  examGrade?: number;
  examCoefficient?: number;
  teacherComment?: string;
  baseFingerprint: string;
};
export type ExchangeAttendance = {
  studentId: string;
  classId: string;
  date: string;
  type: AttendanceRecord['type'];
  minutesLate?: number;
  reason?: string;
  baseFingerprint: string;
};
export type TeacherPackage = {
  school: { id: string; name: string; acronym: string };
  teacher: { id: string; matricule: string; name: string };
  schoolYear: { id: string; label: string; startDate: string; endDate: string };
  terms: SchoolYear['terms'];
  assignments: Array<{
    classId: string;
    classCode: string;
    className: string;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
  }>;
  students: Array<{
    id: string;
    matricule: string;
    lastName: string;
    firstName: string;
    classId: string;
  }>;
  grades: ExchangeGrade[];
  attendance: ExchangeAttendance[];
};
export const MAX_EXCHANGE_BYTES = 20 * 1024 * 1024;
const string = (value: unknown) => String(value ?? '').trim();
export const exchangeKey = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
export const gradeKey = (entry: {
  studentId: string;
  subjectId: string;
  termCode: string;
}) => `${entry.studentId}|${entry.subjectId}|${entry.termCode}`;
export const attendanceKey = (entry: {
  studentId: string;
  classId: string;
  date: string;
}) => `${entry.studentId}|${entry.classId}|${entry.date}`;
export const packageKey = (data: TeacherPackage) =>
  `${data.school.id}|${data.teacher.id}|${data.schoolYear.id}`;

export function civilDate(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return civilDate(
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`,
    );
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed
      ? civilDate(
          `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`,
        )
      : '';
  }
  let raw = string(value).replace(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/,
    (_, d, m, y) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
  );
  raw = raw.replace(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/,
    (_, y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`,
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const date = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === raw
    ? raw
    : '';
}
export const displayCivilDate = (value: string) =>
  value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3-$2-$1');

export function gradeFingerprint(
  entry?:
    | Pick<
        GradeEntry,
        | 'evaluations'
        | 'evaluationWeights'
        | 'examGrade'
        | 'teacherComment'
        | 'cloudExamCoefficient'
      >
    | ExchangeGrade,
): string {
  if (!entry) return 'ABSENT';
  const examCoefficient =
    'cloudExamCoefficient' in entry
      ? entry.cloudExamCoefficient
      : 'examCoefficient' in entry
        ? entry.examCoefficient
        : undefined;
  return JSON.stringify([
    entry.evaluations,
    entry.evaluations.map((_, index) => entry.evaluationWeights?.[index] ?? 1),
    entry.examGrade ?? null,
    examCoefficient ?? 1,
    entry.teacherComment?.trim() || '',
  ]);
}
export function attendanceFingerprint(
  entry?: Pick<AttendanceRecord, 'type' | 'minutesLate' | 'reason'>,
): string {
  return entry
    ? JSON.stringify([
        entry.type,
        entry.type === 'RETARD' ? (entry.minutesLate ?? null) : null,
        entry.type === 'PRESENT' ? '' : entry.reason?.trim() || '',
      ])
    : 'ABSENT';
}
export function teacherAssignments(db: DatabaseSchema, teacher: Teacher) {
  return db.classes.flatMap((cls) =>
    cls.subjects
      .filter(
        (subject) =>
          subject.teacherId === teacher.id ||
          (!subject.teacherId &&
            teacher.assignedClassIds?.includes(cls.id) &&
            teacher.specialtySubjectIds?.includes(subject.subjectId)),
      )
      .flatMap((subject) => {
        const found = db.subjects.find((item) => item.id === subject.subjectId);
        return found
          ? [
              {
                classId: cls.id,
                classCode: cls.code,
                className: cls.name,
                subjectId: found.id,
                subjectCode: found.code,
                subjectName: found.name,
              },
            ]
          : [];
      }),
  );
}
export function makeTeacherPackage(
  db: DatabaseSchema,
  teacher: Teacher,
): TeacherPackage {
  const year = db.schoolYears.find(
    (item) => item.id === db.currentSchoolYearId,
  );
  if (!db.schoolConfig.offlineExchangeId)
    throw new Error(
      'Enregistrez l’identifiant d’échange de l’école avant de créer le fichier.',
    );
  if (!year || year.status === 'CLOSED')
    throw new Error('Choisissez une année scolaire active.');
  const assignments = teacherAssignments(db, teacher);
  if (!assignments.length)
    throw new Error(
      'Affectez d’abord les classes et les matières à cet enseignant dans Paramètres, ou renseignez ses classes et spécialités.',
    );
  const students = db.students
    .filter(
      (student) =>
        student.schoolYearId === year.id &&
        assignments.some((item) => item.classId === student.classId),
    )
    .map(({ id, matricule, lastName, firstName, classId }) => ({
      id,
      matricule,
      lastName,
      firstName,
      classId,
    }));
  const studentIds = new Set(students.map((item) => item.id));
  return {
    school: {
      id: db.schoolConfig.offlineExchangeId,
      name: db.schoolConfig.name,
      acronym: db.schoolConfig.acronym,
    },
    teacher: {
      id: teacher.id,
      matricule: teacher.matricule,
      name: `${teacher.lastName} ${teacher.firstName}`,
    },
    schoolYear: {
      id: year.id,
      label: year.label,
      startDate: year.startDate,
      endDate: year.endDate,
    },
    terms: structuredClone(year.terms),
    assignments,
    students,
    grades: db.grades
      .filter(
        (entry) =>
          entry.schoolYearId === year.id &&
          studentIds.has(entry.studentId) &&
          assignments.some(
            (item) =>
              item.classId === entry.classId &&
              item.subjectId === entry.subjectId,
          ),
      )
      .map((entry) => ({
        studentId: entry.studentId,
        subjectId: entry.subjectId,
        termCode: entry.termCode,
        evaluations: [...entry.evaluations],
        evaluationWeights: entry.evaluationWeights
          ? [...entry.evaluationWeights]
          : undefined,
        examGrade: entry.examGrade,
        examCoefficient: entry.cloudExamCoefficient,
        teacherComment: entry.teacherComment,
        baseFingerprint: gradeFingerprint(entry),
      })),
    attendance: db.attendanceRecords
      .filter(
        (entry) =>
          (!entry.schoolYearId || entry.schoolYearId === year.id) &&
          studentIds.has(entry.studentId) &&
          assignments.some((item) => item.classId === entry.classId),
      )
      .map((entry) => ({
        studentId: entry.studentId,
        classId: entry.classId,
        date: entry.date,
        type: entry.type,
        minutesLate: entry.minutesLate,
        reason: entry.reason,
        baseFingerprint: attendanceFingerprint(entry),
      })),
  };
}

const sheetRows = (
  workbook: XLSX.WorkBook,
  name: string,
): Record<string, unknown>[] => {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  if (sheet['!ref'] && XLSX.utils.decode_range(sheet['!ref']).e.r > 50000)
    throw new Error(`La feuille ${name} contient trop de lignes.`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  });
};
export function readExchangeWorkbook(
  buffer: ArrayBuffer | Uint8Array,
): XLSX.WorkBook {
  if (buffer.byteLength > MAX_EXCHANGE_BYTES)
    throw new Error('Le fichier Excel dépasse la limite de 20 Mo.');
  return XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    sheetRows: 50002,
  });
}
export function exchangeMetadata(
  workbook: XLSX.WorkBook,
): Record<string, string> {
  return Object.fromEntries(
    sheetRows(workbook, 'Configuration').map((row) => [
      string(row.Cle),
      string(row.Valeur),
    ]),
  );
}
function addSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: unknown[][],
  hiddenColumns: number[] = [],
) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = (rows[0] || []).map((header, index) => ({
    wch: Math.min(36, Math.max(16, string(header).length + 2)),
    hidden: hiddenColumns.includes(index),
  }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}
function newExchangeWorkbook(
  data: TeacherPackage,
  type: string,
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  addSheet(workbook, 'Configuration', [
    ['Cle', 'Valeur'],
    ['Type', type],
    ['Version', '1'],
    ['EcoleId', data.school.id],
    ['Ecole', data.school.name],
    ['Sigle', data.school.acronym],
    ['EnseignantId', data.teacher.id],
    ['MatriculeEnseignant', data.teacher.matricule],
    ['Enseignant', data.teacher.name],
    ['AnneeId', data.schoolYear.id],
    ['Annee', data.schoolYear.label],
    ['Debut', data.schoolYear.startDate],
    ['Fin', data.schoolYear.endDate],
    ['Export', new Date().toISOString()],
  ]);
  return workbook;
}
export function teacherPackageWorkbook(data: TeacherPackage): XLSX.WorkBook {
  const workbook = newExchangeWorkbook(data, 'SEKOLY_TEACHER_PACKAGE');
  addSheet(workbook, 'Affectations', [
    ['ClasseId', 'CodeClasse', 'Classe', 'MatiereId', 'CodeMatiere', 'Matiere'],
    ...data.assignments.map((item) => [
      item.classId,
      item.classCode,
      item.className,
      item.subjectId,
      item.subjectCode,
      item.subjectName,
    ]),
  ]);
  addSheet(workbook, 'Eleves', [
    ['EleveId', 'Matricule', 'Nom', 'Prenoms', 'ClasseId'],
    ...data.students.map((item) => [
      item.id,
      item.matricule,
      item.lastName,
      item.firstName,
      item.classId,
    ]),
  ]);
  addSheet(workbook, 'Periodes', [
    ['Id', 'Code', 'Nom', 'Debut', 'Fin', 'Coefficient', 'Verrouille'],
    ...data.terms.map((item) => [
      item.id,
      item.code,
      item.label,
      item.startDate,
      item.endDate,
      item.weight,
      item.isLocked ? 'OUI' : 'NON',
    ]),
  ]);
  addSheet(workbook, 'NotesInitiales', [
    [
      'EleveId',
      'MatiereId',
      'Periode',
      'Controles',
      'Coefficients',
      'Examen',
      'CoefficientExamen',
      'Appreciation',
      'Empreinte',
    ],
    ...data.grades.map((item) => [
      item.studentId,
      item.subjectId,
      item.termCode,
      JSON.stringify(item.evaluations),
      JSON.stringify(item.evaluationWeights || item.evaluations.map(() => 1)),
      item.examGrade ?? '',
      item.examCoefficient ?? 1,
      item.teacherComment || '',
      item.baseFingerprint,
    ]),
  ]);
  addSheet(workbook, 'AppelsInitiaux', [
    ['EleveId', 'ClasseId', 'Date', 'Statut', 'Minutes', 'Motif', 'Empreinte'],
    ...data.attendance.map((item) => [
      item.studentId,
      item.classId,
      item.date,
      item.type,
      item.minutesLate ?? '',
      item.reason || '',
      item.baseFingerprint,
    ]),
  ]);
  addSheet(workbook, 'Instructions', [
    ['SEKOLY — FICHIER DE L’ÉCOLE'],
    [
      'Dans Sekoly Enseignant, choisissez « Utiliser un fichier de l’école », puis ouvrez ce fichier.',
    ],
    [
      'Enregistrez les notes et les appels sur le téléphone ; aucune connexion ni compte cloud n’est nécessaire.',
    ],
    [
      'Exportez les notes ou les appels et transmettez le fichier à la direction (USB, Bluetooth, carte mémoire…).',
    ],
    [
      'La direction importe les Notes dans Notes et bulletins, et les Appels dans Présences.',
    ],
    [
      'Après import, demandez un nouveau fichier de l’école pour actualiser les listes et les notes.',
    ],
    [
      'Ce fichier contient uniquement les classes, élèves et matières de cet enseignant. Conservez-le dans un endroit privé.',
    ],
  ]);
  return workbook;
}
function numeric(value: unknown, maximum = Infinity): number | undefined {
  if (value === '' || value === undefined || value === null) return undefined;
  const parsed = Number(string(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum)
    throw new Error(`Valeur numérique invalide : ${string(value)}.`);
  return parsed;
}
function numberArray(value: unknown, maximum = Infinity): number[] {
  const parsed: unknown = JSON.parse(string(value));
  if (
    !Array.isArray(parsed) ||
    parsed.length > 100 ||
    parsed.some(
      (item) =>
        typeof item !== 'number' ||
        !Number.isFinite(item) ||
        item < 0 ||
        item > maximum,
    )
  )
    throw new Error('Liste de notes ou coefficients invalide.');
  return parsed;
}
const attendanceTypes = [
  'PRESENT',
  'ABSENT_JUSTIFIE',
  'ABSENT_NON_JUSTIFIE',
  'RETARD',
] as const;
export function readTeacherPackage(workbook: XLSX.WorkBook): TeacherPackage {
  const meta = exchangeMetadata(workbook);
  if (meta.Type !== 'SEKOLY_TEACHER_PACKAGE' || meta.Version !== '1')
    throw new Error(
      'Choisissez le fichier de préparation fourni par votre école, et non un fichier de résultats.',
    );
  if (
    !meta.EcoleId ||
    !meta.EnseignantId ||
    !meta.AnneeId ||
    !meta.Debut ||
    !meta.Fin ||
    !civilDate(meta.Debut) ||
    !civilDate(meta.Fin) ||
    meta.Debut > meta.Fin
  )
    throw new Error('Configuration du fichier scolaire invalide.');
  const data: TeacherPackage = {
    school: {
      id: meta.EcoleId,
      name: meta.Ecole || '',
      acronym: meta.Sigle || '',
    },
    teacher: {
      id: meta.EnseignantId,
      matricule: meta.MatriculeEnseignant || '',
      name: meta.Enseignant || '',
    },
    schoolYear: {
      id: meta.AnneeId,
      label: meta.Annee || '',
      startDate: meta.Debut,
      endDate: meta.Fin,
    },
    assignments: sheetRows(workbook, 'Affectations').map((row) => ({
      classId: string(row.ClasseId),
      classCode: string(row.CodeClasse),
      className: string(row.Classe),
      subjectId: string(row.MatiereId),
      subjectCode: string(row.CodeMatiere),
      subjectName: string(row.Matiere),
    })),
    students: sheetRows(workbook, 'Eleves').map((row) => ({
      id: string(row.EleveId),
      matricule: string(row.Matricule),
      lastName: string(row.Nom),
      firstName: string(row.Prenoms),
      classId: string(row.ClasseId),
    })),
    terms: sheetRows(workbook, 'Periodes').map((row) => ({
      id: string(row.Id),
      code: string(row.Code),
      label: string(row.Nom),
      startDate: civilDate(row.Debut),
      endDate: civilDate(row.Fin),
      weight: numeric(row.Coefficient) ?? 1,
      isLocked: string(row.Verrouille) === 'OUI',
    })),
    grades: sheetRows(workbook, 'NotesInitiales').map((row) => ({
      studentId: string(row.EleveId),
      subjectId: string(row.MatiereId),
      termCode: string(row.Periode),
      evaluations: numberArray(row.Controles, 20),
      evaluationWeights: numberArray(row.Coefficients),
      examGrade: numeric(row.Examen, 20),
      examCoefficient: numeric(row.CoefficientExamen) ?? 1,
      teacherComment: string(row.Appreciation),
      baseFingerprint: string(row.Empreinte),
    })),
    attendance: sheetRows(workbook, 'AppelsInitiaux').map((row) => ({
      studentId: string(row.EleveId),
      classId: string(row.ClasseId),
      date: civilDate(row.Date),
      type: string(row.Statut) as AttendanceRecord['type'],
      minutesLate: numeric(row.Minutes),
      reason: string(row.Motif),
      baseFingerprint: string(row.Empreinte),
    })),
  };
  const students = new Map(data.students.map((item) => [item.id, item]));
  if (
    !data.assignments.length ||
    !data.terms.length ||
    data.assignments.some((item) => !item.classId || !item.subjectId) ||
    students.size !== data.students.length ||
    new Set(data.students.map((item) => exchangeKey(item.matricule))).size !==
      data.students.length ||
    data.students.some(
      (item) =>
        !item.id ||
        !item.matricule ||
        !data.assignments.some(
          (assignment) => assignment.classId === item.classId,
        ),
    )
  )
    throw new Error('Les listes de classes ou d’élèves sont invalides.');
  if (
    data.terms.some(
      (item) =>
        !item.code ||
        !item.startDate ||
        !item.endDate ||
        item.startDate > item.endDate ||
        item.startDate < data.schoolYear.startDate ||
        item.endDate > data.schoolYear.endDate ||
        item.weight <= 0,
    ) ||
    new Set(data.terms.map((item) => item.code)).size !== data.terms.length
  )
    throw new Error('Périodes scolaires invalides.');
  if (
    data.grades.some(
      (item) =>
        !students.has(item.studentId) ||
        !data.terms.some((term) => term.code === item.termCode) ||
        !data.assignments.some(
          (assignment) =>
            assignment.classId === students.get(item.studentId)?.classId &&
            assignment.subjectId === item.subjectId,
        ) ||
        !item.baseFingerprint ||
        item.evaluationWeights?.length !== item.evaluations.length ||
        item.evaluationWeights?.some((weight) => weight <= 0),
    )
  )
    throw new Error('Les notes initiales du fichier sont invalides.');
  if (
    data.attendance.some(
      (item) =>
        !students.has(item.studentId) ||
        students.get(item.studentId)?.classId !== item.classId ||
        !item.date ||
        !attendanceTypes.includes(item.type) ||
        item.date < data.schoolYear.startDate ||
        item.date > data.schoolYear.endDate ||
        !item.baseFingerprint ||
        (item.type === 'RETARD' &&
          (!Number.isInteger(item.minutesLate) || (item.minutesLate || 0) < 1)),
    )
  )
    throw new Error('Les appels initiaux du fichier sont invalides.');
  return data;
}

export function teacherResultsWorkbook(
  data: TeacherPackage,
  grades: ExchangeGrade[],
  attendance: ExchangeAttendance[],
): XLSX.WorkBook {
  const workbook = newExchangeWorkbook(data, 'SEKOLY_TEACHER_RESULTS');
  const count = Math.max(2, ...grades.map((item) => item.evaluations.length));
  const controls = Array.from(
    { length: count },
    (_, index) => `Contrôle ${index + 1}`,
  );
  const weights = Array.from(
    { length: count },
    (_, index) => `Coefficient contrôle ${index + 1}`,
  );
  const headers = [
    'Matricule',
    'Élève',
    'Classe',
    'Matière',
    'Période',
    ...controls,
    ...weights,
    'Examen',
    'Coefficient examen',
    'Appréciation',
    'Empreinte initiale',
  ];
  addSheet(
    workbook,
    'Notes',
    [
      headers,
      ...grades.map((item) => {
        const student = data.students.find(
          (found) => found.id === item.studentId,
        );
        const assignment = data.assignments.find(
          (found) =>
            found.classId === student?.classId &&
            found.subjectId === item.subjectId,
        );
        return [
          student?.matricule || '',
          `${student?.lastName || ''} ${student?.firstName || ''}`,
          assignment?.classCode || '',
          assignment?.subjectCode || '',
          item.termCode,
          ...controls.map((_, index) => item.evaluations[index] ?? ''),
          ...weights.map((_, index) =>
            item.evaluations[index] === undefined
              ? ''
              : (item.evaluationWeights?.[index] ?? 1),
          ),
          item.examGrade ?? '',
          item.examCoefficient ?? 1,
          item.teacherComment || '',
          item.baseFingerprint,
        ];
      }),
    ],
    [headers.length - 1],
  );
  addSheet(
    workbook,
    'Appels',
    [
      [
        'Matricule',
        'Élève',
        'Classe',
        'Date',
        'Statut',
        'Minutes retard',
        'Motif',
        'Empreinte initiale',
      ],
      ...attendance.map((item) => {
        const student = data.students.find(
          (found) => found.id === item.studentId,
        );
        return [
          student?.matricule || '',
          `${student?.lastName || ''} ${student?.firstName || ''}`,
          data.assignments.find((found) => found.classId === item.classId)
            ?.classCode || '',
          displayCivilDate(item.date),
          item.type,
          item.type === 'RETARD' ? (item.minutesLate ?? '') : '',
          item.reason || '',
          item.baseFingerprint,
        ];
      }),
    ],
    [7],
  );
  addSheet(workbook, 'Instructions', [
    ['SEKOLY — RÉSULTATS ENSEIGNANT'],
    [
      'Importez la feuille Notes dans Notes et bulletins ; importez la feuille Appels dans Présences.',
    ],
    [
      'Les données restent enregistrées sur le téléphone après export. Un second import du même fichier ne crée pas de doublon.',
    ],
    [
      'Une modification faite entre-temps dans le logiciel est signalée comme conflit. Demandez un nouveau fichier de l’école.',
    ],
    ['Ne modifiez pas la feuille Configuration ni les empreintes initiales.'],
  ]);
  return workbook;
}

export function parseTeacherResults(
  workbook: XLSX.WorkBook,
  db: DatabaseSchema,
  kind: 'grades' | 'attendance',
): {
  grades: GradeEntry[];
  attendance: AttendanceRecord[];
  issues: ExchangeIssue[];
  warnings: ExchangeIssue[];
} {
  const result = {
    grades: [] as GradeEntry[],
    attendance: [] as AttendanceRecord[],
    issues: [] as ExchangeIssue[],
    warnings: [] as ExchangeIssue[],
  };
  const meta = exchangeMetadata(workbook);
  const year = db.schoolYears.find(
    (item) => item.id === db.currentSchoolYearId,
  );
  const teacher = db.teachers.find(
    (item) =>
      item.id === meta.EnseignantId &&
      exchangeKey(item.matricule) ===
        exchangeKey(meta.MatriculeEnseignant || ''),
  );
  const fail = (message: string) => {
    result.issues.push({ row: 1, message });
    return result;
  };
  if (meta.Type !== 'SEKOLY_TEACHER_RESULTS' || meta.Version !== '1')
    return fail(
      'Ce fichier n’est pas un export de résultats Sekoly Enseignant compatible.',
    );
  if (
    !db.schoolConfig.offlineExchangeId ||
    meta.EcoleId !== db.schoolConfig.offlineExchangeId
  )
    return fail('Ce fichier appartient à une autre école.');
  if (!year || meta.AnneeId !== year.id || year.status === 'CLOSED')
    return fail(
      'L’année scolaire du fichier ne correspond pas à l’année active du logiciel.',
    );
  if (!teacher)
    return fail(
      'L’enseignant du fichier est introuvable ou son matricule a changé.',
    );
  const assignments = teacherAssignments(db, teacher);
  const sheetName = kind === 'grades' ? 'Notes' : 'Appels';
  if (!workbook.Sheets[sheetName])
    return fail(`La feuille ${sheetName} est absente.`);
  const seen = new Set<string>();
  sheetRows(workbook, sheetName).forEach((row, index) => {
    const rowNumber = index + 2;
    if (Object.values(row).every((value) => value === '' || value === null))
      return;
    try {
      const matches = db.students.filter(
        (item) =>
          item.schoolYearId === year.id &&
          exchangeKey(item.matricule) === exchangeKey(string(row.Matricule)),
      );
      const student = matches[0];
      if (!student || matches.length !== 1)
        throw new Error(
          `Matricule élève inconnu ou ambigu : ${string(row.Matricule)}.`,
        );
      const cls = db.classes.find((item) => item.id === student.classId);
      if (
        !cls ||
        (exchangeKey(cls.code) !== exchangeKey(string(row.Classe)) &&
          exchangeKey(cls.name) !== exchangeKey(string(row.Classe)))
      )
        throw new Error(
          'La classe de cet élève a changé ou ne correspond pas au fichier.',
        );
      if (!assignments.some((item) => item.classId === cls.id))
        throw new Error('Cette classe n’est pas affectée à cet enseignant.');
      const baseFingerprint = string(row['Empreinte initiale']);
      if (!baseFingerprint)
        throw new Error(
          'Empreinte initiale absente : utilisez le fichier exporté par l’application.',
        );
      if (kind === 'grades') {
        const subject = db.subjects.find(
          (item) =>
            exchangeKey(item.code) === exchangeKey(string(row['Matière'])) ||
            exchangeKey(item.name) === exchangeKey(string(row['Matière'])),
        );
        const term = year.terms.find(
          (item) =>
            exchangeKey(item.code) === exchangeKey(string(row['Période'])) ||
            exchangeKey(item.label) === exchangeKey(string(row['Période'])),
        );
        if (
          !subject ||
          !assignments.some(
            (item) => item.classId === cls.id && item.subjectId === subject.id,
          )
        )
          throw new Error(
            'Cette matière n’est pas affectée à cet enseignant dans cette classe.',
          );
        if (!term || term.isLocked)
          throw new Error('Période inconnue ou verrouillée.');
        const evaluations: number[] = [],
          evaluationWeights: number[] = [];
        const controlColumns = Object.keys(row)
          .map((key) => ({
            key,
            index: Number(key.match(/^Contrôle (\d+)$/)?.[1] || 0),
          }))
          .filter((item) => item.index > 0)
          .sort((a, b) => a.index - b.index);
        if (
          controlColumns.length > 100 ||
          controlColumns.some((item) => item.index > 100)
        )
          throw new Error('Trop de colonnes de contrôle (maximum 100).');
        controlColumns.forEach(({ key, index: controlIndex }) => {
          const value = numeric(row[key], 20);
          if (value !== undefined) {
            const weight =
              numeric(row[`Coefficient contrôle ${controlIndex}`]) ?? 1;
            if (weight <= 0)
              throw new Error(
                'Les coefficients de contrôle doivent être positifs.',
              );
            evaluations.push(value);
            evaluationWeights.push(weight);
          }
        });
        const examGrade = numeric(row.Examen, 20),
          examCoefficient = numeric(row['Coefficient examen']) ?? 1;
        if (examCoefficient <= 0)
          throw new Error('Le coefficient de l’examen doit être positif.');
        if (!evaluations.length && examGrade === undefined) {
          result.warnings.push({
            row: rowNumber,
            message: 'Ligne sans note : aucune modification.',
          });
          return;
        }
        const proposed: ExchangeGrade = {
          studentId: student.id,
          subjectId: subject.id,
          termCode: term.code,
          evaluations,
          evaluationWeights,
          examGrade,
          examCoefficient,
          teacherComment: string(row['Appréciation']),
          baseFingerprint,
        };
        const key = gradeKey(proposed);
        if (seen.has(key))
          throw new Error(
            'Une fiche de notes est présente plusieurs fois dans ce fichier.',
          );
        seen.add(key);
        const existing = db.grades.find(
          (item) =>
            item.schoolYearId === year.id &&
            gradeKey(item) === key &&
            item.classId === cls.id,
        );
        if (existing?.cloudSyncConflict)
          throw new Error(
            'Cette fiche contient déjà un conflit cloud à résoudre dans le logiciel.',
          );
        if (
          gradeFingerprint(existing) !== baseFingerprint &&
          gradeFingerprint(existing) !== gradeFingerprint(proposed)
        )
          throw new Error(
            'Notes modifiées depuis la préparation du fichier : demandez un nouveau fichier à l’école pour résoudre ce conflit.',
          );
        result.grades.push({
          ...existing,
          id:
            existing?.id ||
            `excel-grade-${year.id}-${student.id}-${subject.id}-${term.code}`,
          studentId: student.id,
          classId: cls.id,
          subjectId: subject.id,
          termCode: term.code,
          schoolYearId: year.id,
          evaluations,
          evaluationWeights,
          examGrade,
          cloudExamCoefficient: examCoefficient,
          teacherComment: proposed.teacherComment || undefined,
          subjectAverage: 0,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const date = civilDate(row.Date);
        if (!date || date < year.startDate || date > year.endDate)
          throw new Error(
            'Date d’appel invalide ou située hors de l’année scolaire.',
          );
        const type = exchangeKey(string(row.Statut)).replace(
          /[ -]+/g,
          '_',
        ) as AttendanceRecord['type'];
        if (!attendanceTypes.includes(type))
          throw new Error(
            'Statut invalide : PRESENT, ABSENT_JUSTIFIE, ABSENT_NON_JUSTIFIE ou RETARD attendu.',
          );
        const minutesLate =
          type === 'RETARD' ? numeric(row['Minutes retard']) : undefined;
        if (
          type === 'RETARD' &&
          (!Number.isInteger(minutesLate) || (minutesLate || 0) < 1)
        )
          throw new Error(
            'Le retard doit être un nombre entier de minutes supérieur à zéro.',
          );
        const proposed: ExchangeAttendance = {
          studentId: student.id,
          classId: cls.id,
          date,
          type,
          minutesLate,
          reason:
            type === 'PRESENT' ? undefined : string(row.Motif) || undefined,
          baseFingerprint,
        };
        const key = attendanceKey(proposed);
        if (seen.has(key))
          throw new Error(
            'Un appel est présent plusieurs fois dans ce fichier.',
          );
        seen.add(key);
        const existing = db.attendanceRecords.find(
          (item) =>
            (!item.schoolYearId || item.schoolYearId === year.id) &&
            attendanceKey(item) === key,
        );
        if (
          attendanceFingerprint(existing) !== baseFingerprint &&
          attendanceFingerprint(existing) !== attendanceFingerprint(proposed)
        )
          throw new Error(
            'Appel modifié depuis la préparation du fichier : demandez un nouveau fichier à l’école pour résoudre ce conflit.',
          );
        result.attendance.push({
          ...existing,
          id:
            existing?.id || `excel-attendance-${year.id}-${student.id}-${date}`,
          studentId: student.id,
          classId: cls.id,
          schoolYearId: year.id,
          date,
          type,
          minutesLate,
          reason: proposed.reason,
          cloudIgnoredFingerprint:
            existing?.cloudIgnoredFingerprint ||
            (existing?.id.startsWith('cloud-att-') &&
            attendanceFingerprint(existing) !== attendanceFingerprint(proposed)
              ? attendanceFingerprint(existing)
              : undefined),
          cloudSyncConflict: undefined,
        });
      }
    } catch (error) {
      result.issues.push({
        row: rowNumber,
        message: error instanceof Error ? error.message : 'Ligne invalide.',
      });
    }
  });
  return result;
}
