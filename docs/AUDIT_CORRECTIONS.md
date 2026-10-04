# Suivi des corrections — audit du 4 octobre 2026

L’audit porte sur la version 1.1.1, révision `82598217b0d0126aff7084bf13182f8a51b13b57`. Les corrections ci-dessous préparent la 1.1.2 et intègrent le correctif PDF de la PR #25. Le suivi distingue les modifications de code du réglage fournisseur restant indisponible sur l’offre actuelle.

## Correspondance des constats

| Constat | Correction | Vérification automatisée |
| --- | --- | --- |
| A01 — accès familial public indu | Aucune recherche/mutation de famille persistante sans jeton vérifié. Capacité de dépôt anonyme limitée à sa demande et à deux heures. Émission administrative avec vérification d’identité, rôle actif et rattachement scolaire. Révocation des anciens liens. | Tests du vrai gestionnaire Edge : identité existante sans jeton, périmètre des uploads, expiration, accès portal refusé, administration refusée sans session/adhésion. SQL réel : rotation des anciens jetons et vérificateur obligatoire. |
| A02 — faux succès SQLite | Promise attendue, file d’écriture, mise à jour de l’état après persistance, cache facultatif sur desktop, erreur affichée et saisie conservée. | Écriture retardée, échec disque puis reprise, quota du cache ; parcours UI de formulaire avec disque plein. |
| A03 — restauration destructrice | Validation stricte avant toute écriture, aperçu/confirmation, copie de secours obligatoire, remplacement attendu. | Fichier incomplet, version inconnue, dates impossibles, identifiants dupliqués et références absentes refusés ; UI sans écriture si validation ou copie échoue. |
| A04 — mélange des comptes mobiles | Propriétaire et établissement dans la file SQLite, clés de cache propres au compte, contrôles des réponses retardées, verrou de déconnexion persistant, validation de session et de l’adhésion avant reprise. | SQLite mobile réel : comptes A/B, établissements distincts, réponses tardives, erreurs d’autorisation, accès hors réseau et déconnexion avec session SDK résiduelle. |
| A05 — barèmes et coefficients | Valeur normalisée `score × 20 / max_score`, moyenne pondérée des contrôles, coefficient d’examen. Les métadonnées et contrôles supplémentaires sont conservés lors de la saisie. | Barème 40, coefficients distincts, moyenne calculée et brouillon de saisie conservant tous les contrôles. |
| A06 — notes supprimées conservées | Lecture complète paginée et réconciliation des évaluations/notes, y compris valeur nulle et suppression. | Suppression et remise à vide retirent la contribution locale, sans avancement du curseur avant validation de l’écriture. |
| A07 — présences corrigées perdues | Comparaison des présences existantes, compteur des modifications et suppressions même sans ajout. | Correction isolée de présence et retrait répercutés, curseur différé. |
| A08 — droits et verrous contournables | Helpers exigeant enseignant et adhésion actifs ; triggers sur notes/évaluations pour période/année/évaluation verrouillées, identité immuable et rôle actif. | Migrations exécutées dans PostgreSQL isolé, RLS réelle : suspendu/rôle changé, verrous et barèmes modifiés par SQL direct. |
| A09 — chevauchement du logo PDF | Géométrie partagée réservant l’espace vertical et une largeur sûre. | Deux tests de géométrie et génération réelle d’un certificat avec logo PNG centré en Playwright. |
| A10 — caisse physique incorrecte | Seules les opérations en espèces entrent dans la clôture physique. | Mélange espèces/virement/autres modes et soldes d’ouverture/fermeture. |
| A11 — trois heures devenant quatre | Placement de la durée restante exacte, y compris demi-heures ; besoins invalides signalés. | Durées 0, 0,5, 1, 2, 3 et 5 heures. |
| A12 — réponse Cloud écrasant les paiements | Fusion à trois états fondée sur la base avant réseau ; préservation des modifications locales et garde sur changement d’année. | Paiement pendant la lecture, note modifiée/créée simultanément, changement d’année pendant le réseau. |
| A13 — dépendances et builds non figés | Verrouillages npm/Cargo, uuid corrigé, contrôle d’audit en CI, correctifs amont rétroportés pour node-forge et braces avec versions et SHA-256 contrôlés. | Audit racine, vérification des patches, tests RSA et profondeur AST, typecheck Expo, APK embarqué, audit Cargo. Voir limites ci-dessous. |
| A14 — dates Excel impossibles | Validation du jour réel après interprétation, sans normalisation silencieuse. | Vrai fichier XLSX avec 31 février rejeté et date bissextile valide. |
| A15 — sauvegarde Cloud partielle/silencieuse | Couverture affichée précisément ; copie locale complète quotidienne pendant l’utilisation, sept copies Windows ; erreur Cloud visible et reprise après cinq minutes. | Contenu financier de la copie locale, restauration JSON complète, échec puis reprise Cloud, écriture effective d’une copie Rust. Voir limites ci-dessous. |
| A16 — CSP absente | Scripts locaux, IPC et Supabase autorisés explicitement, objets/frames/base interdits. | Bundle de production sous CSP et blocage d’un script injecté, compilation/démarrage Windows. |
| A17 — mots de passe compromis | Limitation consignée : protection fournisseur disponible seulement en Pro, projet sur FREE. | Vérification du plan et documentation officielle. Activation et recette non réalisables sans décision du propriétaire. |

