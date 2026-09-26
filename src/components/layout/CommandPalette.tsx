import React, { useState, useEffect } from 'react';
import { Search, GraduationCap, Users, BookOpen, Receipt, Settings, ArrowRight, X } from 'lucide-react';
import { DatabaseSchema, Student, Teacher, SchoolClass } from '../../types/school';
import { NavTab } from './Sidebar';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  db: DatabaseSchema;
  onNavigate: (tab: NavTab, entityId?: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  db,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  // Search Results
  const matchedStudents = db.students.filter(
    (s) =>
      s.lastName.toLowerCase().includes(q) ||
      s.firstName.toLowerCase().includes(q) ||
      s.matricule.toLowerCase().includes(q)
  ).slice(0, 5);

  const matchedTeachers = db.teachers.filter(
    (t) =>
      t.lastName.toLowerCase().includes(q) ||
      t.firstName.toLowerCase().includes(q) ||
      t.matricule.toLowerCase().includes(q)
  ).slice(0, 3);

  const matchedClasses = db.classes.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q)
  ).slice(0, 3);

  const matchedPayments = db.tuitionPayments.filter(
    (p) =>
      p.receiptNumber.toLowerCase().includes(q) ||
      (p.referenceNumber && p.referenceNumber.toLowerCase().includes(q))
  ).slice(0, 3);

  const classMap = new Map(db.classes.map((c) => [c.id, c.name]));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Palette Box */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-100">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-slate-400 mr-3 flex-shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher élève par nom/matricule, enseignant, classe, reçu..."
            className="w-full bg-transparent text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Results Area */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-3">
          {/* Section: Élèves */}
          {matchedStudents.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Élèves ({matchedStudents.length})
              </div>
              <div className="space-y-1 mt-1">
                {matchedStudents.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onNavigate('students', s.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800/80 transition text-left group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center font-bold text-[11px]">
                        {s.firstName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {s.lastName} {s.firstName}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Matricule: <span className="font-mono">{s.matricule}</span> • Classe: {classMap.get(s.classId)}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section: Enseignants */}
          {matchedTeachers.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Enseignants ({matchedTeachers.length})
              </div>
              <div className="space-y-1 mt-1">
                {matchedTeachers.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onNavigate('teachers', t.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800/80 transition text-left group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-[11px]">
                        {t.firstName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {t.lastName} {t.firstName}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {t.qualification} • {t.contractType}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section: Classes */}
          {matchedClasses.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Classes ({matchedClasses.length})
              </div>
              <div className="space-y-1 mt-1">
                {matchedClasses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      onNavigate('academics', c.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800/80 transition text-left group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-[11px]">
                        {c.code.slice(0, 3)}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {c.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Niveau: {c.level.toUpperCase()} • Série: {c.serie || 'Générale'}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section: Reçus de Caisse */}
          {matchedPayments.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Reçus & Quittances ({matchedPayments.length})
              </div>
              <div className="space-y-1 mt-1">
                {matchedPayments.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onNavigate('finances', p.id);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-800/80 transition text-left group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold text-[11px]">
                        REC
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          Reçu N° {p.receiptNumber} — {p.amount.toLocaleString()} Ar
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {p.feeType} • {p.paymentMethod}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {query &&
            matchedStudents.length === 0 &&
            matchedTeachers.length === 0 &&
            matchedClasses.length === 0 &&
            matchedPayments.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">
                Aucun résultat correspondant pour &ldquo;{query}&rdquo;.
              </div>
            )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-400">
          <span>Utilisez les flèches ou cliquez pour naviguer</span>
          <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-slate-200 dark:bg-slate-800 rounded">
            ECHAP pour fermer
          </kbd>
        </div>
      </div>
    </div>
  );
};
