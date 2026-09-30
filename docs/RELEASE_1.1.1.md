# Sekoly 1.1.1 — Dates et lisibilité

## Nouveautés

- Dates affichées au format **jour-mois-année** : `23-10-2025` dans les dossiers, admissions, présences, encaissements, salaires, caisse, années/périodes et suivi des demandes en ligne.
- Même format dans les certificats, bulletins, reçus, fiches de paie, cartes scolaires et exports Excel. Les rendez-vous et sauvegardes affichent aussi l'heure : `23-10-2025 09:05`.
- Saisie des dates avec un format français explicite, validation des jours et années bissextiles, et bouton calendrier. Le format ne dépend plus de la langue de Windows.
- **Paramètres → Affichage → Taille des textes** : curseur de 100 à 150 %, aperçu immédiat, boutons rapides et mémorisation sur l'appareil. Menus, tableaux, formulaires et fenêtres suivent ce réglage.
- Application enseignant : dates au même format et commandes **A− / A+** sur l'accueil et l'écran de connexion, mémorisées sur le téléphone.

Les dates restent enregistrées dans leur format technique d'origine pour conserver les tris, calculs et synchronisations. Aucune migration ni réinitialisation de la base n'est nécessaire. Les dimensions des documents imprimés et des PDF restent stables lorsque l'on agrandit l'interface.

## Installation Windows

1. Dans l'ancienne version, exportez une sauvegarde depuis **Paramètres → Données**.
2. Fermez Sekoly.
3. Téléchargez et exécutez **Sekoly_1.1.1_x64-setup.exe** depuis cette version GitHub.
4. Ouvrez **Paramètres → Affichage** et choisissez la taille qui vous convient.

Le chemin de la base SQLite, l'identifiant de l'application et la protection contre le double lancement restent inchangés.

## Vérification

- 13 tests de logique : dates, fuseaux horaires, valeurs absentes, saisies invalides, calculs et formulaire familial existant.
- 22 scénarios navigateur sur le bundle de production : les 9 modules, installation vide et simulation, thèmes clair/sombre, largeurs 390/800/1366, agrandissement à 150 %, persistance, saisie des dates, contenu du certificat PDF et export Excel.
- Compilation TypeScript et contrôle du code ; certains avertissements préexistants du linter restent présents.
- Contrôle TypeScript de l'application enseignant. La validation sur téléphone physique reste à réaliser ; aucune opération sur les données d'une école réelle pendant ces tests.
- Le workflow Windows construit les installateurs et vérifie le lancement unique. La publication est conditionnée à sa réussite et à celle de la CI du même commit.

Le binaire `specific` demandé par les instructions du dépôt n'est pas disponible dans l'environnement local. Aucun serveur de développement de remplacement n'a été lancé : les tests navigateur servent directement les fichiers compilés avec Playwright. Aucun changement d'infrastructure n'est inclus.
