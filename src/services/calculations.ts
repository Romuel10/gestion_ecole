import {
  AnnualDecisionResult,
  DatabaseSchema,
  Student,
  TermType,
  ReportCardSummary,
  GradeEntry,
} from '../types/school';

export class CalculationService {
  /**
   * Computes the average for a single subject grade entry
   * Formula: If exam exists, (Average(evaluations) + examGrade*2) / 3 or (Avg(evaluations) + examGrade) / 2
   * Standard Malagasy Secondary formula: Controles 40%, Compositions 60% or (Devoirs + Exam*2)/3
   */
  static computeSubjectAverage(
    evaluations: number[],
    examGrade?: number,
    continuousWeight = 1,
    examWeight = 2
  ): number {
    if ((!evaluations || evaluations.length === 0) && examGrade === undefined) {
      return 0;
    }

    let devAvg = 0;
    if (evaluations && evaluations.length > 0) {
      const sum = evaluations.reduce((acc, val) => acc + val, 0);
      devAvg = sum / evaluations.length;
    }

    if (examGrade !== undefined && evaluations && evaluations.length > 0) {
      const safeContinuousWeight = Math.max(0, continuousWeight);
      const safeExamWeight = Math.max(0, examWeight);
      const totalWeight = safeContinuousWeight + safeExamWeight || 1;
      const finalVal =
        (devAvg * safeContinuousWeight + examGrade * safeExamWeight) / totalWeight;
      return Math.round(finalVal * 100) / 100;
    } else if (examGrade !== undefined) {
      return Math.round(examGrade * 100) / 100;
    } else {
      return Math.round(devAvg * 100) / 100;
    }
  }

  /**
   * Computes honors and mentions based on general average (Barème officiel sur 20)
   */
  static getHonorMention(average: number): string {
    if (average >= 16) return 'Félicitations (Tableau d\'Honneur)';
    if (average >= 14) return 'Encouragements (Tableau d\'Honneur)';
    if (average >= 12) return 'Tableau d\'Honneur';
    if (average >= 10) return 'Travail Satisfaisant (Admis)';
    if (average >= 8) return 'Avertissement de Travail';
    return 'Blâme de Travail';
  }

