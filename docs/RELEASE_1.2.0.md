# Sekoly 1.2.0 — première utilisation et échanges Excel

- Assistant initial : identité de l’école, calendrier scolaire, classes, frais,
  matières et coefficients, avec enregistrement et reprise par étape.
- Import Excel des enseignants : modèle, validation, matricules automatiques,
  contrats, spécialités, classes et rémunérations. Les doublons sont refusés.
- Fichier de préparation propre à chaque professeur, à son école et à son année.
- Sekoly Enseignant 0.2.0 : ouverture du fichier sans compte cloud ni Internet,
  notes et appels dans SQLite, reprise après fermeture et partage Excel.
- Import des appels dans Vie scolaire, avec modèle manuel ou export mobile.
- Notes : zéros, contrôles supplémentaires et coefficients conservés dans les
  échanges ; erreurs et périodes verrouillées refusées.
- Les imports répétés gardent les mêmes identifiants. Les conflits sont vérifiés
  avant confirmation et dans la file d’écriture locale.
- Actualisation par nouveau fichier : les valeurs reçues confirment le travail,
  les autres saisies restent conservées. Le professeur voit les valeurs de l’école
  et confirme explicitement toute correction après conflit.
- Les corrections locales issues des fichiers sont préservées lors des anciennes
  réponses cloud ; les appels divergents sont signalés dans Vie scolaire.
- Les corrections de sécurité, persistance, PDF, dates et calculs de la
  [version 1.1.2](RELEASE_1.1.2.md) sont incluses.

Voir [le guide des échanges](TEACHER_EXCEL_EXCHANGE.md). Les installateurs Windows
et l’APK professeur sont générés par GitHub Actions pour validation avant publication.

Vérification locale du 9 octobre 2026 : build desktop, 70 tests métier/données,
31 scénarios d’interface contre le bundle de production (390, 800 et 1366 px),
TypeScript mobile, trois tests de sécurité des dépendances et bundle Android
Hermes compilé. Le lint passe avec des avertissements existants. Les actions
GitHub vérifient également l’APK et les installateurs Windows avant leur diffusion.
