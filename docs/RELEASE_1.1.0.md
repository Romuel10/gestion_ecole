# Sekoly 1.1.0 — démarrage et interfaces

## Installation

Télécharger l’installateur Windows `.exe` depuis la version GitHub, puis l’exécuter sur le poste existant. Le `.msi` est également fourni. Ne pas utiliser le ZIP du code source pour installer le logiciel.

Avant une mise à jour, exporter une sauvegarde depuis **Paramètres → Données**. Le nom de la base SQLite et l’identifiant de l’application restent identiques ; la mise à jour ne réinitialise pas les dossiers.

## Changements

- Démarrage Windows sans console et instance unique : un second lancement ramène la fenêtre existante.
- Nouveau logo Sekoly et introduction en 3D CSS de 2,2 secondes, dans la fenêtre principale, avec accès immédiat dès que les données sont prêtes et respect de la préférence de réduction des mouvements.
- Les modules attendent la lecture SQLite. En cas d’échec, un message et une action de reprise remplacent l’accès à un cache potentiellement périmé.
- Chargement des modules à la demande, pour réduire le téléchargement initial.
- Navigation compacte, libellés accessibles, recherche au clavier, confinement/restauration du focus des dialogues et notifications stabilisées.
- Écran guidé des Admissions lorsqu’aucune classe n’est encore configurée.
- Date de naissance laissée vide. Respect des frais d’inscription à zéro, sans paiement fictif.
- Encaissement rapide conservé pendant le chargement du module ; changement d’année ferme les anciens dossiers.
- Sélecteur de classe adapté aux petits écrans ; dialogues imprimables sans limite de hauteur.

- Bibliothèque Excel remplacée par SheetJS 0.20.3 provenant du CDN officiel ; contrôle des dépendances de production ajouté avant construction.

## Validation et limites

Les 9 tests existants vérifient les calculs et la structure du portail famille. Les 17 scénarios Playwright supplémentaires utilisent le véritable build de production : neuf modules, thèmes clair/sombre, largeurs 390/800/1366 px, installation vide et jeu simulé de 200 dossiers répartis sur deux années, recherche, formulaires, encaissement, changement d’année, import et exports PDF/Excel, impression des cartes et lecture SQLite simulée (lente ou en échec).

Le workflow Windows contrôle le sous-système GUI du binaire compilé, ouvre l’exécutable deux fois et vérifie qu’une seule instance reste active. Les installateurs sont publiés seulement après réussite de la construction Windows, de ce test et du workflow CI du même commit.

Ces contrôles ne remplacent pas une recette sur le poste de l’établissement. Ils ne valident pas les services Cloud en production, l’APK enseignant, l’envoi d’e-mails, ni toutes les combinaisons de données réelles. Aucun test ne modifie les données des écoles en production. Les avertissements de lint hérités restent visibles dans CI.

## Reproduire les contrôles

```bash
npm ci
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:ui
```

Les tests d’interface lisent `dist/` dans un navigateur isolé, sans serveur de développement. Pour un serveur local interactif, utiliser `specific dev` conformément à `AGENTS.md`. Le CLI Specific n’était pas disponible dans l’environnement de préparation ; aucune configuration Specific n’a été modifiée.

Référence du mécanisme d’instance unique : https://v2.tauri.app/plugin/single-instance/
