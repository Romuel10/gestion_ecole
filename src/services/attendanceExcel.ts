import * as XLSX from 'xlsx';
import type { AttendanceRecord, DatabaseSchema } from '../types/school';
import type { ExcelImportIssue } from './excelImporter';
import {
  attendanceKey,
  civilDate,
  exchangeKey,
  parseTeacherResults,
  readExchangeWorkbook,
} from '../shared/teacherExchange';

export type AttendanceImportPreview = {
  records: AttendanceRecord[];
  issues: ExcelImportIssue[];
  warnings: ExcelImportIssue[];
  validateCurrent?: (db: DatabaseSchema) => void;
};
export function downloadAttendanceTemplate(db: DatabaseSchema) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Matricule', 'Classe', 'Date', 'Statut', 'Minutes retard', 'Motif'],
    ]),
    'Appels',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Matricule', 'Élève', 'Classe'],
      ...db.students
        .filter((student) => student.schoolYearId === db.currentSchoolYearId)
        .map((student) => [
          student.matricule,
          `${student.lastName} ${student.firstName}`,
          db.classes.find((cls) => cls.id === student.classId)?.code || '',
        ]),
    ]),
    'Eleves',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['IMPORT APPELS — SEKOLY'],
      ['Date : JJ-MM-AAAA ou date Excel, dans l’année scolaire active.'],
      [
        'Statut : PRESENT (P), ABSENT_NON_JUSTIFIE (A), ABSENT_JUSTIFIE (J), RETARD (R).',
      ],
      ['Minutes retard : entier positif uniquement pour RETARD.'],
      [
        'Une ligne met à jour l’appel de cet élève à cette date ; les autres dates restent inchangées.',
      ],
      [
        'Pour les exports de Sekoly Enseignant, importez directement le fichier reçu.',
      ],
    ]),
    'Instructions',
  );
  XLSX.writeFile(workbook, 'MODELE_IMPORT_APPELS_SEKOLY.xlsx');
}
export async function parseAttendance(
  file: File,
  db: DatabaseSchema,
): Promise<AttendanceImportPreview> {
  const workbook = readExchangeWorkbook(await file.arrayBuffer());
  if (workbook.Sheets.Configuration) {
    const preview = parseTeacherResults(workbook, db, 'attendance');
    return {
      records: preview.attendance,
      issues: preview.issues,
      warnings: preview.warnings,
      validateCurrent: (current) => {
        const checked = parseTeacherResults(workbook, current, 'attendance');
        if (checked.issues.length) throw new Error(checked.issues[0].message);
        if (
          checked.attendance.some(
            (entry) =>
              !preview.attendance.some((proposed) => proposed.id === entry.id),
          )
        )
          throw new Error(
            'Des appels ont été ajoutés depuis la prévisualisation. Rechargez le fichier avant de confirmer.',
          );
      },
    };
  }
  const sheet =
    workbook.Sheets.Appels || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Aucune feuille Excel lisible.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  });
  const records: AttendanceRecord[] = [],
    issues: ExcelImportIssue[] = [],
    warnings: ExcelImportIssue[] = [];
  const year = db.schoolYears.find(
    (item) => item.id === db.currentSchoolYearId,
  );
  const seen = new Set<string>();
  const aliases: Record<string, AttendanceRecord['type']> = {
    P: 'PRESENT',
    PRESENT: 'PRESENT',
    A: 'ABSENT_NON_JUSTIFIE',
    ABSENT_NON_JUSTIFIE: 'ABSENT_NON_JUSTIFIE',
    J: 'ABSENT_JUSTIFIE',
    ABSENT_JUSTIFIE: 'ABSENT_JUSTIFIE',
    R: 'RETARD',
    RETARD: 'RETARD',
  };
  rows.forEach((row, index) => {
    if (Object.values(row).every((value) => value === '' || value === null))
      return;
    try {
      if (!year || year.status === 'CLOSED')
        throw new Error('Choisissez une année scolaire active.');
      const student = db.students.find(
        (item) =>
          item.schoolYearId === year.id &&
          exchangeKey(item.matricule) === exchangeKey(String(row.Matricule)),
      );
      if (!student)
        throw new Error('Matricule élève introuvable dans l’année active.');
      const cls = db.classes.find((item) => item.id === student.classId);
      if (
        !cls ||
        ![cls.code, cls.name].some(
          (value) => exchangeKey(value) === exchangeKey(String(row.Classe)),
        )
      )
        throw new Error(
          'Classe inconnue ou différente de la classe de cet élève.',
        );
      const date = civilDate(row.Date);
      if (!date || date < year.startDate || date > year.endDate)
        throw new Error('Date d’appel invalide ou hors de l’année scolaire.');
      const type =
        aliases[exchangeKey(String(row.Statut)).replace(/[ -]+/g, '_')];
      if (!type)
        throw new Error(
          'Statut inconnu : P, A, J, R ou un statut complet attendu.',
        );
      const minutesLate =
        type === 'RETARD'
          ? Number(String(row['Minutes retard']).replace(',', '.'))
          : undefined;
      if (
        type === 'RETARD' &&
        (!Number.isInteger(minutesLate) || (minutesLate || 0) <= 0)
      )
        throw new Error(
          'Indiquez un nombre entier de minutes de retard supérieur à zéro.',
        );
      const key = attendanceKey({
        studentId: student.id,
        classId: cls.id,
        date,
      });
      if (seen.has(key))
        throw new Error(
          'Un appel apparaît plusieurs fois pour le même élève et la même date.',
        );
      seen.add(key);
      const existing = db.attendanceRecords.find(
        (item) =>
          (!item.schoolYearId || item.schoolYearId === year.id) &&
          attendanceKey(item) === key,
      );
      records.push({
        ...existing,
        id: existing?.id || `excel-attendance-${year.id}-${student.id}-${date}`,
        studentId: student.id,
        classId: cls.id,
        schoolYearId: year.id,
        date,
        type,
        minutesLate,
        reason:
          type === 'PRESENT'
            ? undefined
            : String(row.Motif || '').trim() || undefined,
        cloudIgnoredFingerprint:
          existing?.cloudIgnoredFingerprint ||
          (existing?.id.startsWith('cloud-att-')
            ? JSON.stringify([
                existing.type,
                existing.type === 'RETARD'
                  ? (existing.minutesLate ?? null)
                  : null,
                existing.type === 'PRESENT'
                  ? ''
                  : existing.reason?.trim() || '',
              ])
            : undefined),
        cloudSyncConflict: undefined,
      });
    } catch (error) {
      issues.push({
        row: index + 2,
        message: error instanceof Error ? error.message : 'Ligne invalide.',
      });
    }
  });
  return {
    records,
    issues,
    warnings,
    validateCurrent: (current) => {
      if (current.currentSchoolYearId !== db.currentSchoolYearId)
        throw new Error('L’année scolaire a changé. Rechargez le fichier.');
      if (
        records.some((record) => {
          const student = current.students.find(
            (item) => item.id === record.studentId,
          );
          return (
            student?.classId !== record.classId ||
            student?.schoolYearId !== record.schoolYearId
          );
        })
      )
        throw new Error('La liste des élèves a changé. Rechargez le fichier.');
    },
  };
}
