# EduGasy Pro

Logiciel de gestion scolaire pour les établissements d'enseignement primaire, collège et lycée à Madagascar. Conçu pour couvrir les besoins administratifs, pédagogiques et financiers d'une école, en s'appuyant sur les usages du Ministère de l'Éducation Nationale (structures CISCO, DREN, ZAP, bulletins trimestriels sur 20, mentions officielles).

L'application fonctionne entièrement en local, dans le navigateur. Aucun serveur n'est requis : les données sont enregistrées dans le navigateur et peuvent être sauvegardées ou restaurées sous forme de fichier JSON.

## Modules

### Inscriptions
Saisie du dossier élève (état civil, parents ou tuteurs, établissement d'origine), attribution automatique du matricule selon une formule paramétrable, encaissement des droits d'inscription avec récépissé numéroté, et réinscription rapide des élèves des années précédentes.

### Fichier élèves
Répertoire avec recherche par nom, matricule, classe ou statut. Chaque élève dispose d'une fiche individuelle regroupant ses informations civiles, ses notes, l'historique de ses règlements d'écolage et son suivi d'assiduité. Export du registre en CSV.

### Notes et bulletins
Saisie des notes par classe et par matière (contrôles continus, devoirs, compositions). Calcul automatique des moyennes par matière, de la moyenne générale pondérée, du rang dans la classe et des mentions. Génération des bulletins trimestriels au format PDF, individuellement ou pour une classe entière.

### Finances
Recouvrement des écolages mensuels (septembre à juin) avec suivi par élève et par mois. Encaissements par espèces, Mobile Money (MVola, Orange Money, Airtel Money), virement ou chèque. Paie du personnel enseignant titulaire (salaire fixe) et vacataire (taux horaire), avec retenues CNaPS et OSTIE. Journal de casse pour les recettes et dépenses courantes.

### Emplois du temps
Planning hebdomadaire consultable par classe, par enseignant ou par salle, avec détection des conflits de réservation.

### Paramétrage
Identification de l'établissement, gestion des années scolaires et des trimestres, classes et coefficients par matière, formule de matricule, sauvegarde et restauration de la base de données.

## Interface

Bureau de travail avec barre de menus, barre latérale, barre d'état et palette de commandes (Ctrl + K). Mode clair et mode sombre, mémorisés entre les sessions. Une vue 3D du campus est disponible sur le tableau de bord.

## Développement

Prérequis : Node.js 18 ou plus récent.

```bash
npm install
npm run dev
```

Autres scripts disponibles :

```bash
npm run build    # compilation TypeScript + build de production
npm run preview  # prévisualisation du build de production
npm run lint     # vérification statique avec oxlint
```

## Données

La base est stockée dans le navigateur (localStorage). Pensez à exporter régulièrement une sauvegarde JSON depuis le menu Fichier ou la page Paramétrage — c'est le seul moyen de récupérer les données en cas de nettoyage du navigateur, ou de les transférer vers un autre poste.
