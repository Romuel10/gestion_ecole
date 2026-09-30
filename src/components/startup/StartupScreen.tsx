import { useEffect, useState } from 'react';

interface StartupScreenProps {
  ready: boolean;
  error: string;
  onFinish: () => void;
}

export function StartupScreen({ ready, error, onFinish }: StartupScreenProps) {
  const [introFinished, setIntroFinished] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const timer = window.setTimeout(() => setIntroFinished(true), 2200);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (ready && introFinished && !error) onFinish();
  }, [ready, introFinished, error, onFinish]);

  return (
    <main className="startup-screen" aria-label="Démarrage de Sekoly">
      <div className="startup-screen__halo" aria-hidden="true" />
      <div className="startup-screen__content">
        <div className="startup-emblem" aria-hidden="true">
          <div className="startup-emblem__depth" />
          <div className="startup-emblem__face"><img src="/sekoly-app.svg" alt="" width="160" height="160" /></div>
        </div>
        <p className="startup-screen__eyebrow">L’école, en confiance.</p>
        <h1>SEKOLY</h1>
        <p className="startup-screen__tagline">La gestion scolaire, simplement.</p>
        {error ? (
          <div className="startup-screen__error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>Réessayer</button>
          </div>
        ) : (
          <>
            <div className="startup-screen__loader" aria-hidden="true"><span /></div>
            <p className="startup-screen__status" role="status">{ready ? 'Votre espace est prêt' : 'Ouverture de votre établissement…'}</p>
            {ready && <button className="startup-screen__skip" type="button" onClick={onFinish}>Accéder à mon espace</button>}
          </>
        )}
      </div>
      <p className="startup-screen__footer"><span aria-hidden="true" />Conçu pour les établissements de Madagascar</p>
    </main>
  );
}
