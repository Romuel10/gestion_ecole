# SEKOLY

**Sekoly** est un logiciel local de gestion d'établissement scolaire conçu pour Madagascar.

L'application reste utilisable en mode web pour le développement, mais la version destinée aux établissements est une application de bureau **Tauri + SQLite**. Aucun serveur, compte cloud ou abonnement n'est nécessaire.

## Version 1.2.0

Assistant de première configuration, import Excel des enseignants et des appels,
et échanges Excel avec Sekoly Enseignant sans compte cloud ni connexion initiale.
Cette version inclut les corrections pré-publication de la 1.1.2 : portail familial,
persistance SQLite, restauration, comptes mobiles, synchronisation, sauvegardes,
calculs métier, PDF et dates JJ-MM-AAAA. Voir [les notes de version](docs/RELEASE_1.2.0.md)
et [le suivi des 17 constats](docs/AUDIT_CORRECTIONS.md). Les changements sont en
validation avant publication des installateurs dans [Releases](https://github.com/Romuel10/gestion_ecole/releases).

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
- assistant de configuration initiale ;
- import Excel des enseignants et des appels ;
- échanges Excel avec Sekoly Enseignant sans connexion Internet ;
- documents scolaires PDF ;
- clôture annuelle ;
- sauvegarde et restauration.

## Import Excel

### Première utilisation

Au premier lancement d’une installation neuve, un assistant configure l’école,
l’année et les périodes scolaires, les classes et leurs frais, puis les matières
et coefficients. Chaque étape validée est enregistrée. Le tableau de bord s’ouvre
après la vérification finale. Les écoles déjà configurées ou restaurées conservent
leur accès habituel ; les paramètres restent modifiables ensuite.

### Enseignants

Dans **Enseignants**, télécharger **Modèle enseignants**, remplir la feuille
`Enseignants`, puis utiliser **Importer les enseignants**. Nom, prénoms et sexe
sont obligatoires. Un matricule vide est généré automatiquement ; les doublons
bloquent l’import. Les codes des matières et classes peuvent être séparés par
un point-virgule. Les salaires, taux horaires, contrats et dates sont contrôlés
avant confirmation. Cet import crée les fiches locales des enseignants.

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

### Appels

Dans **Vie scolaire**, télécharger **Modèle appels** ou choisir **Importer les
appels Excel**. Les statuts sont `PRESENT`, `ABSENT_NON_JUSTIFIE`,
`ABSENT_JUSTIFIE` et `RETARD` (ou P/A/J/R dans le modèle manuel). Les retards
exigent un nombre entier de minutes positif. Dates : **JJ-MM-AAAA** ou dates
Excel dans l’année scolaire active. Un appel déjà présent pour le même élève
et la même date est mis à jour ; les autres appels restent conservés.

### École et enseignants sans Internet

1. Configurer les classes, matières, élèves et enseignants. Affecter les matières
   aux enseignants dans les classes, ou renseigner leurs classes et spécialités.
2. Dans **Enseignants**, cliquer sur **Fichier de l’école** pour chaque professeur.
   Transmettre ce fichier Excel au téléphone par USB, Bluetooth ou carte mémoire.
3. Dans **Sekoly Enseignant**, choisir **Utiliser un fichier de l’école**, ouvrir
   le fichier, puis enregistrer les notes et les appels sur le téléphone. Aucun
   compte cloud ni première connexion n’est nécessaire pour ce mode.
4. Choisir **Exporter les notes en Excel** ou **Exporter les appels en Excel** et
   remettre les fichiers à la direction. Les saisies restent sur le téléphone,
   y compris si le partage est annulé.
5. Importer les notes dans **Notes et bulletins** et les appels dans **Vie scolaire**.
   La prévisualisation vérifie l’école, l’année, le professeur, les affectations,
   les dates, les notes et les verrous avant confirmation. Un import répété ne
   crée pas de doublon. Une modification intervenue dans le logiciel est signalée
   comme conflit et bloque l’import.
6. Préparer un nouveau **Fichier de l’école** après l’import. Son ouverture sur le
   téléphone actualise les listes et confirme les valeurs reçues. Le travail non
   confirmé est conservé. En cas de conflit, relire les valeurs de l’école et
   corriger la saisie avec la direction avant de la renvoyer.

Le fichier de préparation ne contient que les élèves, classes, matières, notes
et appels nécessaires à cet enseignant, sans données de salaire ni contacts
familiaux. Il représente son accès local : transmettre les fichiers uniquement
au professeur concerné et protéger le téléphone. Le mode cloud reste disponible
séparément. Voir [le guide des échanges Excel](docs/TEACHER_EXCEL_EXCHANGE.md).

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
