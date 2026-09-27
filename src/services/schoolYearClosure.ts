import { DatabaseSchema, Student } from '../types/school';
import { CalculationService } from './calculations';

export interface SchoolYearClosureReport {
  schoolYearId: string;
  nextSchoolYearId: string;
  students: number;
  promoted: number;
  repeated: number;
  dismissed: number;
  review: number;
  preparedNextYear: number;
  skippedCapacity: number;
  skippedNoDestination: number;
  skippedExisting: number;
}

export class SchoolYearClosureService {
  static preview(db: DatabaseSchema, schoolYearId: string = db.currentSchoolYearId) {
    const year = db.schoolYears.find((item) => item.id === schoolYearId);
    if (!year) throw new Error('Année scolaire introuvable.');

    const decisions = CalculationService.computeAnnualDecisions(db, schoolYearId);
    const nextYear = db.schoolYears
      .filter((item) => item.startDate > year.startDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

    return {
      year,
      nextYear,
      decisions,
      counts: {
        students: decisions.length,
        promoted: decisions.filter((item) => item.outcome === 'PROMOTE').length,
        repeated: decisions.filter((item) => item.outcome === 'REPEAT').length,
        dismissed: decisions.filter((item) => item.outcome === 'DISMISS').length,
        review: decisions.filter((item) => item.outcome === 'REVIEW').length,
      },
    };
  }

  static close(
    db: DatabaseSchema,
    schoolYearId: string = db.currentSchoolYearId,
    options: { allowReview?: boolean; closureNote?: string } = {}
  ): { db: DatabaseSchema; report: SchoolYearClosureReport } {
    const preview = this.preview(db, schoolYearId);
    const { year, nextYear, decisions, counts } = preview;

    if (year.status === 'CLOSED') {
      throw new Error('Cette année scolaire est déjà clôturée.');
    }
    if (!nextYear) {
      throw new Error('Créez d’abord l’année scolaire suivante.');
    }
    if (counts.review > 0 && !options.allowReview) {
      throw new Error(
        `${counts.review} élève(s) sont encore « À examiner ». Finalisez leurs résultats ou autorisez explicitement la clôture avec dossiers à examiner.`
      );
    }

    const existingNextYearMatricules = new Set(
      db.students
        .filter((student) => student.schoolYearId === nextYear.id)
        .map((student) => student.matricule)
    );

    const destinationCounts = new Map<string, number>();
    db.classes.forEach((schoolClass) => {
      destinationCounts.set(
        schoolClass.id,
        db.students.filter(
          (student) =>
            student.schoolYearId === nextYear.id &&
            student.classId === schoolClass.id
        ).length
      );
    });

    const preparedStudents: Student[] = [];
    let skippedCapacity = 0;
    let skippedNoDestination = 0;
    let skippedExisting = 0;

    decisions.forEach((decision, index) => {
      if (!['PROMOTE', 'REPEAT'].includes(decision.outcome)) return;
      if (!decision.destinationClassId) {
        skippedNoDestination += 1;
        return;
      }
      if (existingNextYearMatricules.has(decision.student.matricule)) {
        skippedExisting += 1;
        return;
      }

      const destinationClass = db.classes.find(
        (item) => item.id === decision.destinationClassId
      );
      if (!destinationClass) {
        skippedNoDestination += 1;
        return;
      }

      const count = destinationCounts.get(destinationClass.id) || 0;
      if (count >= destinationClass.capacity) {
        skippedCapacity += 1;
        return;
      }

      preparedStudents.push({
        ...decision.student,
        id: `stu-${nextYear.id}-${Date.now()}-${index}`,
        classId: destinationClass.id,
        schoolYearId: nextYear.id,
        status: 'EN_ATTENTE',
        enrollmentDate: new Date().toISOString().slice(0, 10),
        councilDecision: undefined,
      });
      existingNextYearMatricules.add(decision.student.matricule);
      destinationCounts.set(destinationClass.id, count + 1);
    });

    const decisionMap = new Map(
      decisions.map((decision) => [decision.student.id, decision])
    );

    const archivedStudents = db.students.map((student) => {
      if (student.schoolYearId !== schoolYearId) return student;
      const decision = decisionMap.get(student.id);
      if (!decision) return student;

      const destination = decision.destinationClassName
        ? ` — ${decision.destinationClassName}`
        : '';

      return {
        ...student,
        councilDecision: `${decision.label}${destination}`,
      };
    });

    const now = new Date().toISOString();
    const firstNextTerm = nextYear.terms[0]?.code || '';

    const updatedYears = db.schoolYears.map((item) => {
      if (item.id === year.id) {
        return {
          ...item,
          status: 'CLOSED' as const,
          isCurrent: false,
          closedAt: now,
          closureNote: options.closureNote?.trim() || undefined,
          closureStats: {
            students: counts.students,
            promoted: counts.promoted,
            repeated: counts.repeated,
            dismissed: counts.dismissed,
            review: counts.review,
            preparedNextYear: preparedStudents.length,
          },
          terms: item.terms.map((term) => ({ ...term, isLocked: true })),
        };
      }
      if (item.id === nextYear.id) {
        return {
          ...item,
          status: 'ACTIVE' as const,
          isCurrent: true,
        };
      }
      return { ...item, isCurrent: false };
    });

    const updatedDb: DatabaseSchema = {
      ...db,
      schoolYears: updatedYears,
      currentSchoolYearId: nextYear.id,
      currentTermCode: firstNextTerm,
      students: [...preparedStudents, ...archivedStudents],
    };

    return {
      db: updatedDb,
      report: {
        schoolYearId: year.id,
        nextSchoolYearId: nextYear.id,
        students: counts.students,
        promoted: counts.promoted,
        repeated: counts.repeated,
        dismissed: counts.dismissed,
        review: counts.review,
        preparedNextYear: preparedStudents.length,
        skippedCapacity,
        skippedNoDestination,
        skippedExisting,
      },
    };
  }
}
