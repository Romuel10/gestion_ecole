# EduGasy Pro — Logiciel Bureautique de Gestion Scolaire Intégrée (Madagascar)

**EduGasy Pro** est un logiciel bureautique autonome conçu spécifiquement pour répondre aux exigences pédagogiques, administratives et financières des établissements scolaires à Madagascar (Enseignement Primaire, Collège et Lycée), conformément aux directives du **Ministère de l'Éducation Nationale (MEN)**.

---

## 🏛️ Architecture & Modules Principaux

### 1. Inscriptions & Réinscriptions (Guichet d'Admission)
- **Nouvelle Inscription** : Saisie du dossier civil, des parents/tuteurs, antécédents médicaux et établissement d'origine.
- **Attribution Automatique du Matricule** : Moteur dynamique selon la formule paramétrée (ex: `LPSM-2025-0101`).
- **Encaissement Immédiat des Droits** : Génération et impression instantanée du **Reçu de Quittance** officiel numéroté.
- **Réinscription Express** : Recherche rapide des élèves des années antérieures, mise à jour de la classe de passage et encaissement.
- **Documents Officiels Générés** : Certificat de scolarité officiel, Fiche d'inscription, Quittance de paiement.

### 2. Gestion des Élèves & Dossiers Individuels
- **Répertoire Général Filtrable** : Recherche instantanée par nom, prénom, matricule, classe, genre et statut.
- **Fiche Dossier Individuel** : 
  - État civil et contacts d'urgence.
  - Relevé des notes et historique académique.
  - Historique de tous les écolages versés.
  - Suivi d'assiduité (absences justifiées, non justifiées, retards).
- **Export & Sauvegarde** : Exportation du registre matricule en format CSV et impression des certificats.

### 3. Notes, Calculs Automatiques & Bulletins de Notes Officiels
- **Grille de Saisie Matricielle** : Saisie rapide par classe et matière (Contrôles continus, Devoirs, Compositions trimestrielles).
- **Calcul Automatique en Temps Réel** :
  - Moyenne de chaque matière sur 20.
  - Total des points et total des coefficients.
  - **Moyenne Générale Pondérée Trimestrielle**.
  - **Rang de l'élève** dans la classe (1er, 2ème, 3ème...).
  - Attribution des **Mentions et Distinctions** officielles (Félicitations, Encouragements, Tableau d'honneur, Avertissement, Blâme).
- **Générateur de Bulletins de Notes Conforme MEN Madagascar** :
  - En-tête républicain officiel : *Repoblikan'i Madagasikara / Fitiavana - Tanindrazana - Fandrosoana*.
  - Mentions CISCO, DREN, ZAP et N° Décision d'ouverture.
  - Tableau des disciplines avec coefficients, notes, moyennes de classe (Min, Max, Moyenne), appréciations et signatures.
  - Impression et export PDF individuel ou groupé pour toute la classe en 1 clic.

### 4. Finances, Écolages & Paie du Personnel
- **Recouvrement des Écolages** :
  - Grille mensuelle par élève (Septembre à Juin).
  - Encaissement multi-moyens de paiement adaptés à Madagascar : **Espèces, MVola (Telma), Orange Money, Airtel Money, Virement bancaire (BOA, BNI, BMOI, Société Générale), Chèque**.
  - Émission immédiate de la quittance / facturette avec tampon.
- **Paie des Enseignants & Personnel** :
  - Gestion des enseignants **Titulaires** (salaire fixe) et **Vacataires** (taux horaire $\times$ volume d'heures).
  - Déductions légales locales : **CNaPS (1%)**, **OSTIE / FUNHRE (1%)**, acomptes / avances sur salaire.
  - Primes et indemnités.
  - Génération du **Bulletin de Paie / Fiche de Salaire**.
- **Grand Livre & Journal de Caisse** :
  - Suivi des entrées et sorties (JIRAMA eau/électricité, papeterie, loyer, maintenance).
  - Calcul en direct du Solde Net disponible.

### 5. Emplois du Temps & Gestion du Temps
- **Planning Hebdomadaire Interactif** (Lundi au Samedi).
- **Vues Multiples** : Vue par Classe, par Enseignant et par Salle.
- **Moteur Intelligent de Détection des Conflits** : Alerte immédiate si un enseignant ou une salle est en double réservation sur le même créneau.

### 6. Enseignants & Affectations Pédagogiques
- Fichier du corps enseignant (qualifications CAPEN, Master, Doctorat, contacts, CIN).
- Volumes horaires hebdomadaires et matières attribuées.

### 7. Configuration Intégrale (100% Personnalisable)
- **Matricules** : Formule dynamique (`{PREFIX}-{YYYY}-{NUM4}`, etc.), longueur, séparateurs, réinitialisation annuelle ou continue.
- **Établissement** : Nom, Devise, Code MEN, CISCO, DREN, ZAP, Coordonnées, Nom du Proviseur.
- **Années Scolaires & Périodes** : Gestion multi-sessions, trimestres avec dates et pondérations.
- **Classes, Séries & Coefficients** : Séries officielles du Baccalauréat malgache (**Série L**, **Série S**, **Série OSE**, **Séries A/C/D**) et cycles Primaire/Collège.
- **Base de Données Locale** : Sauvegarde instantanée en fichier JSON, restauration de sauvegarde et réinitialisation aux normes MEN.

---

## 🎨 Interface & Ergonomie Visuelle
- **Style Professionnel Exécutif** : Design sobre, typographie nette, aucune fioriture enfantine ni emoji.
- **Visualisation 3D Interactive** : Campus scolaire 3D en Three.js avec vue isométrique animée, inspection des pôles pédagogiques et graphiques de trésorerie en profondeur 3D.
- **Mode Sombre / Mode Clair** avec persistance locale.
- **Palette de Commande Rapide** (`Ctrl + K`) pour recherche instantanée.
