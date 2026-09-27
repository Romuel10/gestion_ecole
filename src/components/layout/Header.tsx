import React from 'react';
import {
  Menu,
  Search,
  UserRoundPlus,
  CircleDollarSign,
  Moon,
  Sun,
} from 'lucide-react';
import { DatabaseSchema, TermType } from '../../types/school';
import { StorageService } from '../../services/storage';
import { NavTab } from './Sidebar';

interface HeaderProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  currentTab: NavTab;
  isDark: boolean;
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
  onQuickAction: (action: 'NEW_STUDENT' | 'NEW_PAYMENT' | 'NEW_GRADE') => void;
}

const pageMeta: Record<NavTab, { title: string; description: string }> = {
  dashboard: { title: 'Tableau de bord', description: 'Vue d’ensemble de l’établissement' },
  admissions: { title: 'Admissions', description: 'Inscriptions et réinscriptions' },
  students: { title: 'Élèves', description: 'Dossiers et suivi des élèves' },
  academics: { title: 'Notes et bulletins', description: 'Évaluations, résultats et délibérations' },
  finances: { title: 'Finances', description: 'Écolages, caisse et rémunérations' },
  schedule: { title: 'Emploi du temps', description: 'Organisation des cours et salles' },
  teachers: { title: 'Enseignants', description: 'Personnel enseignant et affectations' },
  settings: { title: 'Paramètres', description: 'Organisation et règles de l’établissement' },
};

export const Header: React.FC<HeaderProps> = ({
  db,
  onUpdateDb,
  currentTab,
  isDark,
  onToggleTheme,
  onToggleSidebar,
  onOpenCommandPalette,
  onQuickAction,
}) => {
  const activeYear = db.schoolYears.find((year) => year.id === db.currentSchoolYearId);
  const periods = activeYear?.terms || [];
  const meta = pageMeta[currentTab];

  const handleTermChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTerm = e.target.value as TermType;
    const updated = { ...db, currentTermCode: newTerm };
    StorageService.saveDatabase(updated);
    onUpdateDb(updated);
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newYearId = e.target.value;
    const selectedYear = db.schoolYears.find((year) => year.id === newYearId);
    if (!selectedYear) return;

    const nextTermCode = selectedYear.terms.some((term) => term.code === db.currentTermCode)
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
    <header className="app-header">
      <div className="app-header__left">
        <button type="button" onClick={onToggleSidebar} className="icon-button lg:hidden" aria-label="Navigation">
          <Menu className="w-4 h-4" />
        </button>
        <div>
          <h1 className="app-header__title">{meta.title}</h1>
          <p className="app-header__description">{meta.description}</p>
        </div>
      </div>

      <div className="app-header__right">
        <div className="app-period-switcher">
          <select value={db.currentSchoolYearId} onChange={handleYearChange} aria-label="Année scolaire">
            {db.schoolYears.map((year) => (
              <option key={year.id} value={year.id}>{year.label}</option>
            ))}
          </select>
          <span className="app-period-switcher__separator" />
          <select value={db.currentTermCode} onChange={handleTermChange} aria-label="Période académique">
            {periods.map((term) => (
              <option key={term.id} value={term.code}>{term.label}</option>
            ))}
          </select>
        </div>

        <button type="button" onClick={onOpenCommandPalette} className="header-search">
          <Search className="w-4 h-4" />
          <span className="hidden xl:inline">Rechercher</span>
          <kbd className="hidden xl:inline">Ctrl K</kbd>
        </button>

        <button type="button" onClick={() => onQuickAction('NEW_STUDENT')} className="button button--secondary hidden md:inline-flex">
          <UserRoundPlus className="w-4 h-4" />
          <span>Inscription</span>
        </button>
        <button type="button" onClick={() => onQuickAction('NEW_PAYMENT')} className="button button--primary">
          <CircleDollarSign className="w-4 h-4" />
          <span className="hidden sm:inline">Encaisser</span>
        </button>

        <button type="button" onClick={onToggleTheme} className="icon-button" aria-label="Changer de thème">
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
