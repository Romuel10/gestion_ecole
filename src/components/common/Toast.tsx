import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

interface ToastProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: (id: string) => void }> = ({
  toast,
  onRemove,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast, onRemove]);

  const styles = {
    success: 'bg-emerald-900/90 text-white border-emerald-500/50 shadow-emerald-950/40',
    error: 'bg-rose-900/90 text-white border-rose-500/50 shadow-rose-950/40',
    info: 'bg-slate-900/90 text-white border-blue-500/50 shadow-slate-950/40',
  };

  const Icon =
    toast.type === 'success'
      ? CheckCircle2
      : toast.type === 'error'
      ? AlertCircle
      : Info;

  return (
    <div
      className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border backdrop-blur-md shadow-xl text-xs font-medium animate-in slide-in-from-bottom-5 duration-150 ${styles[toast.type]}`}
    >
      <div className="flex items-center space-x-2.5">
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span>{toast.text}</span>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="ml-3 p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
