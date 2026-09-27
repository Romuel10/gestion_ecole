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

Les sessions Auth utilisent le stockage local Expo SQLite. Les affectations,
élèves, périodes, évaluations et notes consultées sont également mis en cache.

Si une écriture échoue faute de réseau :
- l'appel ou les notes sont stockés dans `mutation_queue` ;
- l'indicateur "en attente" apparaît dans l'en-tête ;
- le bouton de synchronisation renvoie les opérations dans l'ordre à Supabase.
