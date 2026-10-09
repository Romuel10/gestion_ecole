import { DatabaseSchema, TimetableSlot } from '../types/school';

export interface TimetableGenerationResult {
  slots: TimetableSlot[];
  unassigned: {
    classId: string;
    subjectId: string;
    teacherId?: string;
    sessionsMissing: number;
    reason: string;
  }[];
}

const GRID = [
  { day: 1 as const, start: '07:30', end: '09:30' },
  { day: 1 as const, start: '09:45', end: '11:45' },
  { day: 1 as const, start: '13:30', end: '15:30' },
  { day: 1 as const, start: '15:45', end: '17:45' },
  { day: 2 as const, start: '07:30', end: '09:30' },
  { day: 2 as const, start: '09:45', end: '11:45' },
  { day: 2 as const, start: '13:30', end: '15:30' },
  { day: 2 as const, start: '15:45', end: '17:45' },
  { day: 3 as const, start: '07:30', end: '09:30' },
  { day: 3 as const, start: '09:45', end: '11:45' },
  { day: 4 as const, start: '07:30', end: '09:30' },
  { day: 4 as const, start: '09:45', end: '11:45' },
  { day: 4 as const, start: '13:30', end: '15:30' },
  { day: 4 as const, start: '15:45', end: '17:45' },
  { day: 5 as const, start: '07:30', end: '09:30' },
  { day: 5 as const, start: '09:45', end: '11:45' },
  { day: 5 as const, start: '13:30', end: '15:30' },
  { day: 5 as const, start: '15:45', end: '17:45' },
];

export class TimetableGeneratorService {
  static generate(db: DatabaseSchema): TimetableGenerationResult {
    const slots: TimetableSlot[] = [];
    const unassigned: TimetableGenerationResult['unassigned'] = [];

    const subjectMap = new Map(db.subjects.map((subject) => [subject.id, subject]));
    const teacherBusy = new Set<string>();
    const classBusy = new Set<string>();
    const roomBusy = new Set<string>();

    const key = (day: number, start: string, entity: string) =>
      `${entity}|${day}|${start}`;

    const orderedClasses = [...db.classes].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    orderedClasses.forEach((schoolClass) => {
      const configuredSubjects = [...schoolClass.subjects].sort(
        (a, b) => (b.weeklyHours || 0) - (a.weeklyHours || 0)
      );

      configuredSubjects.forEach((subjectConfig, subjectIndex) => {
        const weeklyHours = subjectConfig.weeklyHours ?? 2;
        if (weeklyHours === 0) return;
        if (!Number.isFinite(weeklyHours) || weeklyHours < 0) {
          unassigned.push({classId: schoolClass.id,subjectId: subjectConfig.subjectId,sessionsMissing: 0,reason: 'Volume horaire invalide.'});
          return;
        }
        if (!subjectConfig.teacherId) {
          unassigned.push({
            classId: schoolClass.id,
            subjectId: subjectConfig.subjectId,
            sessionsMissing: Math.max(1, Math.ceil((subjectConfig.weeklyHours || 2) / 2)),
            reason: 'Aucun enseignant affecté à cette matière.',
          });
          return;
        }

        const requiredSessions = Math.max(1, Math.ceil(weeklyHours / 2));
        let assigned = 0;
        const usedDays = new Set<number>();

        for (let pass = 0; pass < 2 && assigned < requiredSessions; pass += 1) {
          for (let i = 0; i < GRID.length && assigned < requiredSessions; i += 1) {
            const gridIndex =
              (subjectIndex * 3 + orderedClasses.indexOf(schoolClass) * 2 + i) %
              GRID.length;
            const cell = GRID[gridIndex];

            if (pass === 0 && usedDays.has(cell.day)) continue;

            const teacherKey = key(cell.day, cell.start, subjectConfig.teacherId);
            const classKey = key(cell.day, cell.start, schoolClass.id);
            const roomKey = key(
              cell.day,
              cell.start,
              schoolClass.room.trim().toLowerCase()
            );

            if (
              teacherBusy.has(teacherKey) ||
              classBusy.has(classKey) ||
              roomBusy.has(roomKey)
            ) {
              continue;
            }

            teacherBusy.add(teacherKey);
            classBusy.add(classKey);
            roomBusy.add(roomKey);
            usedDays.add(cell.day);

            slots.push({
              id: `tt-auto-${schoolClass.id}-${subjectConfig.subjectId}-${assigned + 1}`,
              dayOfWeek: cell.day,
              startTime: cell.start,
              endTime: (() => {
                const [hour, minute] = cell.start.split(':').map(Number);
                const end = hour * 60 + minute + Math.min(120, Math.round(weeklyHours * 60) - assigned * 120);
                return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
              })(),
              classId: schoolClass.id,
              subjectId: subjectConfig.subjectId,
              teacherId: subjectConfig.teacherId,
              room: schoolClass.room,
              color: subjectMap.get(subjectConfig.subjectId)?.color || '#64748b',
            });
            assigned += 1;
          }
        }

        if (assigned < requiredSessions) {
          unassigned.push({
            classId: schoolClass.id,
            subjectId: subjectConfig.subjectId,
            teacherId: subjectConfig.teacherId,
            sessionsMissing: requiredSessions - assigned,
            reason: 'Aucun créneau libre compatible avec la classe, l’enseignant et la salle.',
          });
        }
      });
    });

    return { slots, unassigned };
  }
}
