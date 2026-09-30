import { localDateIso } from '../../services/dateFormat';
import { DateInput } from '../common/DateInput';
import { reportInvalidDates } from '../../services/dateInputValidation';
import { formatDate } from '../../services/dateFormat';
import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Save, UsersRound } from 'lucide-react';
import { AttendanceRecord, DatabaseSchema } from '../../types/school';
import { StorageService } from '../../services/storage';

interface AttendanceManagerViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type AttendanceDraft = {
  type: AttendanceRecord['type'];
  minutesLate?: number;
  reason?: string;
};

export const AttendanceManagerView: React.FC<AttendanceManagerViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
}) => {
  const currentYear = db.schoolYears.find((year) => year.id === db.currentSchoolYearId);
  const today = localDateIso();
  const initialDate =
    currentYear && today >= currentYear.startDate && today <= currentYear.endDate
      ? today
      : currentYear?.startDate || today;

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedClassId, setSelectedClassId] = useState(db.classes[0]?.id || '');

  const students = useMemo(
    () =>
      db.students
        .filter(
          (student) =>
            student.schoolYearId === db.currentSchoolYearId &&
            student.classId === selectedClassId
        )
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(
            `${b.lastName} ${b.firstName}`
          )
        ),
    [db.students, db.currentSchoolYearId, selectedClassId]
  );

  const recordsForDay = useMemo(
    () =>
      db.attendanceRecords.filter(
        (record) =>
          record.classId === selectedClassId &&
          record.date === selectedDate &&
          (!record.schoolYearId || record.schoolYearId === db.currentSchoolYearId)
      ),
    [db.attendanceRecords, selectedClassId, selectedDate, db.currentSchoolYearId]
  );

  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});

  const getDraft = (studentId: string): AttendanceDraft => {
    if (drafts[studentId]) return drafts[studentId];
    const existing = recordsForDay.find((record) => record.studentId === studentId);
    return existing
      ? {
          type: existing.type,
          minutesLate: existing.minutesLate,
          reason: existing.reason,
        }
      : { type: 'PRESENT' };
  };

  const setDraft = (studentId: string, patch: Partial<AttendanceDraft>) => {
    const current = getDraft(studentId);
    setDrafts((value) => ({
      ...value,
      [studentId]: { ...current, ...patch },
    }));
  };

  const markAllPresent = () => {
    const next: Record<string, AttendanceDraft> = {};
    students.forEach((student) => {
      next[student.id] = { type: 'PRESENT' };
    });
    setDrafts(next);
  };

  const saveAttendance = () => {
    if (!selectedDate) { onShowToast('Choisissez une date d’appel valide.', 'error'); return; }
    if (reportInvalidDates()) return;
    const studentIds = new Set(students.map((student) => student.id));
    const preserved = db.attendanceRecords.filter(
      (record) =>
        !(
          record.classId === selectedClassId &&
          record.date === selectedDate &&
          studentIds.has(record.studentId)
        )
    );

    const saved: AttendanceRecord[] = students.map((student, index) => {
      const draft = getDraft(student.id);
      return {
        id: `att-${db.currentSchoolYearId}-${selectedDate}-${student.id}-${index}`,
        studentId: student.id,
        classId: selectedClassId,
        schoolYearId: db.currentSchoolYearId,
        date: selectedDate,
        type: draft.type,
        minutesLate:
          draft.type === 'RETARD' ? Math.max(1, Number(draft.minutesLate) || 5) : undefined,
        reason:
          draft.type === 'PRESENT' ? undefined : draft.reason?.trim() || undefined,
      };
    });

    const updated: DatabaseSchema = {
      ...db,
      attendanceRecords: [...preserved, ...saved],
    };
    StorageService.saveDatabase(updated);
    onUpdateDb(updated);
    setDrafts({});
    onShowToast(`Appel enregistré pour ${students.length} élève(s).`, 'success');
  };

  const daySummary = students.reduce(
    (acc, student) => {
      const type = getDraft(student.id).type;
      acc[type] += 1;
      return acc;
    },
    {
      PRESENT: 0,
      ABSENT_JUSTIFIE: 0,
      ABSENT_NON_JUSTIFIE: 0,
      RETARD: 0,
    } as Record<AttendanceRecord['type'], number>
  );

  const yearRecords = db.attendanceRecords.filter(
    (record) =>
      (!record.schoolYearId || record.schoolYearId === db.currentSchoolYearId) &&
      students.some((student) => student.id === record.studentId)
  );

  const yearStats = students.map((student) => {
    const records = yearRecords.filter((record) => record.studentId === student.id);
    return {
      student,
      unjustified: records.filter((record) => record.type === 'ABSENT_NON_JUSTIFIE').length,
      justified: records.filter((record) => record.type === 'ABSENT_JUSTIFIE').length,
      late: records.filter((record) => record.type === 'RETARD').length,
    };
  });

  const yearTotals = yearStats.reduce(
    (totals, item) => ({
      justified: totals.justified + item.justified,
      unjustified: totals.unjustified + item.unjustified,
      late: totals.late + item.late,
    }),
    { justified: 0, unjustified: 0, late: 0 }
  );

  if (db.classes.length === 0) {
    return (
      <div className="page-panel p-8 text-center">
        <div className="text-sm font-semibold">Aucune classe configurée</div>
        <p className="mt-2 text-[0.6875rem] text-slate-500">
          Ajoutez vos classes dans Paramètres avant de commencer l’appel quotidien.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="page-panel p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-[190px]">
            <span className="block mb-1 text-[0.5625rem] font-bold uppercase tracking-wide text-slate-500">
              Classe
            </span>
            <select
              value={selectedClassId}
              onChange={(event) => {
                setSelectedClassId(event.target.value);
                setDrafts({});
              }}
              className="settings-input"
            >
              {db.classes.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="block mb-1 text-[0.5625rem] font-bold uppercase tracking-wide text-slate-500">
              Date de l’appel
            </span>
            <DateInput
              type="date"
              value={selectedDate}
              min={currentYear?.startDate}
              max={currentYear?.endDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setDrafts({});
              }}
              className="settings-input"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={markAllPresent} className="button button--secondary">
            <CheckCircle2 className="w-4 h-4" />
            Tous présents
          </button>
          <button type="button" onClick={saveAttendance} className="button button--primary">
            <Save className="w-4 h-4" />
            Enregistrer l’appel
          </button>
        </div>
      </div>

      <div className="attendance-summary">
        <div>
          <span>Présents</span>
          <strong>{daySummary.PRESENT}</strong>
        </div>
        <div>
          <span>Abs. justifiées</span>
          <strong>{daySummary.ABSENT_JUSTIFIE}</strong>
        </div>
        <div>
          <span>Abs. non justifiées</span>
          <strong>{daySummary.ABSENT_NON_JUSTIFIE}</strong>
        </div>
        <div>
          <span>Retards</span>
          <strong>{daySummary.RETARD}</strong>
        </div>
      </div>

      <section className="page-panel overflow-hidden">
        <div className="page-panel__header">
          <div>
            <h2 className="page-panel__title">Appel quotidien</h2>
            <p className="page-panel__subtitle">
              {students.length} élève(s) · {formatDate(selectedDate)}
            </p>
          </div>
          <CalendarDays className="w-4 h-4 text-slate-400" />
        </div>

        <div className="overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Matricule</th>
                <th>Élève</th>
                <th>État</th>
                <th>Minutes de retard</th>
                <th>Motif / justification</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const draft = getDraft(student.id);
                return (
                  <tr key={student.id}>
                    <td className="font-mono text-slate-500">{student.matricule}</td>
                    <td className="font-semibold">
                      {student.lastName} {student.firstName}
                    </td>
                    <td>
                      <select
                        value={draft.type}
                        onChange={(event) =>
                          setDraft(student.id, {
                            type: event.target.value as AttendanceRecord['type'],
                            minutesLate:
                              event.target.value === 'RETARD'
                                ? draft.minutesLate || 5
                                : undefined,
                          })
                        }
                        className="settings-input min-w-[190px]"
                      >
                        <option value="PRESENT">Présent</option>
                        <option value="RETARD">Retard</option>
                        <option value="ABSENT_JUSTIFIE">Absent justifié</option>
                        <option value="ABSENT_NON_JUSTIFIE">Absent non justifié</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        disabled={draft.type !== 'RETARD'}
                        value={draft.minutesLate || ''}
                        onChange={(event) =>
                          setDraft(student.id, { minutesLate: Number(event.target.value) })
                        }
                        className="settings-input w-24"
                      />
                    </td>
                    <td>
                      <input
                        value={draft.reason || ''}
                        disabled={draft.type === 'PRESENT'}
                        onChange={(event) =>
                          setDraft(student.id, { reason: event.target.value })
                        }
                        placeholder={
                          draft.type === 'ABSENT_JUSTIFIE'
                            ? 'Ex. certificat médical'
                            : draft.type === 'RETARD'
                            ? 'Ex. transport'
                            : 'Observation'
                        }
                        className="settings-input min-w-[260px]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="page-panel overflow-hidden">
        <div className="page-panel__header attendance-year-header">
          <div>
            <h2 className="page-panel__title">Suivi annuel de la classe</h2>
            <p className="page-panel__subtitle">Absences et retards cumulés sur l’année active.</p>
          </div>
          <div className="attendance-year-summary" aria-label="Totaux annuels de la classe">
            <span>
              <em>Justifiées</em>
              <strong>{yearTotals.justified}</strong>
            </span>
            <span>
              <em>Non justifiées</em>
              <strong>{yearTotals.unjustified}</strong>
            </span>
            <span>
              <em>Retards</em>
              <strong>{yearTotals.late}</strong>
            </span>
            <UsersRound className="w-4 h-4 text-slate-400" />
          </div>
        </div>
        <div className="overflow-x-auto attendance-year-scroll">
          <table className="erp-table attendance-year-table">
            <thead>
              <tr>
                <th>Élève</th>
                <th className="text-right">Abs. justifiées</th>
                <th className="text-right">Abs. non justifiées</th>
                <th className="text-right">Retards</th>
              </tr>
            </thead>
            <tbody>
              {yearStats.map((item) => (
                <tr key={item.student.id}>
                  <td className="font-semibold">
                    {item.student.lastName} {item.student.firstName}
                  </td>
                  <td className="attendance-number-cell">
                    <span
                      className={`attendance-count attendance-count--justified ${item.justified === 0 ? 'is-zero' : ''}`}
                    >
                      {item.justified}
                    </span>
                  </td>
                  <td className="attendance-number-cell">
                    <span
                      className={`attendance-count attendance-count--unjustified ${item.unjustified === 0 ? 'is-zero' : ''}`}
                    >
                      {item.unjustified}
                    </span>
                  </td>
                  <td className="attendance-number-cell">
                    <span
                      className={`attendance-count attendance-count--late ${item.late === 0 ? 'is-zero' : ''}`}
                    >
                      {item.late}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
