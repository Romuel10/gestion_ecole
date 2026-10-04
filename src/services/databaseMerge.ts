import type { DatabaseSchema } from '../types/school';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));

// Apply only the changes made since base. A delayed network response must not
// replace payments, pupils or configuration saved while it was in flight.
function merge(current: any, base: any, proposed: any): any {
  if (same(base, proposed)) return current;
  if (same(current, base)) return proposed;
  if (Array.isArray(base) && Array.isArray(current) && Array.isArray(proposed) &&
      [...base, ...current, ...proposed].every(item => record(item) && typeof item.id === 'string')) {
    const originals = new Map(base.map(item => [item.id, item]));
    const changes = new Map(proposed.map(item => [item.id, item]));
    const result = new Map(current.map(item => [item.id, item]));
    for (const [id, original] of originals) {
      if (!changes.has(id)) result.delete(id);
      else if (!same(original, changes.get(id))) {
        result.set(id, merge(result.get(id), original, changes.get(id)));
      }
    }
    for (const [id, item] of changes) if (!originals.has(id)) result.set(id, item);
    return [...result.values()];
  }
  if (record(base) && record(current) && record(proposed)) {
    const result = { ...current };
    for (const key of new Set([...Object.keys(base), ...Object.keys(proposed)])) {
      if (same(base[key], proposed[key])) continue;
      if (!(key in proposed)) delete result[key];
      else result[key] = merge(current[key], base[key], proposed[key]);
    }
    return result;
  }
  return proposed;
}

export function mergeDatabaseChanges(current: DatabaseSchema, base: DatabaseSchema, proposed: DatabaseSchema): DatabaseSchema {
  return merge(current, base, proposed);
}

export function mergeTeacherChanges(current: DatabaseSchema, base: DatabaseSchema, proposed: DatabaseSchema): DatabaseSchema {
  if (current.currentSchoolYearId !== base.currentSchoolYearId) throw new Error('Année scolaire modifiée pendant la synchronisation. Réessayez.');
  const key = (grade: DatabaseSchema['grades'][number]) =>
    `${grade.studentId}|${grade.classId}|${grade.subjectId}|${grade.termCode}|${grade.schoolYearId}`;
  const originals = new Map(base.grades.map(grade => [key(grade), grade]));
  const present = new Set(current.grades.map(key));
  const concurrent = new Map(current.grades.filter(grade => !same(grade, originals.get(key(grade)))).map(grade => [key(grade), grade]));
  const guarded = {
    ...proposed,
    grades: proposed.grades.filter(grade => !originals.has(key(grade)) || present.has(key(grade))).map(grade => {
      const saved = concurrent.get(key(grade));
      return saved ? (originals.get(key(grade)) ?? saved) : grade;
    }),
  };
  return mergeDatabaseChanges(current, base, guarded);
}
