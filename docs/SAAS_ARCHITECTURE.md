# Architecture Sekoly SaaS V1

Sekoly évolue vers une plateforme multi-écoles tout en conservant le logiciel
Desktop/local existant pendant la migration.

## Produits

### Sekoly Admin

Application React/Vite et Tauri destinée à la direction, au secrétariat et à
l'administration.

La V1 SaaS ajoute **Paramètres > Cloud & mobile** :

- création / connexion d'un compte Sekoly Cloud ;
- création du tenant établissement ;
- synchronisation de la structure locale ;
- invitation des enseignants ;
- récupération des appels et notes saisis sur mobile.

### Sekoly Enseignant

Application React Native + Expo dans `apps/teacher-mobile`.

Fonctions V1 :

- connexion / activation de compte ;
- affectations classe + matière ;
- emploi du temps personnel ;
- cahier de présences ;
- retards et motifs ;
- création d'évaluations ;
- saisie des notes ;
- cache SQLite ;
- file d'attente hors ligne ;
- synchronisation Supabase ;
- Realtime privé par établissement.

## Backend Supabase

Projet Supabase dédié : `cmpbrouwcfoauwyeiyfj` (`sekoly`).

Le projet est désormais dédié à Sekoly. Les tables restent préfixées `sekoly_` pour conserver une convention explicite et faciliter les migrations.

### Multi-tenant

La séparation principale est `school_id`.

Tables de base :

- `sekoly_schools`
- `sekoly_memberships`

Rôles :

- `SCHOOL_ADMIN`
- `DIRECTOR`
- `SECRETARY`
- `ACCOUNTANT`
- `TEACHER`
- `SUPERVISOR`

Chaque utilisateur peut appartenir à plusieurs écoles via
`sekoly_memberships`.

### Données académiques

- `sekoly_school_years`
- `sekoly_terms`
- `sekoly_subjects`
- `sekoly_classes`
- `sekoly_students`
- `sekoly_enrollments`
- `sekoly_teachers`
- `sekoly_class_subjects`
- `sekoly_teacher_assignments`
- `sekoly_timetable_slots`

### Présences

- `sekoly_attendance_sessions`
- `sekoly_attendance_entries`

Une séance représente un appel d'une classe/matière. Les entrées représentent
le statut de chaque élève.

### Notes

- `sekoly_assessments`
- `sekoly_assessment_scores`

Les évaluations remplacent progressivement le modèle local
`evaluations: number[]` et permettent de représenter chaque DS, composition,
oral ou devoir séparément.

## Sécurité RLS

Toutes les tables Sekoly sont protégées par Row Level Security.

Un enseignant :

- ne lit que ses affectations ;
- ne lit que ses classes et matières ;
- ne lit que les élèves inscrits dans ses classes ;
- ne lit que son emploi du temps ;
- ne crée/modifie que ses séances d'appel ;
- ne crée/modifie que ses évaluations et notes ;
- ne peut pas écrire dans une période verrouillée.

Les fonctions privées de contrôle sont dans le schéma `sekoly_private`.

Aucune clé `service_role` / secret key ne doit être placée dans Admin ou
Sekoly Enseignant.

## Realtime

Les changements de présence et de notes déclenchent
`realtime.broadcast_changes`.

Topic privé :

```text
school:<school_uuid>:sync
```

Les policies de `realtime.messages` autorisent uniquement les membres actifs
de l'école correspondante.

## Edge Functions

### sekoly-create-school

Crée un établissement et rattache le compte appelant comme
`SCHOOL_ADMIN`.

### sekoly-invite-teacher

Réservée à `SCHOOL_ADMIN` / `DIRECTOR`.

- envoie l'invitation Auth ;
- crée le membership `TEACHER` ;
- lie le compte Auth à la fiche enseignant existante ;
- redirige vers `sekoly-teacher://auth/callback`.

## Offline mobile

SQLite local contient :

- cache des affectations ;
- cache emploi du temps ;
- cache élèves ;
- cache périodes / évaluations / notes ;
- `mutation_queue`.

Les écritures réseau échouées sont rejouées dans l'ordre au prochain clic
**Synchroniser**.