  /**
   * Generates complete ReportCard summaries for an entire class for a given term
   */
  static generateClassReportCards(
    db: DatabaseSchema,
    classId: string,
    termCode: TermType,
    schoolYearId?: string
  ): ReportCardSummary[] {
    const activeYearId = schoolYearId || db.currentSchoolYearId;
    const targetClass = db.classes.find(c => c.id === classId);
    if (!targetClass) return [];

    const students = db.students.filter(s => s.classId === classId && s.schoolYearId === activeYearId);
    if (students.length === 0) return [];

    const teacherMap = new Map(db.teachers.map(t => [t.id, `${t.lastName} ${t.firstName}`]));
    const subjectMap = new Map(db.subjects.map(s => [s.id, s]));

    // 1. Calculate subject averages for each student
    const studentSummaries: {
      student: Student;
      subjectDetails: ReportCardSummary['subjectDetails'];
      totalPoints: number;
      totalCoefficients: number;
      generalAverage: number;
      absencesJustified: number;
      absencesUnjustified: number;
      latenessCount: number;
      conductGrade: number;
    }[] = [];

    // Map of grades for quick lookup
    const gradeMap = new Map<string, GradeEntry>();
    db.grades
      .filter(g => g.classId === classId && g.termCode === termCode && g.schoolYearId === activeYearId)
      .forEach(g => {
        gradeMap.set(`${g.studentId}_${g.subjectId}`, g);
      });

    // Map of attendance. AttendanceRecord does not carry a schoolYearId/termCode,
    // so the active term dates are the source of truth for report-card attendance.
    const activeYear = db.schoolYears.find(y => y.id === activeYearId);
    const activeTerm = activeYear?.terms.find(t => t.code === termCode);
    const attendanceMap = new Map<string, { just: number; unjust: number; late: number }>();
    db.attendanceRecords
      .filter(a =>
        a.classId === classId &&
        (!activeTerm || (a.date >= activeTerm.startDate && a.date <= activeTerm.endDate))
      )
      .forEach(a => {
        const cur = attendanceMap.get(a.studentId) || { just: 0, unjust: 0, late: 0 };
        if (a.type === 'ABSENT_JUSTIFIE') cur.just++;
        if (a.type === 'ABSENT_NON_JUSTIFIE') cur.unjust++;
        if (a.type === 'RETARD') cur.late++;
        attendanceMap.set(a.studentId, cur);
      });

    students.forEach(student => {
      let totalPts = 0;
      let totalCoeff = 0;
      const subDetails: ReportCardSummary['subjectDetails'] = [];

      targetClass.subjects.forEach(cs => {
        const sub = subjectMap.get(cs.subjectId);
        if (!sub) return;

        const grade = gradeMap.get(`${student.id}_${cs.subjectId}`);
        const hasRecordedGrade = Boolean(
          grade && ((grade.evaluations?.length || 0) > 0 || grade.examGrade !== undefined)
        );
        const avg =
          hasRecordedGrade && grade
            ? this.computeSubjectAverage(
                grade.evaluations || [],
                grade.examGrade,
                db.schoolConfig.continuousAssessmentWeight ?? 1,
                db.schoolConfig.examWeight ?? 2
              )
            : 0;
        const pts = hasRecordedGrade ? avg * cs.coefficient : 0;

        // A subject that has not been graded yet must not lower the student's average.
        if (hasRecordedGrade) {
          totalPts += pts;
          totalCoeff += cs.coefficient;
        }

        subDetails.push({
          subjectId: cs.subjectId,
          subjectName: sub.name,
          subjectCode: sub.code,
          coefficient: cs.coefficient,
          evaluations: grade?.evaluations || [],
          examGrade: grade?.examGrade,
          average: avg,
          weightedPoints: Math.round(pts * 100) / 100,
          teacherName: cs.teacherId ? teacherMap.get(cs.teacherId) : undefined,
          teacherComment: grade?.teacherComment || '',
          rankInSubject: 1, // Will be computed in 2nd pass
          classMax: 0,
          classMin: 0,
          classAvg: 0,
        });
      });

      const genAvg = totalCoeff > 0 ? Math.round((totalPts / totalCoeff) * 100) / 100 : 0;
      const att = attendanceMap.get(student.id) || { just: 0, unjust: 0, late: 0 };

      // Deduct conduct points based on unjust absences & lateness (out of 20)
      const conductGrade = Math.max(0, 20 - (att.unjust * 2) - Math.floor(att.late * 0.5));

      studentSummaries.push({
        student,
        subjectDetails: subDetails,
        totalPoints: Math.round(totalPts * 100) / 100,
        totalCoefficients: totalCoeff,
        generalAverage: genAvg,
        absencesJustified: att.just,
        absencesUnjustified: att.unjust,
        latenessCount: att.late,
        conductGrade,
      });
    });

    // 2. Compute class statistics and rankings
    const allGenAvgs = studentSummaries
      .filter((summary) => summary.totalCoefficients > 0)
      .map((summary) => summary.generalAverage);
    const classMaxAvg = allGenAvgs.length > 0 ? Math.max(...allGenAvgs) : 0;
    const classMinAvg = allGenAvgs.length > 0 ? Math.min(...allGenAvgs) : 0;
    const classGenAvg = allGenAvgs.length > 0
      ? Math.round((allGenAvgs.reduce((a, b) => a + b, 0) / allGenAvgs.length) * 100) / 100
      : 0;

    // Rank students by General Average descending
    const sortedIndices = [...studentSummaries.keys()].sort(
      (a, b) => studentSummaries[b].generalAverage - studentSummaries[a].generalAverage
    );

    const rankMap = new Map<number, number>();
    let previousGeneralAverage: number | undefined;
    let previousGeneralRank = 0;
    sortedIndices.forEach((studentIdx, rankIndex) => {
      const currentAverage = studentSummaries[studentIdx].generalAverage;
      const currentRank =
        previousGeneralAverage !== undefined && currentAverage === previousGeneralAverage
          ? previousGeneralRank
          : rankIndex + 1;
      rankMap.set(studentIdx, currentRank);
      previousGeneralAverage = currentAverage;
      previousGeneralRank = currentRank;
    });

    // Subject statistics
    targetClass.subjects.forEach(cs => {
      const studentsWithGrade = [...studentSummaries.keys()].filter((studentIdx) => {
        const studentId = studentSummaries[studentIdx].student.id;
        const grade = gradeMap.get(`${studentId}_${cs.subjectId}`);
        return Boolean(grade && ((grade.evaluations?.length || 0) > 0 || grade.examGrade !== undefined));
      });
      const subjectScores = studentsWithGrade.map((studentIdx) => {
        const item = studentSummaries[studentIdx].subjectDetails.find(sd => sd.subjectId === cs.subjectId);
        return item?.average ?? 0;
      });

      const maxScore = subjectScores.length > 0 ? Math.max(...subjectScores) : 0;
      const minScore = subjectScores.length > 0 ? Math.min(...subjectScores) : 0;
      const avgScore = subjectScores.length > 0
        ? Math.round((subjectScores.reduce((a, b) => a + b, 0) / subjectScores.length) * 100) / 100
        : 0;

      // Rank only students who actually have a recorded grade for this subject.
      const sortedSubIndices = studentsWithGrade.sort((a, b) => {
        const scoreA = studentSummaries[a].subjectDetails.find(sd => sd.subjectId === cs.subjectId)?.average ?? 0;
        const scoreB = studentSummaries[b].subjectDetails.find(sd => sd.subjectId === cs.subjectId)?.average ?? 0;
        return scoreB - scoreA;
      });

      let previousSubjectAverage: number | undefined;
      let previousSubjectRank = 0;
      sortedSubIndices.forEach((sIdx, subRank) => {
        const detail = studentSummaries[sIdx].subjectDetails.find(sd => sd.subjectId === cs.subjectId);
        if (detail) {
          const currentRank =
            previousSubjectAverage !== undefined && detail.average === previousSubjectAverage
              ? previousSubjectRank
              : subRank + 1;
          detail.classMax = maxScore;
          detail.classMin = minScore;
          detail.classAvg = avgScore;
          detail.rankInSubject = currentRank;
          previousSubjectAverage = detail.average;
          previousSubjectRank = currentRank;
        }
      });

      // Keep statistics meaningful for ungraded students without giving them a fake rank.
      studentSummaries.forEach((summary, studentIdx) => {
        if (studentsWithGrade.includes(studentIdx)) return;
        const detail = summary.subjectDetails.find(sd => sd.subjectId === cs.subjectId);
        if (detail) {
          detail.classMax = maxScore;
          detail.classMin = minScore;
          detail.classAvg = avgScore;
          detail.rankInSubject = 0;
        }
      });
    });

    // 3. Assemble final ReportCardSummary objects
    return studentSummaries.map((s, idx) => {
      const rank = rankMap.get(idx) || 1;
      return {
        studentId: s.student.id,
        student: s.student,
        schoolClass: targetClass,
        termCode,
        schoolYearId: activeYearId,
        subjectDetails: s.subjectDetails,
        totalPoints: s.totalPoints,
        totalCoefficients: s.totalCoefficients,
        generalAverage: s.generalAverage,
        rank,
        classSize: students.length,
        classGeneralAverage: classGenAvg,
        classMaxAverage: classMaxAvg,
        classMinAverage: classMinAvg,
        honorMention: this.getHonorMention(s.generalAverage),
        absencesJustified: s.absencesJustified,
        absencesUnjustified: s.absencesUnjustified,
        latenessCount: s.latenessCount,
        conductGrade: s.conductGrade,
        councilDecision: s.student.councilDecision,
      };
    }).sort((a, b) => a.rank - b.rank);
  }

