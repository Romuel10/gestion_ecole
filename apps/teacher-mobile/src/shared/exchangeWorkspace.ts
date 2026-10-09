import {
  attendanceFingerprint,
  attendanceKey,
  civilDate,
  gradeFingerprint,
  gradeKey,
  packageKey,
} from './teacherExchange';
import type {
  ExchangeAttendance,
  ExchangeGrade,
  TeacherPackage,
} from './teacherExchange';

export type ExcelWorkspaceData = {
  package: TeacherPackage;
  grades: Record<string, ExchangeGrade>;
  attendance: Record<string, ExchangeAttendance>;
  lastExportAt?: string;
};
export function emptyExcelWorkspace(data: TeacherPackage): ExcelWorkspaceData {
  return { package: data, grades: {}, attendance: {} };
}

export function workspaceConflicts(
  workspace: ExcelWorkspaceData,
  kind: 'grades' | 'attendance',
) {
  const gradeDescription = (entry?: ExchangeGrade) =>
    entry
      ? `contrôles ${entry.evaluations.join(' ; ')} (coefficients ${entry.evaluations.map((_, index) => entry.evaluationWeights?.[index] ?? 1).join(' ; ')}), examen ${entry.examGrade ?? 'vide'} (coefficient ${entry.examCoefficient ?? 1}), appréciation ${entry.teacherComment || 'vide'}`
      : 'Aucune fiche';
  const attendanceDescription = (entry?: ExchangeAttendance) =>
    entry
      ? `${entry.type}${entry.type === 'RETARD' ? `, ${entry.minutesLate} minutes` : ''}${entry.reason ? `, ${entry.reason}` : ''}`
      : 'Aucun appel';
  if (kind === 'grades')
    return Object.entries(workspace.grades).flatMap(([key, entry]) => {
      const baseline = workspace.package.grades.find(
        (item) => gradeKey(item) === key,
      );
      return entry.baseFingerprint !== (baseline?.baseFingerprint || 'ABSENT')
        ? [
            {
              key,
              studentId: entry.studentId,
              schoolValue: gradeDescription(baseline),
              teacherValue: gradeDescription(entry),
            },
          ]
        : [];
    });
  return Object.entries(workspace.attendance).flatMap(([key, entry]) => {
    const baseline = workspace.package.attendance.find(
      (item) => attendanceKey(item) === key,
    );
    return entry.baseFingerprint !== (baseline?.baseFingerprint || 'ABSENT')
      ? [
          {
            key,
            studentId: entry.studentId,
            schoolValue: attendanceDescription(baseline),
            teacherValue: attendanceDescription(entry),
          },
        ]
      : [];
  });
}

// A refreshed school file acknowledges a sent entry only if its values match.
// Unacknowledged entries keep their original comparison value for conflict checks.
export function refreshExcelWorkspace(
  existing: ExcelWorkspaceData,
  data: TeacherPackage,
): ExcelWorkspaceData {
  if (packageKey(existing.package) !== packageKey(data))
    throw new Error(
      'Ce fichier correspond à un autre enseignant, une autre école ou une autre année.',
    );
  const grades: ExcelWorkspaceData['grades'] = {},
    attendance: ExcelWorkspaceData['attendance'] = {};
  Object.entries(existing.grades).forEach(([key, entry]) => {
    const baseline = data.grades.find((item) => gradeKey(item) === key);
    if (baseline && gradeFingerprint(baseline) === gradeFingerprint(entry))
      return;
    const student = data.students.find((item) => item.id === entry.studentId);
    if (
      !student ||
      !data.assignments.some(
        (item) =>
          item.classId === student.classId &&
          item.subjectId === entry.subjectId,
      ) ||
      !data.terms.some((item) => item.code === entry.termCode)
    )
      throw new Error(
        'Le nouveau fichier retire des élèves ou affectations ayant des notes non confirmées. Exportez votre travail et contactez l’école avant d’actualiser.',
      );
    grades[key] = entry;
  });
  Object.entries(existing.attendance).forEach(([key, entry]) => {
    const baseline = data.attendance.find(
      (item) => attendanceKey(item) === key,
    );
    if (
      baseline &&
      attendanceFingerprint(baseline) === attendanceFingerprint(entry)
    )
      return;
    if (
      !data.students.some(
        (item) => item.id === entry.studentId && item.classId === entry.classId,
      )
    )
      throw new Error(
        'Le nouveau fichier retire des élèves ayant des appels non confirmés. Exportez votre travail et contactez l’école avant d’actualiser.',
      );
    attendance[key] = entry;
  });
  return { ...existing, package: data, grades, attendance };
}

