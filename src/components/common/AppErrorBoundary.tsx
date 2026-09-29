import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Erreur inattendue.',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Sekoly interface error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="app-startup">
        <div className="app-startup__card" role="alert">
          <div className="w-11 h-11 mx-auto mb-3 grid place-items-center rounded-md bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h1 className="app-startup__title">Sekoly a rencontré un problème</h1>
          <p className="app-startup__message">
            Vos données enregistrées ne sont pas supprimées. Rechargez l’interface pour
            reprendre le travail.
          </p>
          {this.state.message && (
            <p className="mt-3 text-[10px] text-slate-500 break-words">
              {this.state.message}
            </p>
          )}
          <button
            type="button"
            className="button button--primary mt-5"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Recharger Sekoly
          </button>
        </div>
      </div>
    );
  }
}