## Migration du logiciel local

`CloudSyncService` produit des UUID stables à partir des identifiants locaux,
puis synchronise :

1. années et périodes ;
2. matières ;
3. classes ;
4. élèves uniques par matricule ;
5. inscriptions annuelles ;
6. enseignants ;
7. affectations ;
8. emploi du temps.

Les présences et notes mobiles sont ensuite reconstruites dans les structures
locales actuelles afin que les écrans existants continuent à fonctionner
pendant la transition.

## Points avant production

- ajouter `sekoly-teacher://auth/callback` aux Redirect URLs Supabase Auth ;
- configurer un SMTP de production pour les invitations ;
- activer la protection contre les mots de passe compromis dans Supabase Auth ;
- créer le projet Expo/EAS et remplacer `REPLACE_WITH_EXPO_PROJECT_ID` ;
- tester avec une école pilote avant ouverture multi-écoles ;
- à terme, faire de Supabase la source principale de Sekoly Admin au lieu du
  pont de synchronisation local/cloud.


## Validation pilote de bout en bout

Sekoly Admin contient maintenant deux niveaux de contrôle dans **Paramètres > Cloud & mobile** :

1. **Diagnostic du pilote** : vérifie les volumes synchronisés, l'année active et la présence d'au moins un accès enseignant.
2. **Test pilote de bout en bout** : appelle la fonction Edge `sekoly-pilot-smoke-test` et contrôle sans modifier les données :
   - établissement actif ;
   - année scolaire active ;
   - période non verrouillée ;
   - classes et matières ;
   - élèves et inscriptions ;
   - adresse email enseignant ;
   - compte mobile enseignant ;
   - affectation classe/matière liée à ce compte ;
   - emploi du temps (optionnel) ;
   - configuration Resend (optionnelle pour le pilote avec mot de passe temporaire).

La synchronisation Admin est bidirectionnelle : la structure locale est envoyée vers Supabase, puis les présences et notes saisies dans Sekoly Enseignant sont rapatriées dans Sekoly Admin. Le logiciel effectue également une récupération périodique lorsque la session Cloud est active.


## Supervision des synchronisations et audit

La phase pilote inclut maintenant une supervision opérationnelle dans **Paramètres > Cloud & mobile**.

### Événements de synchronisation

La table `sekoly_sync_events` enregistre les événements utiles de Sekoly Enseignant et de Sekoly Admin :

- ouverture de l'application ;
- début / succès / erreur de synchronisation ;
- présences enregistrées ;
- notes enregistrées ;
- évolution de la file hors ligne.

Chaque événement conserve l'établissement, l'utilisateur, l'enseignant si applicable, un identifiant d'appareil, la plateforme, l'état, le nombre d'opérations en attente et un message d'erreur éventuel.

Les enseignants ne peuvent écrire que leurs propres événements. La lecture de supervision est réservée aux rôles de direction autorisés par RLS.

### État des appareils

Le moniteur Cloud agrège la dernière activité par appareil et classe chaque appareil :

- **Synchronisé** ;
- **En attente** si des opérations restent dans la file hors ligne ;
- **Erreur** si le dernier événement a échoué ;
- **Inactif** si aucun événement récent n'a été reçu.

La fonction Edge active est `sekoly-sync-monitor`. Son implémentation RLS est versionnée sous `supabase/functions/sekoly-sync-monitor-rls/`.

### Journal d'audit

Des triggers PostgreSQL alimentent automatiquement `sekoly_audit_logs` lors des modifications concernant :

- inscriptions ;
- enseignants ;
- affectations ;
- séances de présence et lignes d'appel ;
- évaluations ;
- notes.

Le journal expose l'acteur, l'action, le type d'objet et la date sans recopier le contenu scolaire complet dans l'audit.

### Interface Admin

La section **Supervision des synchronisations** affiche :

- nombre d'appareils connus et actifs sur 24 h ;
- appareils avec file en attente ou état anormal ;
- erreurs de synchronisation des dernières 24 h ;
- dernière activité et dernière erreur de chaque appareil ;
- événements de synchronisation récents ;
- journal d'audit de l'établissement.
