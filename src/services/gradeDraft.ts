import type { GradeEntry } from '../types/school';
import { CalculationService } from './calculations';

export interface GradeDraft { dev1: string; dev2: string; exam: string; comment: string }

// An Excel correction must not be overwritten by an old cloud assessment on
// the next pull. Keep cloud links only for values that were not changed.
export function protectImportedGrade(existing: GradeEntry | undefined, imported: GradeEntry): GradeEntry {
  const ignored = new Set(existing?.cloudIgnoredEvaluationIds ?? []);
  existing?.cloudEvaluationIds?.forEach((id, index) => {
    if (id && (existing.evaluations[index] !== imported.evaluations[index] || (existing.evaluationWeights?.[index] ?? 1) !== (imported.evaluationWeights?.[index] ?? 1))) ignored.add(id);
  });
  const cloudEvaluationIds = imported.evaluations.map((value, index) => value === existing?.evaluations[index] && (imported.evaluationWeights?.[index] ?? 1) === (existing?.evaluationWeights?.[index] ?? 1) ? existing?.cloudEvaluationIds?.[index] ?? null : null);
  const examChanged = imported.examGrade !== existing?.examGrade || (imported.cloudExamCoefficient ?? 1) !== (existing?.cloudExamCoefficient ?? 1);
  const ignoredExams = new Set(existing?.cloudIgnoredExamAssessmentIds ?? []);
  if (examChanged && existing?.cloudExamAssessmentId) ignoredExams.add(existing.cloudExamAssessmentId);
  return { ...imported, cloudEvaluationIds, cloudIgnoredEvaluationIds: ignored.size ? [...ignored] : undefined, cloudExamAssessmentId: examChanged ? undefined : existing?.cloudExamAssessmentId, cloudIgnoredExamAssessmentIds: ignoredExams.size ? [...ignoredExams] : undefined };
}

export function applyGradeDraft(existing: GradeEntry | undefined, draft: GradeDraft,
  identity: Pick<GradeEntry, 'id' | 'studentId' | 'classId' | 'subjectId' | 'termCode' | 'schoolYearId'>,
  continuousWeight = 1, examWeight = 2): GradeEntry {
  const evaluations: number[] = [];
  const evaluationWeights: number[] = [];
  const cloudEvaluationIds: Array<string | null> = [];
  const ignored = new Set(existing?.cloudIgnoredEvaluationIds ?? []);
  const values = [draft.dev1, draft.dev2, ...(existing?.evaluations.slice(2).map(String) ?? [])];
  values.forEach((raw, index) => {
    const value = raw === '' ? undefined : Number(raw);
    const changed = value !== existing?.evaluations[index];
    const cloudId = existing?.cloudEvaluationIds?.[index];
    if (changed && cloudId) ignored.add(cloudId);
    if (value === undefined) return;
    evaluations.push(value);
    evaluationWeights.push(changed ? 1 : existing?.evaluationWeights?.[index] ?? 1);
    cloudEvaluationIds.push(changed ? null : cloudId ?? null);
  });
  const examGrade = draft.exam === '' ? undefined : Number(draft.exam);
  const examChanged = examGrade !== existing?.examGrade;
  const ignoredExams = new Set(existing?.cloudIgnoredExamAssessmentIds ?? []);
  if (examChanged && existing?.cloudExamAssessmentId) ignoredExams.add(existing.cloudExamAssessmentId);
  const cloudExamCoefficient = examChanged ? undefined : existing?.cloudExamCoefficient;
  return {
    ...existing, ...identity, evaluations, evaluationWeights, cloudEvaluationIds,
    cloudIgnoredEvaluationIds: ignored.size ? [...ignored] : undefined,
    examGrade, cloudExamAssessmentId: examChanged ? undefined : existing?.cloudExamAssessmentId,
    cloudExamCoefficient, cloudIgnoredExamAssessmentIds: ignoredExams.size ? [...ignoredExams] : undefined,
    subjectAverage: CalculationService.computeSubjectAverage(evaluations, examGrade, continuousWeight,
      examWeight * (cloudExamCoefficient ?? 1), evaluationWeights),
    teacherComment: draft.comment,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}
