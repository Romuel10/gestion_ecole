import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Calculator,
  Printer,
  Save,
  BookOpen,
  Award,
  Sliders,
  Calendar,
} from 'lucide-react';
import {
  DatabaseSchema,
  GradeEntry,
  TermType,
  ReportCardSummary,
} from '../../types/school';
import { CalculationService } from '../../services/calculations';
import { StorageService } from '../../services/storage';
import { PdfGeneratorService } from '../../services/pdfGenerator';
import { Modal } from '../common/Modal';

interface GradesAndReportCardsViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialClassId?: string;
}

export const GradesAndReportCardsView: React.FC<GradesAndReportCardsViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
  initialClassId,
}) => {
  const [activeTab, setActiveTab] = useState<
    'REPORT_CARDS' | 'ENTRY_MATRIX' | 'DELIBERATION_SHEET' | 'ATTENDANCE_SHEET'
  >('REPORT_CARDS');

  const [selectedClassId, setSelectedClassId] = useState<string>(
    initialClassId || db.classes[0]?.id || ''
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    db.subjects[0]?.id || ''
  );
  const [selectedTerm, setSelectedTerm] = useState<TermType>(db.currentTermCode);

  // Passing grade threshold for deliberations (customizable)
  const [passingThreshold, setPassingThreshold] = useState<number>(
    db.schoolConfig.passingGrade || 10.0
  );

  // Selected Report Card for On-screen Interactive Inspection
  const [inspectSummary, setInspectSummary] = useState<ReportCardSummary | null>(null);

  const targetClass = db.classes.find((c) => c.id === selectedClassId) || db.classes[0];
  const activeSchoolYear = db.schoolYears.find((year) => year.id === db.currentSchoolYearId);
  const configuredTerms = activeSchoolYear?.terms || [];
  const selectedTermLabel =
    configuredTerms.find((term) => term.code === selectedTerm)?.label || selectedTerm;
  const studentsInClass = db.students.filter(
    (s) => s.classId === selectedClassId && s.schoolYearId === db.currentSchoolYearId
  );

  // Compute all report cards summaries for the selected class & term
  const reportCards = CalculationService.generateClassReportCards(
    db,
    selectedClassId,
    selectedTerm,
    db.currentSchoolYearId
  );
  const gradedReportCards = reportCards.filter((report) => report.totalCoefficients > 0);

  // Local state for Matrix entry
  const [matrixGrades, setMatrixGrades] = useState<{
    [studentId: string]: { dev1: string; dev2: string; exam: string; comment: string };
  }>(() => {
    const initial: { [studentId: string]: { dev1: string; dev2: string; exam: string; comment: string } } = {};
    studentsInClass.forEach((s) => {
      const g = db.grades.find(
        (entry) =>
          entry.studentId === s.id &&
          entry.classId === selectedClassId &&
          entry.subjectId === selectedSubjectId &&
          entry.termCode === selectedTerm &&
          entry.schoolYearId === db.currentSchoolYearId
      );
      initial[s.id] = {
        dev1: g?.evaluations?.[0] !== undefined ? String(g.evaluations[0]) : '',
        dev2: g?.evaluations?.[1] !== undefined ? String(g.evaluations[1]) : '',
        exam: g?.examGrade !== undefined ? String(g.examGrade) : '',
        comment: g?.teacherComment || '',
      };
    });
    return initial;
  });

  // Re-sync matrix when class, subject or term changes
  const handleSelectSubjectOrClass = (classId: string, subjectId: string, term: TermType) => {
    setSelectedClassId(classId);
    setSelectedSubjectId(subjectId);
    setSelectedTerm(term);

    const stus = db.students.filter(
      (s) => s.classId === classId && s.schoolYearId === db.currentSchoolYearId
    );
    const newMatrix: { [studentId: string]: { dev1: string; dev2: string; exam: string; comment: string } } = {};
    stus.forEach((s) => {
      const g = db.grades.find(
        (entry) =>
          entry.studentId === s.id &&
          entry.classId === classId &&
          entry.subjectId === subjectId &&
          entry.termCode === term &&
          entry.schoolYearId === db.currentSchoolYearId
      );
      newMatrix[s.id] = {
        dev1: g?.evaluations?.[0] !== undefined ? String(g.evaluations[0]) : '',
        dev2: g?.evaluations?.[1] !== undefined ? String(g.evaluations[1]) : '',
        exam: g?.examGrade !== undefined ? String(g.examGrade) : '',
        comment: g?.teacherComment || '',
      };
    });
    setMatrixGrades(newMatrix);
  };

  useEffect(() => {
    const requestedClassId =
      initialClassId && db.classes.some((cls) => cls.id === initialClassId)
        ? initialClassId
        : selectedClassId;
    handleSelectSubjectOrClass(requestedClassId, selectedSubjectId, db.currentTermCode);
    setInspectSummary(null);
  }, [db.currentSchoolYearId, db.currentTermCode, initialClassId]);

  const handleSaveGradesMatrix = () => {
    const activeYear = db.schoolYears.find((y) => y.id === db.currentSchoolYearId);
    const activeTerm = activeYear?.terms.find((t) => t.code === selectedTerm);
    if (activeTerm?.isLocked) {
      onShowToast(`${activeTerm.label} est verrouillé : aucune note ne peut être modifiée.`, 'error');
      return;
    }

    const invalidGrade = Object.values(matrixGrades).some((entry) =>
      [entry.dev1, entry.dev2, entry.exam].some((raw) => {
        if (raw === '') return false;
        const value = Number(raw);
        return !Number.isFinite(value) || value < 0 || value > 20;
      })
    );
    if (invalidGrade) {
      onShowToast('Toutes les notes doivent être comprises entre 0 et 20.', 'error');
      return;
    }

    const updatedGrades = [...db.grades];

    studentsInClass.forEach((s) => {
      const entry = matrixGrades[s.id];
      if (!entry) return;

      const evaluations: number[] = [];
      if (entry.dev1 !== '' && !isNaN(Number(entry.dev1))) evaluations.push(Number(entry.dev1));
      if (entry.dev2 !== '' && !isNaN(Number(entry.dev2))) evaluations.push(Number(entry.dev2));

      const examGrade = entry.exam !== '' && !isNaN(Number(entry.exam)) ? Number(entry.exam) : undefined;
      const subjectAverage = CalculationService.computeSubjectAverage(evaluations, examGrade);

      const existingIndex = updatedGrades.findIndex(
        (g) =>
          g.studentId === s.id &&
          g.classId === selectedClassId &&
          g.subjectId === selectedSubjectId &&
          g.termCode === selectedTerm &&
          g.schoolYearId === db.currentSchoolYearId
      );

      const gradeObj: GradeEntry = {
        id: existingIndex >= 0 ? updatedGrades[existingIndex].id : `grd-${Date.now()}-${s.id}`,
        studentId: s.id,
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        termCode: selectedTerm,
        schoolYearId: db.currentSchoolYearId,
        evaluations,
        examGrade,
        subjectAverage,
        teacherComment: entry.comment,
        updatedAt: new Date().toISOString().slice(0, 10),
      };

      if (existingIndex >= 0) {
        updatedGrades[existingIndex] = gradeObj;
      } else {
        updatedGrades.push(gradeObj);
      }
    });

    const updatedDb: DatabaseSchema = {
      ...db,
      grades: updatedGrades,
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    onShowToast('Notes et moyennes enregistrées avec succès !', 'success');
  };

  // Batch Print All Report Cards for Class
  const handleBatchPrintReportCards = () => {
    if (gradedReportCards.length === 0) {
      onShowToast('Aucun bulletin noté disponible à imprimer.', 'error');
      return;
    }
    gradedReportCards.forEach((rc) => {
      PdfGeneratorService.generateOfficialReportCardPDF(rc, db);
    });
    onShowToast(`Génération de ${gradedReportCards.length} bulletins de notes lancée !`, 'success');
  };

  const subjectMap = new Map(db.subjects.map((s) => [s.id, s]));

  // Moyenne annuelle basée sur les périodes réellement configurées par l'établissement.
  const deliberationData = studentsInClass.map((student) => {
    const periods = configuredTerms.map((term) => {
      const report = CalculationService.generateClassReportCards(
        db,
        selectedClassId,
        term.code,
        db.currentSchoolYearId
      ).find((item) => item.studentId === student.id);

      const hasGrades = db.grades.some(
        (grade) =>
          grade.studentId === student.id &&
          grade.classId === selectedClassId &&
          grade.schoolYearId === db.currentSchoolYearId &&
          grade.termCode === term.code &&
          ((grade.evaluations?.length || 0) > 0 || grade.examGrade !== undefined)
      );

      return {
        code: term.code,
        label: term.label,
        average: report?.generalAverage ?? 0,
        hasGrades,
        weight: Math.max(0.1, term.weight || 1),
      };
    });

    const completedPeriods = periods.filter((period) => period.hasGrades);
    const totalWeight = completedPeriods.reduce((sum, period) => sum + period.weight, 0);
    const mag =
      totalWeight > 0
        ? completedPeriods.reduce(
            (sum, period) => sum + period.average * period.weight,
            0
          ) / totalWeight
        : 0;

    let decision = 'En attente de saisie';
    if (completedPeriods.length > 0) {
      decision = 'Admis(e) en classe supérieure';
      if (mag < passingThreshold && mag >= passingThreshold - 1.5) {
        decision = 'Autorisé(e) au rattrapage';
      } else if (mag < passingThreshold - 1.5) {
        decision = 'Redoublement conseillé';
      }
    }

    return {
      student,
      periods,
      hasAnyTerm: completedPeriods.length > 0,
      mag: Math.round(mag * 100) / 100,
      decision,
    };
  }).sort((a, b) => b.mag - a.mag);

  return (
    <div className="space-y-6">
      <div className="page-panel p-3 flex flex-col xl:flex-row xl:items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedClassId}
            onChange={(e) => handleSelectSubjectOrClass(e.target.value, selectedSubjectId, selectedTerm)}
            className="settings-input w-auto min-w-[180px]"
          >
            {db.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>

          {activeTab !== 'DELIBERATION_SHEET' && activeTab !== 'ATTENDANCE_SHEET' && (
            <select
              value={selectedTerm}
              onChange={(e) =>
                handleSelectSubjectOrClass(selectedClassId, selectedSubjectId, e.target.value as TermType)
              }
              className="settings-input w-auto min-w-[150px]"
            >
              {configuredTerms.map((term) => (
                <option key={term.id} value={term.code}>{term.label}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {[
            ['REPORT_CARDS', 'Bulletins'],
            ['ENTRY_MATRIX', 'Saisie des notes'],
            ['DELIBERATION_SHEET', 'Délibération'],
            ['ATTENDANCE_SHEET', 'Feuille d’appel'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id as typeof activeTab)}
              className={`px-3 py-2 rounded-md text-[11px] font-semibold transition ${
                activeTab === id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: BULLETINS DE NOTES */}
      {activeTab === 'REPORT_CARDS' && (
        <div className="space-y-6">
          {/* Class Statistics Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Moyenne de la Classe
              </span>
              <div className="mt-2 text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                {gradedReportCards.length > 0 ? gradedReportCards[0].classGeneralAverage.toFixed(2) : '0.00'} / 20
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Meilleure Moyenne (Max)
              </span>
              <div className="mt-2 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {gradedReportCards.length > 0 ? gradedReportCards[0].classMaxAverage.toFixed(2) : '0.00'} / 20
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Moyenne la Plus Basse
              </span>
              <div className="mt-2 text-2xl font-extrabold text-slate-700 dark:text-slate-300">
                {gradedReportCards.length > 0 ? gradedReportCards[0].classMinAverage.toFixed(2) : '0.00'} / 20
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Taux d'Admission (≥ {db.schoolConfig.passingGrade || 10}/20)
              </span>
              <div className="mt-2 text-2xl font-extrabold text-purple-600 dark:text-purple-400">
                {gradedReportCards.length > 0
                  ? Math.round(
                      (gradedReportCards.filter(
                        (r) => r.generalAverage >= (db.schoolConfig.passingGrade || 10)
                      ).length /
                        gradedReportCards.length) *
                        100
                    )
                  : 0}
                %
              </div>
            </div>
          </div>

          {/* Report Cards Table with Ranks & Mentions */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white m-0">
                  Palmarès Trimestriel — {targetClass.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Total de {gradedReportCards.length} élève(s) classé(s)
                </p>
              </div>

              <button
                onClick={handleBatchPrintReportCards}
                className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition active:scale-95"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Tous les Bulletins de la Classe</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/40">
                    <th className="py-3 px-3">Rang</th>
                    <th className="py-3 px-3">Matricule</th>
                    <th className="py-3 px-3">Nom & Prénoms</th>
                    <th className="py-3 px-3 text-right">Points</th>
                    <th className="py-3 px-3 text-right">Moyenne Générale</th>
                    <th className="py-3 px-3">Distinction / Mention</th>
                    <th className="py-3 px-3 text-center">Absences</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {gradedReportCards.map((rc) => (
                    <tr key={rc.studentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="py-3 px-3 font-bold">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-xl font-extrabold text-xs ${
                            rc.rank === 1
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200'
                              : rc.rank === 2
                              ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
                              : rc.rank === 3
                              ? 'bg-orange-100 text-orange-900 dark:bg-orange-900/60 dark:text-orange-200'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {rc.rank}e
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {rc.student.matricule}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        {rc.student.lastName} {rc.student.firstName}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {rc.totalPoints.toFixed(2)} / {rc.totalCoefficients * 20}
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-sm text-blue-600 dark:text-blue-400">
                        {rc.generalAverage.toFixed(2)} / 20
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            rc.generalAverage >= 14
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : rc.generalAverage >= 10
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {rc.honorMention}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-500">
                        {rc.absencesJustified + rc.absencesUnjustified} j
                      </td>
                      <td className="py-3 px-3 text-right space-x-1.5">
                        <button
                          onClick={() => setInspectSummary(rc)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300"
                        >
                          Aperçu
                        </button>
                        <button
                          onClick={() => PdfGeneratorService.generateOfficialReportCardPDF(rc, db)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm inline-flex items-center space-x-1"
                        >
                          <Printer className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SAISIE MATRICIELLE DES NOTES */}
      {activeTab === 'ENTRY_MATRIX' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <BookOpen className="w-5 h-5 text-blue-600" />
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Sélectionner la matière à noter
                  </label>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) =>
                      handleSelectSubjectOrClass(selectedClassId, e.target.value, selectedTerm)
                    }
                    className="text-sm font-extrabold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    {targetClass.subjects.map((cs) => {
                      const sub = subjectMap.get(cs.subjectId);
                      return (
                        <option key={cs.subjectId} value={cs.subjectId}>
                          {sub?.name || cs.subjectId} (Coefficient {cs.coefficient})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <button
                onClick={handleSaveGradesMatrix}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>Enregistrer la grille de notes</span>
              </button>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-800/40">
                    <th className="py-3 px-3">Matricule</th>
                    <th className="py-3 px-3">Nom & Prénoms</th>
                    <th className="py-3 px-3 text-center">Contrôle 1 (/20)</th>
                    <th className="py-3 px-3 text-center">Contrôle 2 (/20)</th>
                    <th className="py-3 px-3 text-center">Composition (/20)</th>
                    <th className="py-3 px-3 text-right">Moyenne Matière</th>
                    <th className="py-3 px-3">Appréciation Enseignant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {studentsInClass.map((student) => {
                    const row = matrixGrades[student.id] || { dev1: '', dev2: '', exam: '', comment: '' };
                    const evals: number[] = [];
                    if (row.dev1 !== '' && !isNaN(Number(row.dev1))) evals.push(Number(row.dev1));
                    if (row.dev2 !== '' && !isNaN(Number(row.dev2))) evals.push(Number(row.dev2));
                    const exam = row.exam !== '' && !isNaN(Number(row.exam)) ? Number(row.exam) : undefined;
                    const liveAvg = CalculationService.computeSubjectAverage(evals, exam);

                    return (
                      <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {student.matricule}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                          {student.lastName} {student.firstName}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.25"
                            placeholder="-"
                            value={row.dev1}
                            onChange={(e) =>
                              setMatrixGrades({
                                ...matrixGrades,
                                [student.id]: { ...row, dev1: e.target.value },
                              })
                            }
                            className="w-16 text-center text-xs px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border font-mono font-bold"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.25"
                            placeholder="-"
                            value={row.dev2}
                            onChange={(e) =>
                              setMatrixGrades({
                                ...matrixGrades,
                                [student.id]: { ...row, dev2: e.target.value },
                              })
                            }
                            className="w-16 text-center text-xs px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border font-mono font-bold"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.25"
                            placeholder="-"
                            value={row.exam}
                            onChange={(e) =>
                              setMatrixGrades({
                                ...matrixGrades,
                                [student.id]: { ...row, exam: e.target.value },
                              })
                            }
                            className="w-16 text-center text-xs px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-700 font-mono font-extrabold text-blue-700 dark:text-blue-300"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-sm text-blue-600 dark:text-blue-400">
                          {liveAvg > 0 ? liveAvg.toFixed(2) : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            placeholder="Appréciation..."
                            value={row.comment}
                            onChange={(e) =>
                              setMatrixGrades({
                                ...matrixGrades,
                                [student.id]: { ...row, comment: e.target.value },
                              })
                            }
                            className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FICHE SYNOPTIQUE DE DÉLIBÉRATION DU CONSEIL DE CLASSE */}
      {activeTab === 'DELIBERATION_SHEET' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white m-0">
                Fiche de Délibération du Conseil des Professeurs — {targetClass.name}
              </h3>
              <p className="text-xs text-slate-500">
                Synthèse annuelle des 3 trimestres, Moyenne Annuelle Générale (MAG) et décisions de passage
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5 text-xs bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border">
                <Sliders className="w-3.5 h-3.5 text-blue-500" />
                <span className="font-semibold">Seuil de passage :</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  value={passingThreshold}
                  onChange={(e) => setPassingThreshold(Number(e.target.value))}
                  className="w-14 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border text-center font-bold font-mono"
                />
                <span>/ 20</span>
              </div>

              <button
                onClick={() => {
                  window.print();
                  onShowToast("Impression de la fiche de délibération lancée.", 'success');
                }}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer la Fiche du Conseil</span>
              </button>
            </div>
          </div>

          <div id="printable-area" className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-200 dark:border-slate-700">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 border-b text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  <th className="p-2.5">Rang</th>
                  <th className="p-2.5">Matricule</th>
                  <th className="p-2.5">Nom & Prénoms</th>
                  {configuredTerms.map((term) => (
                    <th key={term.id} className="p-2.5 text-right">
                      {term.label}
                    </th>
                  ))}
                  <th className="p-2.5 text-right font-extrabold text-blue-700 dark:text-blue-300">Moyenne annuelle</th>
                  <th className="p-2.5">Décision du Conseil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {deliberationData.map((row, idx) => (
                  <tr key={row.student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="p-2.5 font-bold">{idx + 1}e</td>
                    <td className="p-2.5 font-mono text-slate-500">{row.student.matricule}</td>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                      {row.student.lastName} {row.student.firstName}
                    </td>
                    {row.periods.map((period) => (
                      <td key={period.code} className="p-2.5 text-right font-mono">
                        {period.hasGrades ? period.average.toFixed(2) : '-'}
                      </td>
                    ))}
                    <td className="p-2.5 text-right font-extrabold font-mono text-sm text-blue-600 dark:text-blue-400">
                      {row.hasAnyTerm ? row.mag.toFixed(2) : '-'}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          !row.hasAnyTerm
                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            : row.mag >= passingThreshold
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : row.mag >= passingThreshold - 1.5
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {row.decision}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: FEUILLE D'APPEL / REGISTRE DE PRÉSENCE IMPRIMABLE */}
      {activeTab === 'ATTENDANCE_SHEET' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white m-0">
                Feuille d'Appel Pédagogique — {targetClass.name}
              </h3>
              <p className="text-xs text-slate-500">
                Prête à être imprimée et posée sur le bureau des professeurs pour l'émargement des présences
              </p>
            </div>

            <button
              onClick={() => {
                window.print();
                onShowToast("Impression de la feuille d'appel lancée.", 'success');
              }}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer la Feuille d'Appel (A4)</span>
            </button>
          </div>

          <div id="printable-area" className="p-4 bg-white text-slate-900 rounded-xl border border-slate-300 text-xs space-y-3 font-sans">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <div className="font-extrabold text-sm uppercase">{db.schoolConfig.name}</div>
                <div className="text-[11px] text-slate-600">
                  Registre d'Assiduité Journalière • Classe : <strong>{targetClass.name}</strong>
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-600">
                <div>Année Scolaire : <strong>{db.schoolYears.find((y) => y.id === db.currentSchoolYearId)?.label}</strong></div>
                <div>Mois de : ________________________</div>
              </div>
            </div>

            <table className="w-full text-left text-xs border border-slate-300 border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b">
                  <th className="p-1.5 w-8 text-center">N°</th>
                  <th className="p-1.5 w-24">Matricule</th>
                  <th className="p-1.5 w-48">Nom & Prénoms de l'Élève</th>
                  <th className="p-1 text-center border-l w-8">L</th>
                  <th className="p-1 text-center border-l w-8">M</th>
                  <th className="p-1 text-center border-l w-8">M</th>
                  <th className="p-1 text-center border-l w-8">J</th>
                  <th className="p-1 text-center border-l w-8">V</th>
                  <th className="p-1 text-center border-l w-8">S</th>
                  <th className="p-1 text-center border-l w-8">L</th>
                  <th className="p-1 text-center border-l w-8">M</th>
                  <th className="p-1 text-center border-l w-8">M</th>
                  <th className="p-1 text-center border-l w-8">J</th>
                  <th className="p-1 text-center border-l w-8">V</th>
                  <th className="p-1 text-center border-l w-8">S</th>
                  <th className="p-1.5 border-l">Observations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {studentsInClass.map((s, idx) => (
                  <tr key={s.id} className="h-7">
                    <td className="p-1 text-center text-slate-500">{idx + 1}</td>
                    <td className="p-1 font-mono text-[10px] text-slate-600">{s.matricule}</td>
                    <td className="p-1 font-bold truncate max-w-[180px]">
                      {s.lastName} {s.firstName}
                    </td>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <td key={i} className="border-l text-center p-1" />
                    ))}
                    <td className="p-1 border-l text-[10px] text-slate-400" />
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pt-2 flex items-center justify-between text-[10px] text-slate-500 border-t">
              <div>Légende : P (Présent) • A (Absent injustifié) • J (Justifié) • R (Retard)</div>
              <div>Visa du Professeur Principal / Surveillant : ____________________</div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview for an Official Report Card */}
      {inspectSummary && (
        <Modal
          isOpen={!!inspectSummary}
          onClose={() => setInspectSummary(null)}
          title={`Bulletin — ${inspectSummary.student.lastName} ${inspectSummary.student.firstName}`}
          subtitle={`${inspectSummary.schoolClass.name} • ${
            db.schoolYears
              .find((year) => year.id === inspectSummary.schoolYearId)
              ?.terms.find((term) => term.code === inspectSummary.termCode)?.label ||
            inspectSummary.termCode
          }`}
          maxWidth="4xl"
          actions={
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setInspectSummary(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800"
              >
                Fermer
              </button>
              <button
                onClick={() => PdfGeneratorService.generateOfficialReportCardPDF(inspectSummary, db)}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-1.5 shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Télécharger le PDF Officiel</span>
              </button>
            </div>
          }
        >
          <div className="p-6 rounded-2xl bg-white text-slate-900 border border-slate-300 space-y-4 font-sans text-xs">
            <div className="text-center border-b pb-3">
              <div className="text-xs font-bold text-blue-900">
                {db.schoolConfig.name.toUpperCase()}
              </div>
              <div className="text-[10px] text-slate-500">
                Bulletin de Notes — {
                  db.schoolYears
                    .find((year) => year.id === inspectSummary.schoolYearId)
                    ?.terms.find((term) => term.code === inspectSummary.termCode)?.label ||
                  inspectSummary.termCode
                }
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg border text-xs">
              <div>
                <strong>Élève :</strong> {inspectSummary.student.lastName} {inspectSummary.student.firstName}
              </div>
              <div>
                <strong>Classe :</strong> {inspectSummary.schoolClass.name}
              </div>
              <div>
                <strong>Matricule :</strong> {inspectSummary.student.matricule}
              </div>
              <div>
                <strong>Effectif :</strong> {inspectSummary.classSize} élèves
              </div>
            </div>

            <table className="w-full text-left text-xs border border-slate-300">
              <thead className="bg-slate-100 border-b">
                <tr>
                  <th className="p-2">Matière</th>
                  <th className="p-2 text-center">Coeff</th>
                  <th className="p-2 text-center">C. Continus</th>
                  <th className="p-2 text-center">Compo</th>
                  <th className="p-2 text-right">Moyenne</th>
                  <th className="p-2 text-right">Pts Pondérés</th>
                  <th className="p-2 text-center">Rang</th>
                  <th className="p-2">Appréciation</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inspectSummary.subjectDetails.map((sub) => (
                  <tr key={sub.subjectId}>
                    <td className="p-2 font-bold">{sub.subjectName}</td>
                    <td className="p-2 text-center">{sub.coefficient}</td>
                    <td className="p-2 text-center font-mono">
                      {sub.evaluations.length > 0 ? sub.evaluations.join(' | ') : '-'}
                    </td>
                    <td className="p-2 text-center font-mono">{sub.examGrade !== undefined ? sub.examGrade.toFixed(1) : '-'}</td>
                    <td className="p-2 text-right font-extrabold text-blue-700">{sub.average.toFixed(2)}</td>
                    <td className="p-2 text-right font-mono font-bold">{sub.weightedPoints.toFixed(2)}</td>
                    <td className="p-2 text-center font-bold">{sub.rankInSubject}e</td>
                    <td className="p-2 text-slate-700">{sub.teacherComment || 'Bien'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-100 rounded-xl">
              <div>
                <div className="text-sm font-extrabold text-blue-900">
                  MOYENNE GÉNÉRALE : {inspectSummary.generalAverage.toFixed(2)} / 20
                </div>
                <div className="text-xs font-bold text-slate-700 mt-1">
                  RANG : {inspectSummary.rank}e sur {inspectSummary.classSize} élèves
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-emerald-800">
                  MENTION : {inspectSummary.honorMention}
                </div>
                <div className="text-[11px] text-slate-600 mt-1">
                  Absences : {inspectSummary.absencesJustified + inspectSummary.absencesUnjustified} j
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