## Limites et exploitation

**A13.** Les versions npm actuellement publiées de `node-forge` et `braces` restent signalées par le registre. Le projet applique automatiquement des corrections revues provenant des propositions amont [forge #1152](https://github.com/digitalbazaar/forge/pull/1152) et [braces #72](https://github.com/micromatch/braces/pull/72), complétées par le rejet des paramètres ASN.1 NULL non vides. La vérification bloque une version/empreinte inattendue, un patch absent, toute autre alerte ou une réponse d’audit inexploitable. L’exception concerne exactement `GHSA-86w9-cpqp-85rv` et `GHSA-vfj7-8cjw-p6xm`, pas l’ensemble des dépendances. Elle expire le **2026-11-04**. Un audit npm mobile brut n’est donc pas annoncé « zéro vulnérabilité » ; le contrôle valide les corrections réellement installées. Remplacer ce mécanisme par les versions corrigées publiées, puis retirer l’exception.

**A15.** L’export Cloud ne contient pas `tuitionPayments`, `salaryPayments`, `cashTransactions` ou `cashDayClosures`. Le JSON local complet les inclut. Les copies automatiques locales sont créées les jours d’utilisation ; la copie Cloud dépend d’un bureau ouvert et connecté. Aucune garantie de cadence quand tous les postes sont éteints n’est annoncée. Exporter régulièrement un JSON complet vers un autre support et vérifier sa restauration sur un autre poste. Les copies sur le même disque ne couvrent pas sa perte physique. Un ordonnanceur Cloud serveur reste une évolution distincte si cette garantie est souhaitée.

**A17.** [Supabase Password Security](https://supabase.com/docs/guides/auth/password-security) réserve la protection contre les mots de passe compromis au plan Pro et supérieur. Aucun passage payant n’est effectué. Pour les comptes sensibles, utiliser des mots de passe longs et uniques, conserver une procédure de récupération et limiter les rôles administratifs. Après une éventuelle activation, vérifier le refus d’un mot de passe compromis et la récupération en environnement dédié. Ce constat reste ouvert comme réglage fournisseur.

## Reproduction des contrôles

La fonction publique version **20** et la migration ont été appliquées au projet Sekoly le 4 octobre 2026. Le code récupéré après déploiement correspond exactement à cette correction. L’unique ancien jeton actif a été révoqué ; aucun jeton actif sans vérificateur ne subsiste. Les contrôles réels retournent : bootstrap `200`, portail invalide `404`, dépôt avec capacité invalide `401`, émission administrative sans session `401`. La page GitHub Pages correspond au frontend corrigé via `romuel-app-store#11`. Aucun dossier fictif n’a été ajouté à la production.

Les 46 tests Node et les 25 scénarios Playwright passent en CI. Le test Rust de sauvegarde passe également. Les constructions finales Windows/Android et le démarrage Windows restent soumis aux checks de la PR avant publication.

```bash
npm ci
npm audit --audit-level=high
npm test
npm run build
npm run lint
npx playwright install --with-deps chromium
npm run test:ui
cd apps/teacher-mobile
npm ci
npm run typecheck
npm run security:check
```

Les tests SQL chargent les migrations réelles dans PGlite, avec uniquement les schémas de plateforme Auth/Storage/Realtime remplacés par des stubs. Les tests Edge exécutent le gestionnaire réel avec des données fictives ; ils ne soumettent aucun dossier à la production. La CI Windows effectue `cargo fetch --locked`, `cargo audit`, `cargo test --locked`, construit NSIS/MSI et vérifie le démarrage ainsi que l’instance unique. La CI Android vérifie que l’APK embarque son JavaScript.

Le lint conserve des avertissements existants ; son succès ne signifie pas zéro avertissement. Le binaire Rust et le navigateur sont vérifiés en CI : Rust et Chromium ne sont pas disponibles dans l’environnement local de cette correction. `specific docs` a été tenté, mais la commande Specific est absente ; aucun serveur local ni changement de sa configuration n’a été effectué.
