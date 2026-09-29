import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = false,
  onConfirm,
  onCancel,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onCancel}
    title={title}
    maxWidth="sm"
    closeOnBackdrop={false}
    actions={
      <>
        <button type="button" onClick={onCancel} className="button button--secondary">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          autoFocus
          className={`button ${destructive ? 'button--danger' : 'button--primary'}`}
        >
          {confirmLabel}
        </button>
      </>
    }
  >
    <div className="flex items-start gap-3">
      <div
        className={`w-9 h-9 grid place-items-center shrink-0 rounded-md ${
          destructive
            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
        }`}
        aria-hidden="true"
      >
        <AlertTriangle className="w-4 h-4" />
      </div>
      <p className="m-0 text-xs leading-5 text-slate-700 dark:text-slate-300 whitespace-pre-line">
        {message}
      </p>
    </div>
  </Modal>
);
