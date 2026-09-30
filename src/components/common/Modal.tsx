import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { useDialog } from '../../hooks/useDialog';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '7xl';
  actions?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = '2xl',
  actions,
}) => {
  const titleId = useId();
  const subtitleId = useId();
  const dialogRef = useDialog(isOpen, onClose);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '7xl': 'max-w-7xl',
  };

  return createPortal(
    <div className="app-dialog-host fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/45 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Box */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={`app-dialog relative w-full ${maxWidthClasses[maxWidth]} bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92dvh] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div>
            <h3 id={titleId} className="text-sm font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
            {subtitle && (
              <p id={subtitleId} className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="app-dialog__content p-6 overflow-y-auto space-y-4 text-slate-800 dark:text-slate-200">
          {children}
        </div>

        {/* Footer Actions */}
        {actions && (
          <div className="flex flex-wrap gap-3 items-center justify-end px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            {actions}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
