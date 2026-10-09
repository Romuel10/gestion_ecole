# Sekoly Enseignant

Application mobile Expo / React Native destinée aux enseignants.

## Fonctions V1

- connexion Supabase Auth par email / mot de passe ;
- activation du compte depuis une invitation `sekoly-teacher://auth/callback` ;
- affichage de l'établissement, de l'année active et des affectations ;
- emploi du temps personnel ;
- cahier de présences par classe et matière ;
- présents, retards, absences justifiées / non justifiées ;
- création d'évaluations ;
- fiche de notes par élève ;
- cache SQLite local ;
- file d'attente hors ligne pour appels et notes ;
- synchronisation manuelle ;
- abonnement Realtime privé par établissement.
- ouverture d’un fichier de l’école sans compte cloud ni connexion initiale ;
- saisie de notes et d’appels conservée dans SQLite après fermeture ;
- exports Excel distincts des notes et des appels ;
- actualisation des listes par fichier, sans effacer le travail non confirmé.

## Configuration

Copier `.env.example` vers `.env` :

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

Le projet Supabase cible actuellement Sekoly Cloud. Ne jamais mettre de clé
`service_role` / secret key dans l'application mobile.

## Installation

Node.js 22.13+ recommandé avec Expo SDK 57.

```bash
npm install
npm run typecheck
npx expo start
```

## Build Android interne

Après avoir connecté le projet à un compte Expo / EAS :

```bash
npx eas build --platform android --profile preview
```

Le profil `preview` produit un APK destiné aux essais terrain.

## Invitation

La fonction Supabase `sekoly-invite-teacher` envoie une invitation vers :

```text
sekoly-teacher://auth/callback
```

Ce schéma doit être ajouté à la liste des URLs de redirection autorisées dans
Supabase Auth avant un pilote réel.

## Hors ligne

### Échanges de fichiers sans Internet

La direction prépare un **Fichier de l’école** dans le module **Enseignants**
du logiciel desktop. Le professeur le copie sur son téléphone, choisit
**Utiliser un fichier de l’école** puis l’ouvre. Ce mode ne demande pas de compte
Supabase ni de première connexion.

Enregistrer les notes ou les appels avant de changer d’écran. Les données sont
stockées dans `sekoly-teacher-excel.sqlite`, séparément du cache et de la file
cloud. L’application reprend ce mode et le dernier fichier après fermeture.
Les exports partagent un fichier `.xlsx` via le téléphone et ne suppriment jamais
le travail. La direction importe les deux types de fichier dans leurs modules
respectifs, puis renvoie un nouveau fichier scolaire. Les valeurs reçues à
l’identique confirment le travail ; les autres saisies restent conservées.

Le fichier scolaire identifie le professeur et contient ses listes d’élèves :
ne le confier qu’à son destinataire et protéger le téléphone. Le bouton
**Revenir au mode connecté** conserve toutes les données Excel.

### Mode cloud avec coupures de réseau

Les sessions Auth utilisent le stockage local Expo SQLite. Les affectations,
élèves, périodes, évaluations et notes consultées sont également mis en cache.

Si une écriture échoue faute de réseau :
- l'appel ou les notes sont stockés dans `mutation_queue` ;
- l'indicateur "en attente" apparaît dans l'en-tête ;
- le bouton de synchronisation renvoie les opérations dans l'ordre à Supabase.
