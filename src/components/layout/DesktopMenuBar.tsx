// EduGasy Pro - Native Desktop ERP Menu Ribbon
import React, { useState, useRef, useEffect } from 'react';
import {
  FileDown,
  FileUp,
  RotateCcw,
  Plus,
  Printer,
  Search,
  Database,
  Moon,
  Sun,
  Shield,
  Layers,
} from 'lucide-react';
import { DatabaseSchema, TermType } from '../../types/school';
import { StorageService } from '../../services/storage';
import { NavTab } from './Sidebar';

interface DesktopMenuBarProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onNavigate: (tab: NavTab) => void;
  onOpenNewAdmission: () => void;
  onOpenNewPayment: () => void;
  onOpenCommandPalette: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DesktopMenuBar: React.FC<DesktopMenuBarProps> = ({
  db,
  onUpdateDb,
  onNavigate,
  onOpenNewAdmission,
  onOpenNewPayment,
  onOpenCommandPalette,
  isDark,
  onToggleTheme,
  onShowToast,
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.desktop-menu-item')) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const handleExportBackup = () => {
    StorageService.exportBackupJSON(db);
    onShowToast('Sauvegarde locale exportée (Fichier JSON).', 'success');
    setOpenMenu(null);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    StorageService.importBackupJSON(file)
      .then((imported) => {
        onUpdateDb(imported);
        onShowToast('Base de données locale restaurée.', 'success');
      })
      .catch((err) => {
        onShowToast(`Erreur : ${err.message}`, 'error');
      });
    setOpenMenu(null);
  };

  const handleResetData = () => {
    if (window.confirm("Réinitialiser toutes les données aux valeurs par défaut de l'établissement ?")) {
      const reset = StorageService.resetToDefault();
      onUpdateDb(reset);
      onShowToast('Données réinitialisées.', 'info');
    }
    setOpenMenu(null);
  };

  return (
    <div className="h-8 bg-slate-900 text-slate-300 text-xs flex items-center justify-between px-3 border-b border-slate-800 select-none z-40">
      {/* Left Menu Items */}
      <div className="flex items-center space-x-1">
        {/* App Title Stamp */}
        <div className="flex items-center space-x-1.5 font-bold text-white mr-3 pr-3 border-r border-slate-800 text-[11px] tracking-wide">
          <div className="w-4 h-4 rounded bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">
            E
          </div>
          <span>EDUGASY PRO</span>
          <span className="text-[9px] text-slate-400 font-normal">v2.4</span>
        </div>

        {/* Fichier Menu */}
        <div className="relative desktop-menu-item">
          <button
            onClick={() => setOpenMenu(openMenu === 'FILE' ? null : 'FILE')}
            className={`px-2.5 py-1 rounded hover:bg-slate-800 hover:text-white transition ${
              openMenu === 'FILE' ? 'bg-slate-800 text-white' : ''
            }`}
          >
            Fichier
          </button>
          {openMenu === 'FILE' && (
            <div className="absolute top-full left-0 mt-0.5 w-56 bg-slate-900 border border-slate-700 rounded shadow-2xl py-1 text-xs text-slate-200 divide-y divide-slate-800">
              <div className="py-1">
                <button
                  onClick={() => {
                    onOpenNewAdmission();
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between"
                >
                  <span>Nouvelle Inscription Élève</span>
                  <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+N</kbd>
                </button>
                <button
                  onClick={() => {
                    onOpenNewPayment();
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center justify-between"
                >
                  <span>Encaisser un Écolage</span>
                  <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+E</kbd>
                </button>
              </div>

              <div className="py-1">
                <button
                  onClick={handleExportBackup}
                  className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center space-x-2"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-400" />
                  <span>Exporter Sauvegarde (.json)</span>
                </button>
                <label className="w-full text-left px-3 py-1.5 hover:bg-blue-600 hover:text-white flex items-center space-x-2 cursor-pointer">
                  <FileUp className="w-3.5 h-3.5 text-purple-400" />
                  <span>Restaurer une Sauvegarde</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="py-1">
                <button
                  onClick={handleResetData}
                  className="w-full text-left px-3 py-1.5 hover:bg-rose-700 hover:text-white flex items-center space-x-2 text-rose-300"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Réinitialiser Données Par Défaut</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modules Shortcuts */}
        <button
          onClick={() => onNavigate('dashboard')}
          className="px-2.5 py-1 rounded hover:bg-slate-800 hover:text-white transition"
        >
          Tableau de Bord
        </button>
        <button
          onClick={() => onNavigate('students')}
          className="px-2.5 py-1 rounded hover:bg-slate-800 hover:text-white transition"
        >
          Élèves
        </button>
        <button
          onClick={() => onNavigate('academics')}
          className="px-2.5 py-1 rounded hover:bg-slate-800 hover:text-white transition"
        >
          Notes & Bulletins
        </button>
        <button
          onClick={() => onNavigate('finances')}
          className="px-2.5 py-1 rounded hover:bg-slate-800 hover:text-white transition"
        >
          Finances
        </button>
        <button
          onClick={() => onNavigate('schedule')}
          className="px-2.5 py-1 rounded hover:bg-slate-800 hover:text-white transition"
        >
          Emplois du Temps
        </button>
        <button
          onClick={() => onNavigate('settings')}
          className="px-2.5 py-1 rounded hover:bg-slate-800 hover:text-white transition"
        >
          Paramètres
        </button>
      </div>

      {/* Right System Info & Quick Icons */}
      <div className="flex items-center space-x-3 text-[11px] text-slate-400">
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Base Locale Active</span>
        </div>

        <button
          onClick={onOpenCommandPalette}
          className="flex items-center space-x-1 text-slate-400 hover:text-white hover:bg-slate-800 px-2 py-0.5 rounded"
          title="Recherche globale (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="font-mono text-[10px]">Ctrl+K</span>
        </button>

        <button
          onClick={onToggleTheme}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          title="Basculer thème Sombre / Clair"
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-300" />}
        </button>
      </div>
    </div>
  );
};
