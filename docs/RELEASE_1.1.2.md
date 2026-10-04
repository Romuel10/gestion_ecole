# Sekoly 1.1.2 — corrections de l’audit pré-publication

Une demande publique ne rattache plus une personne à une famille existante à partir de son nom, téléphone ou CIN. La validation des écritures locales et la synchronisation protègent désormais les données enregistrées pendant les opérations asynchrones.

## Correctifs

- Portail familial : dépôt anonyme isolé, accès aux pièces limité à la demande pendant deux heures, lien portail émis uniquement par un administrateur actif après vérification. Révocation des anciens liens dont l’origine ne prouve pas cette vérification.
- SQLite : écritures sérialisées et attendues, erreur lisible, aucune confirmation de succès avant l’enregistrement. Un cache navigateur saturé ne bloque plus SQLite. Les formulaires de paramètres conservent leur saisie en cas d’échec.
- Restauration : version, tableaux, identifiants, références et dates validés ; aperçu et confirmation ; copie de secours obligatoire avant remplacement ou réinitialisation.
- Mobile enseignant : cache et opérations hors ligne séparés par compte et établissement, déconnexion verrouillée même hors réseau, contrôles d’adhésion avant reprise, anciennes opérations sans propriétaire conservées mais non rejouées automatiquement.
- Notes Cloud : normalisation sur 20, coefficients respectés, retrait des notes supprimées ou remises à vide, maintien des modifications locales concurrentes et des contrôles supplémentaires lors de la saisie manuelle.
- Présences Cloud : corrections et suppressions réconciliées même sans nouvel ajout. Curseur de lecture validé après enregistrement local réussi.
- PostgreSQL : adhésion enseignante active obligatoire ; verrous de période, année et évaluation appliqués aux écritures directes et changements de barème.
- PDF : espace réservé sous un logo centré et largeur adaptée aux reçus étroits ; import des logos PNG/JPG contrôlé.
- Caisse : solde physique calculé uniquement à partir des opérations en espèces.
- Emploi du temps : durée demandée exacte, notamment trois heures, sans arrondissement à quatre heures.
- Import Excel : rejet des dates inexistantes, conservation des dates bissextiles valides.
- Sauvegardes : copie locale complète les jours d’utilisation, sept copies quotidiennes sur Windows, alertes et reprise des erreurs Cloud. L’écran précise que la sauvegarde Cloud ne couvre pas la comptabilité locale.
- Livraison : fichiers de verrouillage npm mobile et Cargo, contrôles de dépendances en CI, correctifs temporaires vérifiés et testés pour deux dépendances Expo en attente de publication amont.
- WebView : CSP autorisant les scripts locaux et les connexions IPC/Supabase prévues.

Le détail des preuves et limites est dans [AUDIT_CORRECTIONS.md](AUDIT_CORRECTIONS.md).

## Validation avant publication

Les contrôles GitHub de la PR doivent tous réussir : build TypeScript/Vite, lint, audit npm, tests métier et PostgreSQL, tests Playwright du bundle de production, typecheck et contrôle de sécurité mobile, construction APK avec JavaScript embarqué, tests Rust, installateurs Windows et démarrage avec instance unique.

La protection Supabase contre les mots de passe compromis (A17) exige un plan Pro ; le projet est actuellement sur l’offre gratuite. Aucun changement d’offre n’est effectué. Les correctifs temporaires Expo expirent le **4 novembre 2026** et doivent être remplacés par les versions amont corrigées dès leur disponibilité.

## Déploiement du portail et des droits

1. Mettre à jour la page publiée `sekoly/enrollment/index.html` dans `romuel-app-store` ; elle reste compatible avec l’ancien résultat de l’API pendant la transition.
2. Appliquer `20261004171940_prepublication_integrity_guards.sql`. Cette migration révoque tous les anciens jetons familiaux encore actifs.
3. Déployer `sekoly-public-enrollment` depuis cette branche. La route publique reste sans JWT de passerelle ; l’action administrative vérifie elle-même le JWT et l’adhésion active.
4. Depuis Admissions, ouvrir une demande, vérifier le responsable puis créer son lien familial. Pour un dépôt anonyme, finaliser d’abord le dossier et synchroniser son rattachement familial.
5. Contrôler le bootstrap public et le refus des accès invalides. Les nouveaux installateurs et APK doivent provenir de la révision validée.

La fusion dans `main` déclenche la publication Windows automatique. Ne pas fusionner cette PR avant la décision de diffusion. La correction de la faille du portail déjà exposé peut être appliquée séparément.