export function saveExcelGrades(
  workspace: ExcelWorkspaceData,
  entries: Omit<ExchangeGrade, 'baseFingerprint'>[],
  acceptConflicts = false,
): ExcelWorkspaceData {
  const grades = { ...workspace.grades };
  entries.forEach((entry) => {
    const student = workspace.package.students.find(
      (item) => item.id === entry.studentId,
    );
    const term = workspace.package.terms.find(
      (item) => item.code === entry.termCode,
    );
    if (
      !student ||
      !term ||
      term.isLocked ||
      !workspace.package.assignments.some(
        (item) =>
          item.classId === student.classId &&
          item.subjectId === entry.subjectId,
      )
    )
      throw new Error('Élève, affectation ou période indisponible.');
    if (
      entry.evaluations.some(
        (value) => !Number.isFinite(value) || value < 0 || value > 20,
      ) ||
      (entry.examGrade !== undefined &&
        (!Number.isFinite(entry.examGrade) ||
          entry.examGrade < 0 ||
          entry.examGrade > 20))
    )
      throw new Error('Les notes doivent être comprises entre 0 et 20.');
    if (
      entry.evaluationWeights &&
      (entry.evaluationWeights.length !== entry.evaluations.length ||
        entry.evaluationWeights.some(
          (value) => !Number.isFinite(value) || value <= 0,
        ))
    )
      throw new Error('Les coefficients de contrôle doivent être positifs.');
    if (
      entry.examCoefficient !== undefined &&
      (!Number.isFinite(entry.examCoefficient) || entry.examCoefficient <= 0)
    )
      throw new Error('Le coefficient de l’examen doit être positif.');
    const key = gradeKey(entry),
      baseline = workspace.package.grades.find(
        (item) => gradeKey(item) === key,
      );
    if (
      !acceptConflicts &&
      workspace.grades[key] &&
      workspace.grades[key].baseFingerprint !==
        (baseline?.baseFingerprint || 'ABSENT') &&
      gradeFingerprint(entry) !== gradeFingerprint(baseline)
    )
      throw new Error(
        'L’école a modifié cette fiche. Relisez et confirmez la correction avant de l’enregistrer.',
      );
    if (!entry.evaluations.length && entry.examGrade === undefined) {
      if (
        baseline &&
        (baseline.evaluations.length || baseline.examGrade !== undefined)
      )
        throw new Error(
          'Pour effacer une fiche déjà enregistrée par l’école, contactez la direction.',
        );
      delete grades[key];
      return;
    }
    if (baseline && gradeFingerprint(baseline) === gradeFingerprint(entry))
      delete grades[key];
    else
      grades[key] = {
        ...entry,
        baseFingerprint: baseline?.baseFingerprint || 'ABSENT',
      };
  });
  return { ...workspace, grades };
}

export function saveExcelAttendance(
  workspace: ExcelWorkspaceData,
  entries: Omit<ExchangeAttendance, 'baseFingerprint'>[],
  acceptConflicts = false,
): ExcelWorkspaceData {
  const attendance = { ...workspace.attendance };
  entries.forEach((entry) => {
    if (
      !workspace.package.students.some(
        (item) => item.id === entry.studentId && item.classId === entry.classId,
      ) ||
      !workspace.package.assignments.some(
        (item) => item.classId === entry.classId,
      )
    )
      throw new Error('Élève ou classe indisponible.');
    if (
      !civilDate(entry.date) ||
      entry.date < workspace.package.schoolYear.startDate ||
      entry.date > workspace.package.schoolYear.endDate
    )
      throw new Error('Date invalide ou située hors de l’année scolaire.');
    if (
      !['PRESENT', 'ABSENT_JUSTIFIE', 'ABSENT_NON_JUSTIFIE', 'RETARD'].includes(
        entry.type,
      ) ||
      (entry.type === 'RETARD' &&
        (!Number.isInteger(entry.minutesLate) || (entry.minutesLate || 0) <= 0))
    )
      throw new Error('Statut ou minutes de retard invalides.');
    const key = attendanceKey(entry),
      baseline = workspace.package.attendance.find(
        (item) => attendanceKey(item) === key,
      );
    if (
      !acceptConflicts &&
      workspace.attendance[key] &&
      workspace.attendance[key].baseFingerprint !==
        (baseline?.baseFingerprint || 'ABSENT') &&
      attendanceFingerprint(entry) !== attendanceFingerprint(baseline)
    )
      throw new Error(
        'L’école a modifié cet appel. Relisez et confirmez la correction avant de l’enregistrer.',
      );
    const clean = {
      ...entry,
      minutesLate: entry.type === 'RETARD' ? entry.minutesLate : undefined,
      reason:
        entry.type === 'PRESENT'
          ? undefined
          : entry.reason?.trim() || undefined,
    };
    if (
      baseline &&
      attendanceFingerprint(baseline) === attendanceFingerprint(clean)
    )
      delete attendance[key];
    else
      attendance[key] = {
        ...clean,
        baseFingerprint: baseline?.baseFingerprint || 'ABSENT',
      };
  });
  return { ...workspace, attendance };
}
