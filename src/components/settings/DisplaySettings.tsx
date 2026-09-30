import { useState } from 'react';
import { readTextScale, saveTextScale } from '../../services/displayPreferences';

export function DisplaySettings() {
  const [scale, setScale] = useState(readTextScale);
  const changeScale = (value: number) => { setScale(value); saveTextScale(value); };
  return <section className="page-panel p-5 space-y-5" aria-labelledby="display-heading">
    <div>
      <h2 id="display-heading" className="page-panel__title">Affichage et lisibilité</h2>
      <p className="page-panel__subtitle">Réglage appliqué immédiatement et mémorisé sur cet appareil.</p>
    </div>
    <div className="space-y-3">
      <label htmlFor="text-scale" className="font-semibold">Taille des textes : <output>{scale} %</output></label>
      <input id="text-scale" className="block w-full max-w-lg" type="range" min="100" max="150" step="5"
        value={scale} aria-valuetext={`${scale} %`} onChange={(event) => changeScale(Number(event.target.value))} />
      <div className="flex flex-wrap gap-2">
        {[100, 115, 125, 150].map((value) => <button type="button" key={value} aria-pressed={scale === value}
          className={`button ${scale === value ? 'button--primary' : 'button--secondary'}`}
          onClick={() => changeScale(value)}>{value === 100 ? 'Standard' : `${value} %`}</button>)}
      </div>
      <p className="text-sm text-slate-500">Les menus, tableaux, formulaires et fenêtres s’agrandissent ensemble. La mise en page des documents imprimés conserve ses dimensions.</p>
    </div>
    <div className="rounded-md border border-slate-200 dark:border-slate-700 p-4 space-y-2">
      <p className="font-semibold">Aperçu de lecture</p>
      <p>Dossier élève · Date de naissance : 23-10-2025</p>
      <p className="text-sm text-slate-500">Format des dates : jour-mois-année (JJ-MM-AAAA).</p>
    </div>
  </section>;
}
