import React, { useState, useRef, useEffect } from 'react';
import {
  FileDown,
  FileUp,
  RotateCcw,
  Search,
  Moon,
  Sun,
} from 'lucide-react';
import { DatabaseSchema } from '../../types/school';
import { StorageService } from '../../services/storage';
import { useConfirm } from '../common/ConfirmProvider';

interface DesktopMenuBarProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
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
  onOpenNewAdmission,
  onOpenNewPayment,
  onOpenCommandPalette,
  isDark,
  onToggleTheme,
  onShowToast,
}) => {
  const confirm = useConfirm();
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

  const handleResetData = async () => {
    setOpenMenu(null);
    const accepted = await confirm({
      title: 'Réinitialiser Sekoly',
      message:
        'Toutes les données locales seront remplacées par un établissement vierge. Exportez une sauvegarde avant de continuer si nécessaire.',
      confirmLabel: 'Réinitialiser',
      destructive: true,
    });
    if (!accepted) return;

    const reset = StorageService.resetToDefault();
    onUpdateDb(reset);
    onShowToast('Données réinitialisées.', 'info');
  };

  return (
    <div className="h-8 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs flex items-center justify-between px-3 border-b border-slate-200 dark:border-slate-800 select-none z-40">
      {/* Left Menu Items */}
      <div className="flex items-center space-x-1">
        {/* App Title Stamp */}
        <div className="flex items-center space-x-1.5 font-bold text-slate-900 dark:text-white mr-3 pr-3 border-r border-slate-200 dark:border-slate-800 text-[11px] tracking-wide">
          <div className="w-4 h-4 rounded bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">
            E
          </div>
          <span>SEKOLY</span>
          <span className="text-[9px] text-slate-400 font-normal">v1.0</span>
        </div>

        {/* Fichier Menu */}
        <div className="relative desktop-menu-item">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'FILE' ? null : 'FILE')}
            className={`px-2.5 py-1 rounded transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white ${
              openMenu === 'FILE' ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : ''
            }`}
          >
            Fichier
          </button>
          {openMenu === 'FILE' && (
            <div className="absolute top-full left-0 mt-0.5 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-2xl py-1 text-xs text-slate-700 dark:text-slate-200 divide-y divide-slate-100 dark:divide-slate-800">
              <div className="py-1">
                <button
                  type="button"
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
                  type="button"
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
                  type="button"
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
                  type="button"
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

        {/* Ouverture de la palette de commandes */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="px-2.5 py-1 rounded transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white flex items-center space-x-1.5"
          title="Rechercher un élève, une classe ou une commande (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Rechercher</span>
          <kbd className="text-[10px] text-slate-500 font-mono">Ctrl+K</kbd>
        </button>
      </div>

      {/* Right System Info & Quick Icons */}
      <div className="flex items-center space-x-3 text-[11px] text-slate-400">
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Base Locale Active</span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          className="p-1 rounded transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100 text-slate-500 dark:text-slate-400"
          title="Basculer thème Sombre / Clair"
        >
          {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-300" />}
        </button>
      </div>
    </div>
  );
};
