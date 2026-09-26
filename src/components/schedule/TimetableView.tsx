// EduGasy Pro - Interactive Weekly Timetable & Conflict Engine
import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Building,
  Users,
  PlusCircle,
  AlertTriangle,
  Printer,
  Trash2,
  Edit2,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { DatabaseSchema, TimetableSlot } from '../../types/school';
import { StorageService } from '../../services/storage';
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

  // Conflict Detection Engine
  const detectConflicts = (newSlot: Partial<TimetableSlot>, excludeId?: string) => {
    const conflicts: string[] = [];

    db.timetableSlots.forEach((slot) => {
      if (excludeId && slot.id === excludeId) return;

      // Check day overlap
      if (slot.dayOfWeek === newSlot.dayOfWeek) {
        // Check time clash
        const isTimeClash = slot.startTime === newSlot.startTime;

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

  const handleOpenAddModal = () => {
    setEditingSlot(null);
    setSlotForm({
      dayOfWeek: 1,
      startTime: '07:30',
      endTime: '09:30',
      classId: selectedEntityId || db.classes[0]?.id || '',
      subjectId: db.subjects[0]?.id || '',
      teacherId: db.teachers[0]?.id || '',
      room: 'Salle 201',
      color: '#3b82f6',
    });
    setIsSlotModalOpen(true);
  };

  const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();

    const conflicts = detectConflicts(slotForm, editingSlot?.id);
    if (conflicts.length > 0) {
      if (!window.confirm(`Attention ! Conflits détectés :\n\n- ${conflicts.join('\n- ')}\n\nVoulez-vous forcer l'enregistrement ?`)) {
        return;
      }
    }

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

  // Filter slots based on active view
  const currentSlots = db.timetableSlots.filter((slot) => {
    if (viewType === 'CLASS') return slot.classId === selectedEntityId;
    if (viewType === 'TEACHER') return slot.teacherId === selectedEntityId;
    if (viewType === 'ROOM') return slot.room === selectedEntityId;
    return true;
  });

  const allRooms = Array.from(new Set(db.timetableSlots.map((s) => s.room)));

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white m-0">
            Gestion des Emplois du Temps & Planification Pédagogique
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Planning hebdomadaire interactif, détection automatique des conflits de salles et de professeurs
          </p>
        </div>

        {/* View Switchers & Add Action */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* View Perspective Selector */}
          <div className="flex items-center space-x-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              onClick={() => {
                setViewType('CLASS');
                setSelectedEntityId(db.classes[0]?.id || '');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewType === 'CLASS'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Par Classe
            </button>
            <button
              onClick={() => {
                setViewType('TEACHER');
                setSelectedEntityId(db.teachers[0]?.id || '');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewType === 'TEACHER'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Par Enseignant
            </button>
            <button
              onClick={() => {
                setViewType('ROOM');
                setSelectedEntityId(allRooms[0] || 'Salle 201');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewType === 'ROOM'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Par Salle
            </button>
          </div>

          {/* Entity Dropdown */}
          {viewType === 'CLASS' && (
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {db.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {viewType === 'TEACHER' && (
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {db.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.lastName} {t.firstName}
                </option>
              ))}
            </select>
          )}

          {viewType === 'ROOM' && (
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {allRooms.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleOpenAddModal}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md shadow-blue-600/20 active:scale-95 transition"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Ajouter Cours</span>
          </button>
        </div>
      </div>

      {/* Interactive Weekly Timetable Grid */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-x-auto">
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
            {timeSlots.map((ts, idx) => (
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
                          className="h-full p-2.5 rounded-xl text-white shadow-sm flex flex-col justify-between group relative transition-transform hover:scale-[1.02]"
                          style={{ backgroundColor: match.color || '#3b82f6' }}
                        >
                          <div>
                            <div className="font-extrabold text-xs truncate">
                              {sub?.name || 'Matière'}
                            </div>
                            <div className="text-[10px] text-white/90 truncate font-medium">
                              {viewType === 'CLASS'
                                ? `${tea?.lastName || 'Prof'}`
                                : viewType === 'TEACHER'
                                ? `${cls?.name || 'Classe'}`
                                : `${cls?.name} • ${tea?.lastName}`}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[9px] text-white/80 font-mono pt-1">
                            <span>{match.room}</span>
                            <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 transition">
                              <button
                                onClick={() => handleDeleteSlot(match.id)}
                                className="p-0.5 rounded bg-black/30 hover:bg-black/50 text-white"
                                title="Supprimer ce créneau"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition">
                          <button
                            onClick={() => {
                              setEditingSlot(null);
                              setSlotForm({
                                ...slotForm,
                                dayOfWeek: day.id,
                                startTime: ts.start,
                                endTime: ts.end,
                              });
                              setIsSlotModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 hover:bg-blue-100 text-[10px] font-bold"
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
                  setSlotForm({ ...slotForm, dayOfWeek: Number(e.target.value) as any })
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
