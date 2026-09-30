# SEKOLY

**Sekoly** est un logiciel local de gestion d'établissement scolaire conçu pour Madagascar.

L'application reste utilisable en mode web pour le développement, mais la version destinée aux établissements est une application de bureau **Tauri + SQLite**. Aucun serveur, compte cloud ou abonnement n'est nécessaire.

## Version 1.1.1

Dates affichées et saisies au format **JJ-MM-AAAA** et taille des textes personnalisable dans **Paramètres → Affichage** (100 à 150 %, mémorisée sur chaque appareil). Voir [les notes de version et contrôles](docs/RELEASE_1.1.1.md). Les installateurs validés sont disponibles dans [Releases](https://github.com/Romuel10/gestion_ecole/releases).

## Principes

- fonctionnement local et hors ligne ;
- base SQLite stockée sur le poste ;
- sauvegarde/restauration JSON ;
- installation Windows en `.exe` ou `.msi` ;
- logo du logiciel distinct du logo de l'établissement ;
- données neuves à la première installation ;
- classes, matières, enseignants et paramètres configurables par l'utilisateur.

## Modules

- admissions et réinscriptions ;
- fichier élèves ;
- import Excel des élèves ;
- notes et bulletins ;
- import Excel des notes ;
- décisions annuelles et passage de classe ;
- vie scolaire et assiduité ;
- emploi du temps manuel ou automatique ;
- finances et clôture de caisse ;
- enseignants ;
- documents scolaires PDF ;
- clôture annuelle ;
- sauvegarde et restauration.

## Import Excel

### Élèves

Dans **Élèves** :

1. cliquer sur **Modèle Excel** ;
2. remplir la feuille `Eleves` ;
3. utiliser les codes/noms des classes configurées ;
4. laisser le matricule vide si Sekoly doit le générer ;
5. cliquer sur **Importer Excel** ;
6. corriger les erreurs éventuelles puis confirmer l'import.

### Notes

Dans **Notes et bulletins** :

1. télécharger **Modèle notes Excel** ;
2. renseigner matricule, matière, période et notes ;
3. importer le fichier ;
4. Sekoly vérifie les notes 0–20, les matières, les élèves et les périodes verrouillées ;
5. les notes existantes sont mises à jour sans créer de doublons.

## Développement web

Prérequis : Node.js 22 recommandé.

```bash
npm ci
npm run dev
```

Validation :

```bash
npm run build
npm run lint
```

## Développement desktop

Prérequis supplémentaires :

- Rust stable ;
- Tauri CLI 2 ;
- sous Windows : Microsoft C++ Build Tools / WebView2 selon l'environnement de développement.

Installer Tauri CLI :

```bash
cargo install tauri-cli --version "^2.0.0" --locked
```

Générer les icônes du logiciel depuis l'identité Sekoly :

```bash
cargo tauri icon public/sekoly-app.svg
```

Lancer l'application desktop :

```bash
npm run desktop:dev
```

Créer les installateurs :

```bash
npm run desktop:build
```

Les bundles Windows sont produits sous `src-tauri/target/release/bundle/`.

## GitHub Actions

Le workflow **Windows Desktop** :

- compile le frontend ;
- installe Rust/Tauri ;
- génère les icônes depuis `public/sekoly-app.svg` ;
- construit un installateur NSIS `.exe` ;
- construit un installateur MSI ;
- publie les installateurs comme artefacts GitHub Actions.

Le mode WebView2 `offlineInstaller` est utilisé afin que l'installation finale ne dépende pas d'une connexion Internet.

## Données locales

Sur desktop, Sekoly utilise SQLite. Le fichier de base est créé dans le dossier de données local de l'application sous le nom :

```text
sekoly.sqlite
```

Le navigateur conserve seulement un cache de développement. Dans l'application Windows, SQLite est la persistance principale.

À la première installation, la base ne contient aucun élève, enseignant, classe, matière, note ou paiement. L'utilisateur configure son établissement puis peut importer ses listes depuis Excel.


## Sekoly SaaS / applications enseignants

Le dépôt contient maintenant une première architecture SaaS multi-écoles en
plus du mode Desktop/local.

### Backend

Supabase fournit :

- Auth ;
- PostgreSQL ;
- RLS multi-tenant par `school_id` ;
- Realtime Broadcast privé ;
- Edge Functions d'onboarding ;
- tables normalisées de présences et évaluations.

Les migrations sont dans `supabase/migrations/` et les fonctions dans
`supabase/functions/`.

### Sekoly Enseignant

L'application Expo se trouve dans :

```text
apps/teacher-mobile
```

Validation locale :

```bash
cd apps/teacher-mobile
cp .env.example .env
npm install
npm run typecheck
npx expo start
```

Voir `docs/SAAS_ARCHITECTURE.md` pour les règles RLS, la synchronisation et
le plan de déploiement.
