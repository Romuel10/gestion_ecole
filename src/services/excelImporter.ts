import * as XLSX from 'xlsx';
import { DatabaseSchema, GradeEntry, Student } from '../types/school';
import { MatriculeService } from './matricule';
import { CalculationService } from './calculations';

export interface ExcelImportIssue {
  row: number;
  message: string;
}

export interface StudentImportPreview {
  students: Student[];
  issues: ExcelImportIssue[];
  warnings: ExcelImportIssue[];
  nextCounter: number;
}

export interface GradeImportPreview {
  grades: GradeEntry[];
  issues: ExcelImportIssue[];
  warnings: ExcelImportIssue[];
}

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const rowObject = (row: Record<string, unknown>) => {
  const mapped: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    mapped[normalize(key)] = value;
  });
  return mapped;
};

const pick = (row: Record<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const key = normalize(alias);
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return '';
};

const text = (value: unknown) => String(value ?? '').trim();

const excelDate = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (decoded) {
      return `${decoded.y}-${String(decoded.m).padStart(2, '0')}-${String(decoded.d).padStart(2, '0')}`;
    }
  }

  const raw = text(value);
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const fr = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (fr) {
    return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  }

  return raw;
};

const note = (value: unknown): number | undefined => {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const saveWorkbook = (workbook: XLSX.WorkBook, fileName: string) => {
  XLSX.writeFile(workbook, fileName);
};

export class ExcelImportService {
  static downloadStudentsTemplate(db: DatabaseSchema): void {
    const workbook = XLSX.utils.book_new();

    const headers = [
      'Matricule',
      'Nom',
      'Prénoms',
      'Sexe',
      'Date naissance',
      'Lieu naissance',
      'Classe',
      'Nationalité',
      'Adresse',
      'Quartier',
      'Ville',
      'Père',
      'Téléphone père',
      'Métier père',
      'Mère',
      'Téléphone mère',
      'Métier mère',
      'Tuteur',
      'Téléphone tuteur',
      'Contact urgence',
      'Téléphone urgence',
      'Groupe sanguin',
      'Notes médicales',
      'École précédente',
    ];

    const studentSheet = XLSX.utils.aoa_to_sheet([headers]);
    studentSheet['!cols'] = headers.map((header) => ({
      wch: Math.max(14, Math.min(28, header.length + 3)),
    }));
    XLSX.utils.book_append_sheet(workbook, studentSheet, 'Eleves');

    const exampleSheet = XLSX.utils.aoa_to_sheet([
      headers,
      [
        '',
        'RAKOTO',
        'Aina',
        'F',
        '15-03-2012',
        'Antananarivo',
        db.classes[0]?.code || '6EME_A',
        'Malgache',
        'Lot II...',
        'Andavamamba',
        'Antananarivo',
        'RAKOTO Hery',
        '0340000000',
        'Commerçant',
        'RASOA Mialy',
        '0330000000',
        'Enseignante',
        '',
        '',
        'RASOA Mialy',
        '0330000000',
        'O+',
        '',
        '',
      ],
    ]);
    XLSX.utils.book_append_sheet(workbook, exampleSheet, 'Exemple');

    const classRows = [
      ['Code classe', 'Nom classe'],
      ...db.classes.map((schoolClass) => [schoolClass.code, schoolClass.name]),
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(classRows),
      'Classes disponibles'
    );

    const instructions = XLSX.utils.aoa_to_sheet([
      ['IMPORT ÉLÈVES — SEKOLY'],
      ['1. Remplissez uniquement la feuille "Eleves".'],
      ['2. Nom, Prénoms, Sexe et Classe sont obligatoires.'],
      ['3. Sexe accepté : M ou F.'],
      ['4. Classe : utilisez le code ou le nom exact affiché dans la feuille "Classes disponibles".'],
      ['5. Matricule peut rester vide : Sekoly le génèrera automatiquement.'],
      ['6. Date de naissance : JJ-MM-AAAA (ex. 15-03-2012). Les anciens formats restent acceptés.'],
      ['7. Les lignes invalides seront affichées avant import et ne seront pas enregistrées.'],
    ]);
    XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');

    saveWorkbook(workbook, 'MODELE_IMPORT_ELEVES_SEKOLY.xlsx');
  }

  static async parseStudents(file: File, db: DatabaseSchema): Promise<StudentImportPreview> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet =
      workbook.Sheets.Eleves ||
      workbook.Sheets['Élèves'] ||
      workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) {
      throw new Error('Aucune feuille Excel lisible.');
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });

    const issues: ExcelImportIssue[] = [];
    const warnings: ExcelImportIssue[] = [];
    const students: Student[] = [];
    const existing = [...db.students];
    let counter = db.matriculeConfig.currentCounter;

    const classByKey = new Map<string, (typeof db.classes)[number]>();
    db.classes.forEach((schoolClass) => {
      classByKey.set(normalize(schoolClass.code), schoolClass);
      classByKey.set(normalize(schoolClass.name), schoolClass);
    });

    rawRows.forEach((rawRow, index) => {
      const rowNumber = index + 2;
      const row = rowObject(rawRow);
      const lastName = text(pick(row, ['Nom']));
      const firstName = text(pick(row, ['Prénoms', 'Prenoms', 'Prénom', 'Prenom']));
      const genderRaw = normalize(pick(row, ['Sexe', 'Genre']));
      const classRaw = text(pick(row, ['Classe', 'Code classe', 'Code_classe']));
      const schoolClass = classByKey.get(normalize(classRaw));

      if (!lastName && !firstName && !classRaw) return;

      if (!lastName) issues.push({ row: rowNumber, message: 'Nom obligatoire.' });
      if (!firstName) issues.push({ row: rowNumber, message: 'Prénoms obligatoires.' });
      if (!['m', 'masculin', 'f', 'feminin', 'femme'].includes(genderRaw)) {
        issues.push({ row: rowNumber, message: 'Sexe invalide : utilisez M ou F.' });
      }
      if (!schoolClass) {
        issues.push({
          row: rowNumber,
          message: `Classe inconnue : "${classRaw || 'vide'}".`,
        });
      }

      if (
        issues.some((issue) => issue.row === rowNumber)
      ) {
        return;
      }

      const gender: Student['gender'] =
        genderRaw === 'm' || genderRaw === 'masculin' ? 'M' : 'F';

      let matricule = text(pick(row, ['Matricule']));
      if (!matricule) {
        const generated = MatriculeService.generateNextMatricule(
          { ...db.matriculeConfig, currentCounter: counter },
          [...existing, ...students],
          {
            level: schoolClass!.level,
            year:
              db.schoolYears
                .find((year) => year.id === db.currentSchoolYearId)
                ?.startDate.slice(0, 4) || String(new Date().getFullYear()),
          }
        );
        matricule = generated.matricule;
        counter = generated.updatedCounter;
      }

      const duplicate = [...existing, ...students].some(
        (student) => student.matricule.toUpperCase() === matricule.toUpperCase()
      );
      if (duplicate) {
        issues.push({
          row: rowNumber,
          message: `Matricule déjà utilisé : ${matricule}.`,
        });
        return;
      }

      const birthDate = excelDate(pick(row, ['Date naissance', 'Date de naissance']));
      if (!birthDate) {
        warnings.push({ row: rowNumber, message: 'Date de naissance absente.' });
      }

      students.push({
        id: `stu-import-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        matricule,
        lastName: lastName.toUpperCase(),
        firstName,
        gender,
        birthDate,
        birthPlace: text(pick(row, ['Lieu naissance', 'Lieu de naissance'])),
        nationality: text(pick(row, ['Nationalité', 'Nationalite'])) || 'Malgache',
        address: text(pick(row, ['Adresse'])),
        neighborhood: text(pick(row, ['Quartier'])),
        city: text(pick(row, ['Ville'])) || db.schoolConfig.city || '',
        classId: schoolClass!.id,
        schoolYearId: db.currentSchoolYearId,
        status: 'INSCRIT',
        enrollmentDate: new Date().toISOString().slice(0, 10),
        fatherName: text(pick(row, ['Père', 'Pere', 'Nom père', 'Nom pere'])) || undefined,
        fatherPhone: text(pick(row, ['Téléphone père', 'Telephone pere'])) || undefined,
        fatherJob: text(pick(row, ['Métier père', 'Metier pere'])) || undefined,
        motherName: text(pick(row, ['Mère', 'Mere', 'Nom mère', 'Nom mere'])) || undefined,
        motherPhone: text(pick(row, ['Téléphone mère', 'Telephone mere'])) || undefined,
        motherJob: text(pick(row, ['Métier mère', 'Metier mere'])) || undefined,
        guardianName: text(pick(row, ['Tuteur', 'Nom tuteur'])) || undefined,
        guardianPhone: text(pick(row, ['Téléphone tuteur', 'Telephone tuteur'])) || undefined,
        emergencyContact:
          text(pick(row, ['Contact urgence', "Contact d'urgence"])) ||
          text(pick(row, ['Mère', 'Mere', 'Père', 'Pere'])) ||
          '',
        emergencyPhone:
          text(pick(row, ['Téléphone urgence', 'Telephone urgence'])) ||
          text(pick(row, ['Téléphone mère', 'Telephone mere', 'Téléphone père', 'Telephone pere'])) ||
          '',
        bloodType: text(pick(row, ['Groupe sanguin', 'Groupe_sanguin'])) || undefined,
        medicalNotes: text(pick(row, ['Notes médicales', 'Notes medicales'])) || undefined,
        previousSchool: text(pick(row, ['École précédente', 'Ecole precedente'])) || undefined,
      });
    });

    return { students, issues, warnings, nextCounter: counter };
  }

  static downloadGradesTemplate(db: DatabaseSchema): void {
    const workbook = XLSX.utils.book_new();

    const headers = [
      'Matricule',
      'Matière',
      'Période',
      'Contrôle 1',
      'Contrôle 2',
      'Examen',
      'Appréciation',
    ];
    const sheet = XLSX.utils.aoa_to_sheet([headers]);
    sheet['!cols'] = [
      { wch: 18 },
      { wch: 26 },
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 38 },
    ];
    XLSX.utils.book_append_sheet(workbook, sheet, 'Notes');

    const studentRows = [
      ['Matricule', 'Élève', 'Classe'],
      ...db.students
        .filter((student) => student.schoolYearId === db.currentSchoolYearId)
        .map((student) => [
          student.matricule,
          `${student.lastName} ${student.firstName}`,
          db.classes.find((item) => item.id === student.classId)?.name || '',
        ]),
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(studentRows),
      'Élèves'
    );

    const subjectRows = [
      ['Code matière', 'Matière'],
      ...db.subjects.map((subject) => [subject.code, subject.name]),
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(subjectRows),
      'Matières'
    );

    const year = db.schoolYears.find((item) => item.id === db.currentSchoolYearId);
    const periodRows = [
      ['Code période', 'Période'],
      ...(year?.terms || []).map((term) => [term.code, term.label]),
    ];
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(periodRows),
      'Périodes'
    );

    const instructions = XLSX.utils.aoa_to_sheet([
      ['IMPORT NOTES — SEKOLY'],
      ['1. Remplissez la feuille "Notes".'],
      ['2. Matricule, Matière et Période sont obligatoires.'],
      ['3. Matière accepte le code ou le nom complet.'],
      ['4. Période accepte le code ou le libellé.'],
      ['5. Notes entre 0 et 20. Les cellules peuvent rester vides si la note n’existe pas.'],
      ['6. Une ligne déjà existante met à jour la note de la matière pour cet élève et cette période.'],
    ]);
    XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');

    saveWorkbook(workbook, 'MODELE_IMPORT_NOTES_SEKOLY.xlsx');
  }

  static async parseGrades(file: File, db: DatabaseSchema): Promise<GradeImportPreview> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet =
      workbook.Sheets.Notes ||
      workbook.Sheets[workbook.SheetNames[0]];

    if (!sheet) throw new Error('Aucune feuille Excel lisible.');

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      raw: true,
    });

    const currentStudents = db.students.filter(
      (student) => student.schoolYearId === db.currentSchoolYearId
    );
    const studentByMatricule = new Map(
      currentStudents.map((student) => [normalize(student.matricule), student])
    );

    const subjectByKey = new Map<string, (typeof db.subjects)[number]>();
    db.subjects.forEach((subject) => {
      subjectByKey.set(normalize(subject.code), subject);
      subjectByKey.set(normalize(subject.name), subject);
    });

    const currentYear = db.schoolYears.find(
      (year) => year.id === db.currentSchoolYearId
    );
    const termByKey = new Map<string, NonNullable<typeof currentYear>['terms'][number]>();
    (currentYear?.terms || []).forEach((term) => {
      termByKey.set(normalize(term.code), term);
      termByKey.set(normalize(term.label), term);
    });

    const issues: ExcelImportIssue[] = [];
    const warnings: ExcelImportIssue[] = [];
    const grades: GradeEntry[] = [];

    rawRows.forEach((rawRow, index) => {
      const rowNumber = index + 2;
      const row = rowObject(rawRow);
      const matricule = text(pick(row, ['Matricule']));
      const subjectRaw = text(pick(row, ['Matière', 'Matiere', 'Code matière', 'Code matiere']));
      const termRaw = text(pick(row, ['Période', 'Periode', 'Trimestre', 'Semestre']));

      if (!matricule && !subjectRaw && !termRaw) return;

      const student = studentByMatricule.get(normalize(matricule));
      const subject = subjectByKey.get(normalize(subjectRaw));
      const term = termByKey.get(normalize(termRaw));

      if (!student) {
        issues.push({ row: rowNumber, message: `Élève introuvable : ${matricule || 'matricule vide'}.` });
      }
      if (!subject) {
        issues.push({ row: rowNumber, message: `Matière inconnue : ${subjectRaw || 'vide'}.` });
      }
      if (!term) {
        issues.push({ row: rowNumber, message: `Période inconnue : ${termRaw || 'vide'}.` });
      }
      if (term?.isLocked) {
        issues.push({ row: rowNumber, message: `${term.label} est verrouillé.` });
      }
      if (student && subject) {
        const schoolClass = db.classes.find((item) => item.id === student.classId);
        if (!schoolClass?.subjects.some((item) => item.subjectId === subject.id)) {
          issues.push({
            row: rowNumber,
            message: `${subject.name} n'est pas configurée pour la classe de cet élève.`,
          });
        }
      }

      const control1 = note(pick(row, ['Contrôle 1', 'Controle 1', 'CC1']));
      const control2 = note(pick(row, ['Contrôle 2', 'Controle 2', 'CC2']));
      const exam = note(pick(row, ['Examen', 'Composition']));

      [control1, control2, exam].forEach((value) => {
        if (value !== undefined && (value < 0 || value > 20)) {
          issues.push({ row: rowNumber, message: 'Toutes les notes doivent être comprises entre 0 et 20.' });
        }
      });

      if (
        issues.some((issue) => issue.row === rowNumber) ||
        !student ||
        !subject ||
        !term
      ) {
        return;
      }

      const evaluations = [control1, control2].filter(
        (value): value is number => value !== undefined
      );

      if (evaluations.length === 0 && exam === undefined) {
        warnings.push({ row: rowNumber, message: 'Aucune note numérique sur cette ligne.' });
        return;
      }

      const existing = db.grades.find(
        (grade) =>
          grade.studentId === student.id &&
          grade.subjectId === subject.id &&
          grade.termCode === term.code &&
          grade.schoolYearId === db.currentSchoolYearId
      );

      grades.push({
        id:
          existing?.id ||
          `grd-import-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        studentId: student.id,
        classId: student.classId,
        subjectId: subject.id,
        termCode: term.code,
        schoolYearId: db.currentSchoolYearId,
        evaluations,
        examGrade: exam,
        subjectAverage: CalculationService.computeSubjectAverage(
          evaluations,
          exam,
          db.schoolConfig.continuousAssessmentWeight ?? 1,
          db.schoolConfig.examWeight ?? 2
        ),
        teacherComment: text(pick(row, ['Appréciation', 'Appreciation', 'Commentaire'])) || undefined,
        updatedAt: new Date().toISOString().slice(0, 10),
      });
    });

    return { grades, issues, warnings };
  }
}