  static computeAnnualDecisionForStudent(
    db: DatabaseSchema,
    student: Student,
    schoolYearId: string = db.currentSchoolYearId
  ): AnnualDecisionResult {
    const schoolYear = db.schoolYears.find((year) => year.id === schoolYearId);
    const schoolClass = db.classes.find((item) => item.id === student.classId);
    const configuredTerms = schoolYear?.terms || [];

    const periods = configuredTerms.map((term) => {
      const report = this.generateClassReportCards(
        db,
        student.classId,
        term.code,
        schoolYearId
      ).find((item) => item.studentId === student.id);

      const gradedSubjectIds = new Set(
        db.grades
          .filter(
            (grade) =>
              grade.studentId === student.id &&
              grade.classId === student.classId &&
              grade.schoolYearId === schoolYearId &&
              grade.termCode === term.code &&
              ((grade.evaluations?.length || 0) > 0 || grade.examGrade !== undefined)
          )
          .map((grade) => grade.subjectId)
      );
      const hasGrades = gradedSubjectIds.size > 0;
      const isComplete =
        Boolean(schoolClass) &&
        schoolClass.subjects.length > 0 &&
        schoolClass.subjects.every((subject) => gradedSubjectIds.has(subject.subjectId));

      return {
        code: term.code,
        label: term.label,
        average: report?.generalAverage ?? 0,
        weight: Math.max(0.1, term.weight || 1),
        hasGrades,
        isComplete,
      };
    });

    const completedPeriods = periods.filter((period) => period.hasGrades);
    const totalWeight = completedPeriods.reduce((sum, period) => sum + period.weight, 0);
    const annualAverage =
      totalWeight > 0
        ? completedPeriods.reduce(
            (sum, period) => sum + period.average * period.weight,
            0
          ) / totalWeight
        : 0;

    const annualAttendance = db.attendanceRecords.filter(
      (record) =>
        record.studentId === student.id &&
        record.classId === student.classId &&
        (!schoolYear ||
          (record.date >= schoolYear.startDate && record.date <= schoolYear.endDate))
    );
    const unjustifiedAbsences = annualAttendance.filter(
      (record) => record.type === 'ABSENT_NON_JUSTIFIE'
    ).length;
    const latenessCount = annualAttendance.filter((record) => record.type === 'RETARD').length;
    const conductGrade = Math.max(0, 20 - unjustifiedAbsences * 2 - Math.floor(latenessCount * 0.5));

    const requireAllPeriods = db.schoolConfig.requireAllPeriodsForAnnualDecision ?? true;
    const requireAllSubjects = db.schoolConfig.requireAllSubjectsForAnnualDecision ?? true;
    const reasons: string[] = [];

    if (completedPeriods.length === 0) {
      return {
        student,
        annualAverage: 0,
        completedPeriods: 0,
        totalPeriods: configuredTerms.length,
        outcome: 'REVIEW',
        label: 'À examiner',
        reasons: ['Aucune période notée'],
      };
    }

    const completePeriods = periods.filter((period) =>
      requireAllSubjects ? period.isComplete : period.hasGrades
    );

    if (requireAllPeriods && completePeriods.length < configuredTerms.length) {
      reasons.push(
        `${completePeriods.length}/${configuredTerms.length} période(s) complète(s)`
      );
      return {
        student,
        annualAverage: Math.round(annualAverage * 100) / 100,
        completedPeriods: completedPeriods.length,
        totalPeriods: configuredTerms.length,
        outcome: 'REVIEW',
        label: 'À examiner',
        reasons,
      };
    }

    const rules = [...(db.schoolConfig.annualDecisionRules || [])].sort(
      (a, b) => b.minAverage - a.minAverage
    );
    const matchedRule = rules.find((rule) => {
      const averageMatches =
        annualAverage >= rule.minAverage && annualAverage <= rule.maxAverage;
      const absenceMatches =
        rule.maxUnjustifiedAbsences === undefined ||
        unjustifiedAbsences <= rule.maxUnjustifiedAbsences;
      const conductMatches =
        rule.minConductGrade === undefined || conductGrade >= rule.minConductGrade;
      return averageMatches && absenceMatches && conductMatches;
    });

    if (!matchedRule) {
      reasons.push('Aucune règle ne correspond aux résultats de l’élève');
      return {
        student,
        annualAverage: Math.round(annualAverage * 100) / 100,
        completedPeriods: completedPeriods.length,
        totalPeriods: configuredTerms.length,
        outcome: 'REVIEW',
        label: 'À examiner',
        reasons,
      };
    }

    if (
      matchedRule.maxUnjustifiedAbsences !== undefined &&
      unjustifiedAbsences > matchedRule.maxUnjustifiedAbsences
    ) {
      reasons.push(`${unjustifiedAbsences} absence(s) non justifiée(s)`);
    }
    if (
      matchedRule.minConductGrade !== undefined &&
      conductGrade < matchedRule.minConductGrade
    ) {
      reasons.push(`Conduite : ${conductGrade.toFixed(1)}/20`);
    }

    let destinationClassId: string | undefined;
    if (matchedRule.outcome === 'PROMOTE') {
      destinationClassId = schoolClass?.nextClassId;
      if (!destinationClassId) reasons.push('Classe suivante non configurée');
    } else if (matchedRule.outcome === 'REPEAT') {
      destinationClassId = schoolClass?.id;
    }

    const destinationClassName = destinationClassId
      ? db.classes.find((item) => item.id === destinationClassId)?.name
      : undefined;

    return {
      student,
      annualAverage: Math.round(annualAverage * 100) / 100,
      completedPeriods: completedPeriods.length,
      totalPeriods: configuredTerms.length,
      outcome: matchedRule.outcome,
      label: matchedRule.label,
      destinationClassId,
      destinationClassName,
      reasons,
    };
  }

