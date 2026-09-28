import test from 'node:test';
import assert from 'node:assert/strict';
import { CalculationService } from '../src/services/calculations.ts';

test('computeSubjectAverage applique les pondérations devoir/examen', () => {
  assert.equal(
    CalculationService.computeSubjectAverage([10, 14], 16, 1, 2),
    14.67
  );
});

test('computeSubjectAverage fonctionne avec examen seul', () => {
  assert.equal(CalculationService.computeSubjectAverage([], 12.345), 12.35);
});

test('computeSubjectAverage fonctionne avec contrôles seuls', () => {
  assert.equal(CalculationService.computeSubjectAverage([9, 11, 13]), 11);
});

test('une matière sans note ne baisse pas la moyenne générale', () => {
  const db = {
    version: 'test',
    lastUpdated: new Date().toISOString(),
    currentSchoolYearId: 'year-1',
    currentTermCode: 'T1',
    schoolConfig: {
      id: 'cfg',
      name: 'École test',
      acronym: 'TEST',
      motto: '',
      address: '',
      city: '',
      phone: '',
      email: '',
      directorName: '',
      directorTitle: '',
      currency: 'Ar',
      passingGrade: 10,
      schoolMonths: [],
      reminderTemplate: '',
      badgeThemeColor: '#000000',
      continuousAssessmentWeight: 1,
      examWeight: 2,
    },
    matriculeConfig: {
      pattern: 'T-{NUM4}',
      prefix: 'T',
      numDigits: 4,
      autoIncrement: true,
      currentCounter: 1,
      resetEveryYear: false,
      includeYear: false,
      yearFormat: 'YYYY',
      separator: '-',
    },
    schoolYears: [{
      id: 'year-1',
      label: '2026 - 2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
      isCurrent: true,
      status: 'ACTIVE',
      terms: [{
        id: 'term-1',
        code: 'T1',
        label: 'Trimestre 1',
        startDate: '2026-09-01',
        endDate: '2026-12-20',
        weight: 1,
        isLocked: false,
      }],
    }],
    subjects: [
      { id: 'math', code: 'MAT', name: 'Mathématiques', category: 'SCIENTIFIQUE', color: '#000', defaultCoeff: 2 },
      { id: 'fra', code: 'FRA', name: 'Français', category: 'LITTERAIRE', color: '#000', defaultCoeff: 2 },
    ],
    classes: [{
      id: 'c1',
      code: '6E',
      name: '6e',
      level: 'college',
      room: '1',
      capacity: 30,
      subjects: [
        { subjectId: 'math', coefficient: 2 },
        { subjectId: 'fra', coefficient: 2 },
      ],
      monthlyTuitionFee: 0,
      registrationFee: 0,
      reRegistrationFee: 0,
    }],
    students: [{
      id: 's1',
      matricule: 'S1',
      lastName: 'TEST',
      firstName: 'Élève',
      gender: 'M',
      birthDate: '2014-01-01',
      birthPlace: '',
      nationality: 'Malgache',
      address: '',
      neighborhood: '',
      city: '',
      classId: 'c1',
      schoolYearId: 'year-1',
      status: 'INSCRIT',
      enrollmentDate: '2026-09-01',
      emergencyContact: '',
      emergencyPhone: '',
    }],
    teachers: [],
    grades: [{
      id: 'g1',
      studentId: 's1',
      classId: 'c1',
      subjectId: 'math',
      termCode: 'T1',
      schoolYearId: 'year-1',
      evaluations: [12],
      examGrade: 12,
      subjectAverage: 12,
      updatedAt: '2026-09-28',
    }],
    tuitionPayments: [],
    salaryPayments: [],
    cashTransactions: [],
    cashDayClosures: [],
    timetableSlots: [],
    attendanceRecords: [],
  };

  const [report] = CalculationService.generateClassReportCards(db as any, 'c1', 'T1', 'year-1');
  assert.ok(report);
  assert.equal(report.generalAverage, 12);
  assert.equal(report.totalCoefficients, 2);
});

test('deux élèves avec la même moyenne reçoivent le même rang', () => {
  const mkStudent = (id: string) => ({
    id,
    matricule: id.toUpperCase(),
    lastName: id,
    firstName: '',
    gender: 'M' as const,
    birthDate: '2014-01-01',
    birthPlace: '',
    nationality: 'Malgache',
    address: '',
    neighborhood: '',
    city: '',
    classId: 'c1',
    schoolYearId: 'year-1',
    status: 'INSCRIT' as const,
    enrollmentDate: '2026-09-01',
    emergencyContact: '',
    emergencyPhone: '',
  });

  const base: any = {
    version: 'test',
    lastUpdated: new Date().toISOString(),
    currentSchoolYearId: 'year-1',
    currentTermCode: 'T1',
    schoolConfig: {
      id: 'cfg', name: 'Test', acronym: 'T', motto: '', address: '', city: '',
      phone: '', email: '', directorName: '', directorTitle: '', currency: 'Ar',
      passingGrade: 10, schoolMonths: [], reminderTemplate: '', badgeThemeColor: '#000',
      continuousAssessmentWeight: 1, examWeight: 2,
    },
    matriculeConfig: {
      pattern: 'T-{NUM4}', prefix: 'T', numDigits: 4, autoIncrement: true,
      currentCounter: 1, resetEveryYear: false, includeYear: false,
      yearFormat: 'YYYY', separator: '-',
    },
    schoolYears: [{
      id: 'year-1', label: '2026 - 2027', startDate: '2026-09-01',
      endDate: '2027-06-30', isCurrent: true, status: 'ACTIVE',
      terms: [{ id: 'term-1', code: 'T1', label: 'T1', startDate: '2026-09-01', endDate: '2026-12-20', weight: 1, isLocked: false }],
    }],
    subjects: [{ id: 'math', code: 'MAT', name: 'Math', category: 'SCIENTIFIQUE', color: '#000', defaultCoeff: 1 }],
    classes: [{
      id: 'c1', code: '6E', name: '6e', level: 'college', room: '1', capacity: 30,
      subjects: [{ subjectId: 'math', coefficient: 1 }],
      monthlyTuitionFee: 0, registrationFee: 0, reRegistrationFee: 0,
    }],
    students: [mkStudent('s1'), mkStudent('s2')],
    teachers: [],
    grades: [
      { id: 'g1', studentId: 's1', classId: 'c1', subjectId: 'math', termCode: 'T1', schoolYearId: 'year-1', evaluations: [14], subjectAverage: 14, updatedAt: '2026-09-28' },
      { id: 'g2', studentId: 's2', classId: 'c1', subjectId: 'math', termCode: 'T1', schoolYearId: 'year-1', evaluations: [14], subjectAverage: 14, updatedAt: '2026-09-28' },
    ],
    tuitionPayments: [], salaryPayments: [], cashTransactions: [], cashDayClosures: [],
    timetableSlots: [], attendanceRecords: [],
  };

  const reports = CalculationService.generateClassReportCards(base, 'c1', 'T1', 'year-1');
  assert.equal(reports.length, 2);
  assert.equal(reports[0].rank, 1);
  assert.equal(reports[1].rank, 1);
});
