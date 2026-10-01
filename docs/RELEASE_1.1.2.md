# Sekoly 1.1.2 — contrôle pré-publication PDF et interfaces

## Correctifs

- Corrige le cas où un **logo centré** pouvait se superposer au nom de l’établissement dans les PDF.
- Réserve automatiquement l’espace vertical nécessaire au logo avant d’écrire les informations de l’établissement.
- Protège les petits formats, notamment les reçus, en limitant la largeur latérale du logo selon la largeur réelle de la page.
- Aligne la plage de largeur du moteur PDF avec le réglage de l’interface et conserve les proportions du logo.
- N’accepte à l’import que les formats explicitement pris en charge pour les documents : **PNG** et **JPG/JPEG**.
- Ajoute un test de géométrie de l’en-tête PDF et un scénario Playwright générant réellement un certificat avec un logo PNG centré.

## Contrôles attendus avant fusion

- `npm audit --omit=dev --audit-level=high`
- `npm run build`
- `npm run lint`
- `npm test`
- `npm run test:ui`
- Construction Windows Tauri des installateurs NSIS et MSI.
- Démarrage réel du binaire Windows et contrôle de l’instance unique.
- CI mobile enseignant et construction APK existantes.

## Publication

Cette version doit remplacer la 1.1.1 pour toute nouvelle diffusion publique. La branche de pré-publication reste séparée de `main` jusqu’à validation des contrôles GitHub.