  static computeAnnualDecisionsForClass(
    db: DatabaseSchema,
    classId: string,
    schoolYearId: string = db.currentSchoolYearId
  ): AnnualDecisionResult[] {
    return db.students
      .filter(
        (student) =>
          student.classId === classId && student.schoolYearId === schoolYearId
      )
      .map((student) => this.computeAnnualDecisionForStudent(db, student, schoolYearId))
      .sort((a, b) => b.annualAverage - a.annualAverage);
  }

  static computeAnnualDecisions(
    db: DatabaseSchema,
    schoolYearId: string = db.currentSchoolYearId
  ): AnnualDecisionResult[] {
    return db.students
      .filter((student) => student.schoolYearId === schoolYearId)
      .map((student) => this.computeAnnualDecisionForStudent(db, student, schoolYearId))
      .sort((a, b) => {
        const classCompare = a.student.classId.localeCompare(b.student.classId);
        return classCompare !== 0 ? classCompare : b.annualAverage - a.annualAverage;
      });
  }

  /**
   * Computes financial overview metrics
   */
  static computeFinancialMetrics(db: DatabaseSchema) {
    const activeYearId = db.currentSchoolYearId;
    const totalTuitionCollected = db.tuitionPayments
      .filter(p => p.schoolYearId === activeYearId)
      .reduce((acc, p) => acc + (p.amount || 0), 0);
    const totalSalariesPaid = db.salaryPayments
      .filter(s => s.schoolYearId === activeYearId)
      .reduce((acc, s) => acc + (s.netSalary || 0), 0);

    // Tuition and salary payments are already represented by their dedicated records.
    // Exclude their generated/legacy cash-book entries so the same money is not counted twice.
    const tuitionCategories = new Set(['Écolages & Scolarité', 'Inscriptions & Droits']);
    const salaryCategories = new Set(['Salaires & Vacations']);
    const activeCashTransactions = db.cashTransactions.filter(t => t.schoolYearId === activeYearId);

    const otherRevenues = activeCashTransactions
      .filter(t => t.type === 'RECETTE' && !t.relatedReceiptId && !tuitionCategories.has(t.category))
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    const otherExpenses = activeCashTransactions
      .filter(t => t.type === 'DEPENSE' && !t.relatedReceiptId && !salaryCategories.has(t.category))
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    const grandTotalRevenues = totalTuitionCollected + otherRevenues;
    const grandTotalExpenses = totalSalariesPaid + otherExpenses;
    const netTreasuryBalance = grandTotalRevenues - grandTotalExpenses;

    const totalActiveStudents = db.students.filter(
      s =>
        s.schoolYearId === activeYearId &&
        (s.status === 'INSCRIT' || s.status === 'REINSCRIT')
    ).length;

    return {
      totalTuitionCollected,
      totalSalariesPaid,
      otherRevenues,
      otherExpenses,
      grandTotalRevenues,
      grandTotalExpenses,
      netTreasuryBalance,
      totalActiveStudents,
    };
  }

  /**
   * Currency formatter for Malagasy Ariary (Ar)
   */
  static formatAriary(amount: number): string {
    return new Intl.NumberFormat('fr-MG', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + ' Ar';
  }
}
