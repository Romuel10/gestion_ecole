import React, { useState } from 'react';
import {
  PlusCircle,
  Edit2,
  Trash2,
  Printer,
  AlertTriangle,
  FileDown,
  WandSparkles,
} from 'lucide-react';
import { DatabaseSchema, TimetableSlot } from '../../types/school';
import { StorageService } from '../../services/storage';
import { PdfGeneratorService } from '../../services/pdfGenerator';
import { TimetableGeneratorService } from '../../services/timetableGenerator';
import { Modal } from '../common/Modal';

interface TimetableViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const TimetableView: React.FC<TimetableViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
}) => {
  const [viewType, setViewType] = useState<'CLASS' | 'TEACHER' | 'ROOM'>('CLASS');
  const [selectedEntityId, setSelectedEntityId] = useState<string>(
    db.classes[0]?.id || ''
  );

  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [conflictState, setConflictState] = useState<{
    messages: string[];
    alternatives: { dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6; startTime: string; endTime: string; label: string }[];
  } | null>(null);

  // New/Edit slot form state
  const [slotForm, setSlotForm] = useState({
    dayOfWeek: 1 as 1 | 2 | 3 | 4 | 5 | 6,
    startTime: '07:30',
    endTime: '09:30',
    classId: db.classes[0]?.id || '',
    subjectId: db.subjects[0]?.id || '',
    teacherId: db.teachers[0]?.id || '',
    room: 'Salle 201',
    color: '#3b82f6',
  });

  const days = [
    { id: 1 as const, name: 'Lundi' },
    { id: 2 as const, name: 'Mardi' },
    { id: 3 as const, name: 'Mercredi' },
    { id: 4 as const, name: 'Jeudi' },
    { id: 5 as const, name: 'Vendredi' },
    { id: 6 as const, name: 'Samedi' },
  ];

  const timeSlots = [
    { start: '07:30', end: '09:30', label: '07h30 - 09h30' },
    { start: '09:45', end: '11:45', label: '09h45 - 11h45' },
    { start: '13:30', end: '15:30', label: '13h30 - 15h30' },
    { start: '15:45', end: '17:45', label: '15h45 - 17h45' },
  ];

  const classMap = new Map(db.classes.map((c) => [c.id, c]));
  const teacherMap = new Map(db.teachers.map((t) => [t.id, t]));
  const subjectMap = new Map(db.subjects.map((s) => [s.id, s]));

  // Détection des conflits d'horaires
  const detectConflicts = (newSlot: Partial<TimetableSlot>, excludeId?: string) => {
    const conflicts: string[] = [];

    db.timetableSlots.forEach((slot) => {
      if (excludeId && slot.id === excludeId) return;

      // Check day overlap
      if (slot.dayOfWeek === newSlot.dayOfWeek) {
        // Check real time overlap, not only identical start times.
        const isTimeClash = Boolean(
          newSlot.startTime &&
          newSlot.endTime &&
          slot.startTime < newSlot.endTime &&
          newSlot.startTime < slot.endTime
        );

        if (isTimeClash) {
          // 1. Teacher double-booking
          if (slot.teacherId === newSlot.teacherId && newSlot.teacherId) {
            const tea = teacherMap.get(slot.teacherId);
            const cls = classMap.get(slot.classId);
            conflicts.push(
              `L'enseignant ${tea?.lastName} est déjà affecté à la classe ${cls?.name} sur ce créneau.`
            );
          }

          // 2. Room double-booking
          if (slot.room.toLowerCase() === newSlot.room?.toLowerCase() && newSlot.room) {
            const cls = classMap.get(slot.classId);
            conflicts.push(
              `La salle "${slot.room}" est déjà occupée par la classe ${cls?.name} sur ce créneau.`
            );
          }

          // 3. Class double-booking
          if (slot.classId === newSlot.classId && newSlot.classId) {
            const sub = subjectMap.get(slot.subjectId);
            conflicts.push(
              `La classe a déjà un cours de "${sub?.name}" programmé sur ce créneau.`
            );
          }
        }
      }
    });

    return conflicts;
  };

  const findAvailableAlternatives = (
    candidate: Partial<TimetableSlot>,
    excludeId?: string
  ) => {
    const alternatives: {
      dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6;
      startTime: string;
      endTime: string;
      label: string;
    }[] = [];

    days.forEach((day) => {
      timeSlots.forEach((time) => {
        const testSlot = {
          ...candidate,
          dayOfWeek: day.id,
          startTime: time.start,
          endTime: time.end,
        };
        if (detectConflicts(testSlot, excludeId).length === 0) {
          alternatives.push({
            dayOfWeek: day.id,
            startTime: time.start,
            endTime: time.end,
            label: `${day.name} · ${time.label}`,
          });
        }
      });
    });

    return alternatives.slice(0, 5);
  };

  const buildSlotDefaults = (
    dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 = 1,
    startTime = '07:30',
    endTime = '09:30'
  ) => {
    const defaultClassId =
      viewType === 'CLASS' ? selectedEntityId : db.classes[0]?.id || '';
    const defaultTeacherId =
      viewType === 'TEACHER' ? selectedEntityId : db.teachers[0]?.id || '';
    const defaultRoom =
      viewType === 'ROOM'
        ? selectedEntityId
        : db.classes.find((cls) => cls.id === defaultClassId)?.room || 'Salle 201';

    return {
      dayOfWeek,
      startTime,
      endTime,
      classId: defaultClassId,
      subjectId: db.subjects[0]?.id || '',
      teacherId: defaultTeacherId,
      room: defaultRoom,
      color: '#3b82f6',
    };
  };

  const handleOpenAddModal = () => {
    setEditingSlot(null);
    setConflictState(null);
    setSlotForm(buildSlotDefaults());
    setIsSlotModalOpen(true);
  };

  const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();

    if (!db.classes.some((cls) => cls.id === slotForm.classId)) {
      onShowToast('Veuillez sélectionner une classe valide.', 'error');
      return;
    }
    if (!db.subjects.some((subject) => subject.id === slotForm.subjectId)) {
      onShowToast('Veuillez sélectionner une matière valide.', 'error');
      return;
    }
    if (!db.teachers.some((teacher) => teacher.id === slotForm.teacherId)) {
      onShowToast('Veuillez sélectionner un enseignant valide.', 'error');
      return;
    }
    if (!slotForm.room.trim()) {
      onShowToast('La salle est obligatoire.', 'error');
      return;
    }
    if (slotForm.startTime >= slotForm.endTime) {
      onShowToast('L’heure de fin doit être postérieure à l’heure de début.', 'error');
      return;
    }

    const conflicts = detectConflicts(slotForm, editingSlot?.id);
    if (conflicts.length > 0) {
      setConflictState({
        messages: conflicts,
        alternatives: findAvailableAlternatives(slotForm, editingSlot?.id),
      });
      onShowToast('Conflit d’horaire détecté. Choisissez un créneau disponible.', 'error');
      return;
    }

    setConflictState(null);

    const sub = subjectMap.get(slotForm.subjectId);
    const slotColor = sub?.color || '#3b82f6';

    let updatedSlots = [...db.timetableSlots];

    if (editingSlot) {
      updatedSlots = updatedSlots.map((s) =>
        s.id === editingSlot.id
          ? { ...s, ...slotForm, color: slotColor }
          : s
      );
    } else {
      const newSlot: TimetableSlot = {
        id: `tt-${Date.now()}`,
        ...slotForm,
        color: slotColor,
      };
      updatedSlots.push(newSlot);
    }

    const updatedDb: DatabaseSchema = {
      ...db,
      timetableSlots: updatedSlots,
    };

    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    setIsSlotModalOpen(false);
    onShowToast('Créneau de cours enregistré avec succès !', 'success');
  };

  const handleDeleteSlot = (id: string) => {
    const updatedSlots = db.timetableSlots.filter((s) => s.id !== id);
    const updatedDb: DatabaseSchema = {
      ...db,
      timetableSlots: updatedSlots,
    };
    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);
    onShowToast('Créneau supprimé du planning.', 'info');
  };

  const handleGenerateAutomatically = () => {
    const result = TimetableGeneratorService.generate(db);

    if (result.slots.length === 0) {
      onShowToast(
        'Aucun cours n’a pu être généré. Vérifiez les enseignants et heures configurés dans Paramètres > Classes.',
        'error'
      );
      return;
    }

    const message =
      db.timetableSlots.length > 0
        ? `Le planning actuel contient ${db.timetableSlots.length} créneau(x). Le générateur va le remplacer par ${result.slots.length} créneau(x). Continuer ?`
        : `Générer automatiquement ${result.slots.length} créneau(x) ?`;

    if (!window.confirm(message)) return;

    const updatedDb: DatabaseSchema = {
      ...db,
      timetableSlots: result.slots,
    };
    StorageService.saveDatabase(updatedDb);
    onUpdateDb(updatedDb);

    if (result.unassigned.length > 0) {
      onShowToast(
        `Planning généré : ${result.slots.length} cours placés, ${result.unassigned.length} matière(s) restent à compléter manuellement.`,
        'info'
      );
    } else {
      onShowToast(
        `Planning généré automatiquement : ${result.slots.length} cours sans conflit.`,
        'success'
      );
    }
  };

  // Filter slots based on active view
  const currentSlots = db.timetableSlots.filter((slot) => {
    if (viewType === 'CLASS') return slot.classId === selectedEntityId;
    if (viewType === 'TEACHER') return slot.teacherId === selectedEntityId;
    if (viewType === 'ROOM') return slot.room === selectedEntityId;
    return true;
  });

  const allRooms = Array.from(new Set(db.timetableSlots.map((s) => s.room)));

  const scheduleIssues = (() => {
    const issues: string[] = [];
    for (let i = 0; i < db.timetableSlots.length; i++) {
      for (let j = i + 1; j < db.timetableSlots.length; j++) {
        const a = db.timetableSlots[i];
        const b = db.timetableSlots[j];
        if (a.dayOfWeek !== b.dayOfWeek) continue;
        const overlaps = a.startTime < b.endTime && b.startTime < a.endTime;
        if (!overlaps) continue;

        const dayName = days.find((day) => day.id === a.dayOfWeek)?.name || 'Jour';
        if (a.teacherId === b.teacherId) {
          const teacher = teacherMap.get(a.teacherId);
          issues.push(
            `${dayName} ${a.startTime}-${a.endTime} : ${teacher?.lastName || 'Enseignant'} est programmé sur deux cours.`
          );
        }
        if (a.classId === b.classId) {
          const schoolClass = classMap.get(a.classId);
          issues.push(
            `${dayName} ${a.startTime}-${a.endTime} : ${schoolClass?.name || 'Classe'} a deux cours simultanés.`
          );
        }
        if (a.room.trim().toLowerCase() === b.room.trim().toLowerCase()) {
          issues.push(
            `${dayName} ${a.startTime}-${a.endTime} : la salle ${a.room} est utilisée deux fois.`
          );
        }
      }
    }
    return Array.from(new Set(issues));
  })();

  return (
    <div className="space-y-6">
      <div className="page-panel p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {[
            ['CLASS', 'Par classe'],
            ['TEACHER', 'Par enseignant'],
            ['ROOM', 'Par salle'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                const next = id as typeof viewType;
                setViewType(next);
                if (next === 'CLASS') setSelectedEntityId(db.classes[0]?.id || '');
                if (next === 'TEACHER') setSelectedEntityId(db.teachers[0]?.id || '');
                if (next === 'ROOM') setSelectedEntityId(allRooms[0] || '');
              }}
              className={`px-3 py-2 rounded-md text-[11px] font-semibold transition ${
                viewType === id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewType === 'CLASS' && (
            <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className="settings-input w-auto min-w-[180px]">
              {db.classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</option>)}
            </select>
          )}
          {viewType === 'TEACHER' && (
            <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className="settings-input w-auto min-w-[190px]">
              {db.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.lastName} {teacher.firstName}</option>)}
            </select>
          )}
          {viewType === 'ROOM' && (
            <select value={selectedEntityId} onChange={(e) => setSelectedEntityId(e.target.value)} className="settings-input w-auto min-w-[150px]">
              {allRooms.map((room) => <option key={room} value={room}>{room}</option>)}
            </select>
          )}
          <button
            type="button"
            onClick={handleGenerateAutomatically}
            className="button button--secondary"
            title="Reconstruit tout le planning selon les heures, enseignants, classes et salles configurés."
          >
            <WandSparkles className="w-3.5 h-3.5" />
            Générer automatiquement
          </button>
          <button
            type="button"
            onClick={() => PdfGeneratorService.generateTimetablePDF(db, viewType, selectedEntityId)}
            className="button button--secondary"
          >
            <FileDown className="w-3.5 h-3.5" />
            PDF
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="button button--secondary"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimer
          </button>
          <button type="button" onClick={handleOpenAddModal} className="button button--primary">
            <PlusCircle className="w-3.5 h-3.5" />
            Ajouter un cours
          </button>
        </div>
      </div>

      {scheduleIssues.length > 0 && (
        <div className="schedule-audit">
          <div className="schedule-audit__title">
            <AlertTriangle className="w-4 h-4" />
            {scheduleIssues.length} conflit(s) détecté(s) dans le planning existant
          </div>
          <div className="schedule-audit__list">
            {scheduleIssues.slice(0, 6).map((issue) => (
              <div key={issue}>{issue}</div>
            ))}
            {scheduleIssues.length > 6 && (
              <div>+ {scheduleIssues.length - 6} autre(s) conflit(s)</div>
            )}
          </div>
        </div>
      )}

      {/* Interactive Weekly Timetable Grid */}
      <div id="printable-area" className="page-panel overflow-x-auto timetable-print-area">
        <div className="print-only timetable-print-heading">
          <strong>{db.schoolConfig.name}</strong>
          <span>
            Emploi du temps — {
              viewType === 'CLASS'
                ? classMap.get(selectedEntityId)?.name
                : viewType === 'TEACHER'
                ? `${teacherMap.get(selectedEntityId)?.lastName || ''} ${teacherMap.get(selectedEntityId)?.firstName || ''}`
                : selectedEntityId
            }
          </span>
          <small>
            Année scolaire : {db.schoolYears.find((year) => year.id === db.currentSchoolYearId)?.label || ''}
          </small>
        </div>
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr>
              <th className="p-3 w-28 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-center">
                Horaires
              </th>
              {days.map((day) => (
                <th
                  key={day.id}
                  className="p-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-center"
                >
                  {day.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((ts) => (
              <tr key={ts.start}>
                <td className="p-2.5 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 font-mono text-[11px] font-bold text-slate-600 dark:text-slate-400 text-center">
                  {ts.label}
                </td>
                {days.map((day) => {
                  const match = currentSlots.find(
                    (s) => s.dayOfWeek === day.id && s.startTime === ts.start
                  );
                  const sub = match ? subjectMap.get(match.subjectId) : null;
                  const tea = match ? teacherMap.get(match.teacherId) : null;
                  const cls = match ? classMap.get(match.classId) : null;

                  return (
                    <td
                      key={day.id}
                      className="p-2 border border-slate-200 dark:border-slate-700 h-24 align-top transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/20"
                    >
                      {match ? (
                        <div
                          className="timetable-course group relative"
                          style={{ '--course-accent': match.color || '#64748b' } as React.CSSProperties}
                        >
                          <div className="timetable-course__subject">
                            {sub?.name || 'Matière'}
                          </div>
                          <div className="timetable-course__meta">
                            {viewType === 'CLASS'
                              ? tea
                                ? `${tea.lastName} ${tea.firstName}`
                                : 'Enseignant'
                              : viewType === 'TEACHER'
                              ? cls?.name || 'Classe'
                              : `${cls?.name || ''} · ${tea?.lastName || ''}`}
                          </div>
                          <div className="timetable-course__room">{match.room}</div>
                          <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-1 no-print">
                            <button
                              onClick={() => {
                                setEditingSlot(match);
                                setSlotForm({
                                  dayOfWeek: match.dayOfWeek,
                                  startTime: match.startTime,
                                  endTime: match.endTime,
                                  classId: match.classId,
                                  subjectId: match.subjectId,
                                  teacherId: match.teacherId,
                                  room: match.room,
                                  color: match.color || '#64748b',
                                });
                                setIsSlotModalOpen(true);
                              }}
                              className="p-1 border border-slate-300 bg-white text-slate-600"
                              title="Modifier"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteSlot(match.id)}
                              className="p-1 border border-slate-300 bg-white text-rose-700"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition">
                          <button
                            onClick={() => {
                              setEditingSlot(null);
                              setSlotForm(buildSlotDefaults(day.id, ts.start, ts.end));
                              setIsSlotModalOpen(true);
                            }}
                            className="p-1.5 border border-slate-300 text-slate-500 hover:text-slate-900 text-[10px] font-semibold no-print"
                          >
                            + Cours
                          </button>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Timetable Slot Modal */}
      <Modal
        isOpen={isSlotModalOpen}
        onClose={() => setIsSlotModalOpen(false)}
        title={editingSlot ? 'Modifier le Créneau de Cours' : 'Ajouter un Nouveau Cours'}
        subtitle="Contrôle en direct des disponibilités et alertes de conflits"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveSlot} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Jour de la Semaine *</label>
              <select
                value={slotForm.dayOfWeek}
                onChange={(e) =>
                  setSlotForm({
                    ...slotForm,
                    dayOfWeek: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6,
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                {days.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Plage Horaire *</label>
              <select
                value={`${slotForm.startTime}-${slotForm.endTime}`}
                onChange={(e) => {
                  const [start, end] = e.target.value.split('-');
                  setSlotForm({ ...slotForm, startTime: start, endTime: end });
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
              >
                {timeSlots.map((ts) => (
                  <option key={ts.start} value={`${ts.start}-${ts.end}`}>
                    {ts.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Classe *</label>
              <select
                value={slotForm.classId}
                onChange={(e) => setSlotForm({ ...slotForm, classId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {db.classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Matière *</label>
              <select
                value={slotForm.subjectId}
                onChange={(e) => setSlotForm({ ...slotForm, subjectId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {db.subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Enseignant Responsable *</label>
              <select
                value={slotForm.teacherId}
                onChange={(e) => setSlotForm({ ...slotForm, teacherId: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                {db.teachers.map((tea) => (
                  <option key={tea.id} value={tea.id}>
                    {tea.lastName} {tea.firstName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Salle / Laboratoire *</label>
              <input
                type="text"
                required
                value={slotForm.room}
                onChange={(e) => setSlotForm({ ...slotForm, room: e.target.value })}
                placeholder="Ex: Salle 201 / Labo Sciences"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium"
              />
            </div>
          </div>

          {conflictState && (
            <div className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300 mt-0.5" />
                <div>
                  <div className="font-semibold text-amber-900 dark:text-amber-200">Conflit détecté</div>
                  <ul className="mt-1 space-y-1 text-[10.5px] text-amber-800 dark:text-amber-300">
                    {conflictState.messages.map((message) => (
                      <li key={message}>• {message}</li>
                    ))}
                  </ul>
                </div>
              </div>
              {conflictState.alternatives.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    Créneaux disponibles proposés
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {conflictState.alternatives.map((alternative) => (
                      <button
                        type="button"
                        key={`${alternative.dayOfWeek}-${alternative.startTime}`}
                        onClick={() => {
                          setSlotForm({
                            ...slotForm,
                            dayOfWeek: alternative.dayOfWeek,
                            startTime: alternative.startTime,
                            endTime: alternative.endTime,
                          });
                          setConflictState(null);
                        }}
                        className="button button--secondary h-8"
                      >
                        {alternative.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition"
          >
            Enregistrer ce Cours dans la Grille
          </button>
        </form>
      </Modal>
    </div>
  );
};
