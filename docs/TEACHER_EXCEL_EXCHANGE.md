# Assistant initial et échanges Excel enseignants

## Configuration initiale

L’assistant intervient après la lecture de la base locale sur une installation
neuve. Il configure l’identité de l’école, l’année et les périodes, les classes,
les frais d’inscription/réinscription/écolage et les matières avec coefficients.
La validation d’une étape est durable avant la navigation suivante. En cas
d’échec SQLite, la saisie reste visible et peut être enregistrée de nouveau.
La configuration terminée ne réapparaît pas sur les écoles existantes. Ses
paramètres restent accessibles dans le module Paramètres.

## Préparer les professeurs

Dans Enseignants, le modèle Excel contient les colonnes :

| Colonne | Règle |
| --- | --- |
| Matricule | Unique ; vide pour générer ENS-xxx |
| Nom, Prénoms | Obligatoires |
| Sexe | M ou F |
| Contrat | TITULAIRE, VACATAIRE, FRAM, STAGIAIRE ; vide = TITULAIRE |
| Matières, Classes | Codes ou noms existants séparés par « ; » |
| Salaire mensuel, Taux horaire, Heures hebdomadaires | Nombres positifs ou nuls ; vide = 0 |
| Date embauche | JJ-MM-AAAA ou date Excel ; vide = date du jour |
| Téléphone, Email, Adresse, Diplôme, Numéro CIN | Facultatifs ; email contrôlé |

Cet import ajoute des enseignants. Il ne remplace pas une fiche portant le même
matricule et ne crée pas automatiquement de compte cloud. Une affectation
explicite d’une matière dans une classe prime sur les classes et spécialités
déclarées dans la fiche d’un autre enseignant.

## Échanges sans Internet

1. La direction clique sur Fichier de l’école pour un enseignant affecté.
2. Elle copie le fichier sur le téléphone (USB, Bluetooth, carte mémoire).
3. Le professeur ouvre Sekoly Enseignant → Utiliser un fichier de l’école.
4. Il sélectionne la classe et la période, saisit les notes et enregistre sur
   le téléphone. Pour l’appel, il valide la date puis enregistre les statuts.
5. Depuis Mes fichiers, il exporte les notes et les appels séparément.
6. La direction ouvre Notes et bulletins → importer le fichier de notes, puis
   Vie scolaire → Importer les appels Excel. Elle corrige les erreurs signalées
   avant de confirmer. Les autres données ne sont pas remplacées.
7. Elle prépare un nouveau fichier de l’école. Le professeur l’ouvre pour
   actualiser les listes et confirmer les saisies reçues.

Un export ne vaut pas confirmation de réception et ne supprime aucune saisie.
Les données confirmées par les valeurs du nouveau fichier restent consultables
comme données de l’école, mais ne sont plus proposées à l’export. Plusieurs
écoles, enseignants ou années ont des espaces SQLite distincts sur le téléphone.

## Erreurs et conflits

- Un fichier d’une autre école, année ou enseignant ne peut pas être importé.
- Une période verrouillée interdit l’import des notes.
- Les notes sont comprises entre 0 et 20, avec coefficients positifs. Une cellule
  vide représente une note manquante ; zéro reste une note.
- L’appel utilise PRESENT, ABSENT_JUSTIFIE, ABSENT_NON_JUSTIFIE, RETARD. Un retard
  exige un entier de minutes positif. Les dates sont civiles, sans décalage de fuseau.
- Une fiche de notes ou un appel présent deux fois dans un même fichier est refusé.
- Réimporter les mêmes valeurs est accepté et garde les identifiants existants.
- Le fichier conserve l’état initial des valeurs. Si l’école a modifié ou supprimé
  une fiche depuis sa préparation, l’import signale un conflit. Actualiser le
  fichier scolaire, relire les valeurs et décider avec la direction avant de
  réenregistrer la saisie. La validation est répétée dans la file d’écriture
  locale afin de protéger une modification faite après la prévisualisation.
- Les corrections Excel des notes sont protégées contre le rétablissement d’une
  ancienne évaluation lors de la synchronisation cloud.

## Format et conservation

Le protocole est commun au desktop et au mobile dans
`apps/teacher-mobile/src/shared/teacherExchange.ts`. Le desktop le réexporte
depuis `src/shared/teacherExchange.ts`.

La feuille Configuration distingue `SEKOLY_TEACHER_PACKAGE` (préparation) et
`SEKOLY_TEACHER_RESULTS` (retour), version 1, avec identifiants de l’école,
enseignant et année. Ne pas modifier cette feuille ni les empreintes initiales.
Les fichiers de retour utilisent les feuilles Notes et Appels. Les cellules
du protocole servent à la cohérence et aux conflits ; elles ne constituent pas
une signature électronique du professeur. La direction reste responsable de
vérifier le fichier remis et de confirmer l’import.

Le fichier de préparation contient les listes et résultats nécessaires au
professeur, sans salaires, CIN ni contacts des parents. Transmettre uniquement
aux personnes concernées, protéger le téléphone et conserver les sauvegardes
JSON du logiciel. Ne pas désinstaller l’application mobile avant d’avoir
transmis les saisies : une désinstallation retire son stockage SQLite local.

## Validation

Les tests couvrent la configuration/reprise, les imports enseignants, les dates
Excel, les zéros et coefficients, la portée des fichiers, les verrous, les
doublons, les conflits, la conservation après export, l’actualisation et SQLite.
Les tests d’interface utilisent le bundle de production sans serveur ni réseau.
La compilation Expo Android vérifie les modules de sélection et de partage
des fichiers. Les APK et installateurs desktop sont produits par GitHub Actions.
