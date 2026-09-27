import React from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { Modal } from './Modal';
import { ExcelImportIssue } from '../../services/excelImporter';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fileName: string;
  validCount: number;
  validLabel: string;
  issues: ExcelImportIssue[];
  warnings: ExcelImportIssue[];
  onConfirm: () => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  title,
  fileName,
  validCount,
  validLabel,
  issues,
  warnings,
  onConfirm,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    subtitle={fileName}
    maxWidth="4xl"
    actions={
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="button button--secondary">
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={validCount === 0 || issues.length > 0}
          className="button button--primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Importer {validCount} {validLabel}
        </button>
      </div>
    }
  >
    <div className="space-y-4">
      <div className="excel-import-summary">
        <div>
          <FileSpreadsheet className="w-4 h-4 text-slate-500" />
          <span>Valides</span>
          <strong>{validCount}</strong>
        </div>
        <div>
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>Erreurs</span>
          <strong>{issues.length}</strong>
        </div>
        <div>
          <CheckCircle2 className="w-4 h-4 text-amber-600" />
          <span>Avertissements</span>
          <strong>{warnings.length}</strong>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="border border-rose-200 dark:border-rose-900">
          <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/30 text-[10.5px] font-semibold text-rose-800 dark:text-rose-200">
            Corrigez ces erreurs dans Excel avant l’import.
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-rose-100 dark:divide-rose-900">
            {issues.slice(0, 100).map((issue, index) => (
              <div key={`${issue.row}-${index}`} className="px-3 py-2 text-[10.5px]">
                <strong>Ligne {issue.row}</strong> — {issue.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-900">
          <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/30 text-[10.5px] font-semibold text-amber-800 dark:text-amber-200">
            Avertissements non bloquants
          </div>
          <div className="max-h-40 overflow-y-auto divide-y divide-amber-100 dark:divide-amber-900">
            {warnings.slice(0, 50).map((warning, index) => (
              <div key={`${warning.row}-${index}`} className="px-3 py-2 text-[10.5px]">
                <strong>Ligne {warning.row}</strong> — {warning.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {issues.length === 0 && (
        <div className="text-[10.5px] text-slate-500">
          Le fichier est prêt à être importé. Aucune donnée n’est modifiée tant que vous ne
          cliquez pas sur le bouton d’import.
        </div>
      )}
    </div>
  </Modal>
);
