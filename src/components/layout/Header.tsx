import React from 'react';
import {
  Menu,
  UserPlus,
  Receipt,
  Layers,
  Building,
  Sun,
  Moon,
} from 'lucide-react';
import { DatabaseSchema, TermType } from '../../types/school';
import { StorageService } from '../../services/storage';

interface HeaderProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  onQuickAction: (action: 'NEW_STUDENT' | 'NEW_PAYMENT' | 'NEW_GRADE') => void;
  show3DVisualizer: boolean;
  onToggle3DVisualizer: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  db,
  onUpdateDb,
  isDark,
  onToggleTheme,
  onToggleSidebar,
  onQuickAction,
  show3DVisualizer,
  onToggle3DVisualizer,
}) => {
  const handleTermChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTerm = e.target.value as TermType;
    const updated: DatabaseSchema = {
      ...db,
      currentTermCode: newTerm,
    };
    StorageService.saveDatabase(updated);
    onUpdateDb(updated);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYearId = e.target.value;
    const selectedYear = db.schoolYears.find((year) => year.id === newYearId);
    if (!selectedYear) return;

    const validTermCodes = selectedYear.terms.map((term) => term.code);
    const nextTermCode = validTermCodes.includes(db.currentTermCode)
      ? db.currentTermCode
      : selectedYear.terms[0]?.code || db.currentTermCode;

    const updated: DatabaseSchema = {
      ...db,
      currentSchoolYearId: newYearId,
      currentTermCode: nextTermCode,
      schoolYears: db.schoolYears.map((year) => ({
        ...year,
        isCurrent: year.id === newYearId,
      })),
    };
    StorageService.saveDatabase(updated);
    onUpdateDb(updated);
  };

  return (
    <header className="h-12 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between select-none">
      {/* Barre latérale et établissement */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
          title="Afficher / Masquer la barre latérale"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2 text-xs">
          <Building className="w-4 h-4 text-slate-500" />
          <span className="font-bold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md">
            {db.schoolConfig.name}
          </span>
          <span className="text-slate-400 font-mono text-[11px]">({db.schoolConfig.acronym})</span>
        </div>
      </div>

      {/* Sélecteurs de période et actions rapides */}
      <div className="flex items-center space-x-2">
        {/* Période */}
        <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Période :</span>
          <select
            value={db.currentTermCode}
            onChange={handleTermChange}
            className="bg-transparent font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="TRIMESTRE_1">1er Trimestre</option>
            <option value="TRIMESTRE_2">2ème Trimestre</option>
            <option value="TRIMESTRE_3">3ème Trimestre</option>
          </select>
        </div>

        {/* Année scolaire */}
        <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Année :</span>
          <select
            value={db.currentSchoolYearId}
            onChange={handleYearChange}
            className="bg-transparent font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
          >
            {db.schoolYears.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
          </select>
        </div>

        {/* Jour / Nuit */}
        <button
          onClick={onToggleTheme}
          className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded border transition text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          title={isDark ? 'Passer en mode jour' : 'Passer en mode nuit'}
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isDark ? 'Jour' : 'Nuit'}</span>
        </button>

        {/* Vue 3D */}
        <button
          onClick={onToggle3DVisualizer}
          className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded border transition ${
            show3DVisualizer
              ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
              : 'text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Basculer le modèle 3D du campus"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">3D</span>
        </button>

        {/* Inscription */}
        <button
          onClick={() => onQuickAction('NEW_STUDENT')}
          className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded bg-blue-700 hover:bg-blue-800 text-white shadow-sm transition"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Inscription</span>
        </button>

        {/* Encaissement */}
        <button
          onClick={() => onQuickAction('NEW_PAYMENT')}
          className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>Encaisser</span>
        </button>
      </div>
    </header>
  );
};
