# Architecture — 0 €, ordinateur éteint

## Vue d'ensemble

```
  07h07  ┌──────────────────────────────┐
         │ ROUTINE CLAUDE CODE (cloud)  │  abonnement Pro, aucun surcoût
         │ éclaireur → enquêteur →      │
         │ stratège → plume → censeur   │
         └──────────────┬───────────────┘
                        │ git push  data/lots/AAAA-MM-JJ.json
                        ▼
         ┌──────────────────────────────┐
         │ DÉPÔT GITHUB PRIVÉ (gratuit) │  règles, agents, lots, historique
         └──────────────┬───────────────┘
                        │ lecture (jeton GitHub en lecture/écriture limité au dépôt)
                        ▼
  10h10  ┌──────────────────────────────┐        ┌──────────────────────┐
         │ GOOGLE APPS SCRIPT (gratuit) │ ─────▶ │ DISCORD (webhook)    │
         │ + Google Sheet « Suivi »     │        │ notification + lien  │
         │ - page de validation         │        └──────────────────────┘
         │ - envoi étalé depuis Gmail   │
         │ - relève des réponses        │ ◀───── Hugo valide depuis son téléphone
         │ - garde-fous dans le code    │
         └──────────────┬───────────────┘
                        │ 18h : export du suivi vers le dépôt
                        ▼
                 data/suivi_export.json  → lu par la routine du lendemain
```

Le dépôt GitHub sert de **bus** entre le cerveau et le moteur. Ce choix est
volontaire : il ne demande aucun serveur, garde l'historique de chaque lot,
et la routine sait déjà pousser sur GitHub sans aucun secret.

## Les pièces

| Pièce | Rôle | Pourquoi ce choix | Coût |
|---|---|---|---|
| **Routine Claude Code** | Prépare le lot avec les agents | Tourne dans le cloud, sur l'abonnement Pro, sans clé API | 0 € (consomme le quota Pro, tôt le matin) |
| **Dépôt GitHub privé** | Règles, agents, lots, suivi | Seule source de vérité versionnée | 0 € |
| **Google Apps Script** | Envoi, relève, page de validation, garde-fous | Tourne chez Google ordinateur éteint, envoie depuis le vrai Gmail de Hugo, aucun jeton qui expire | 0 € |
| **Google Sheet** | Tableau de suivi lisible et modifiable sur téléphone | Hugo peut tout voir et corriger à la main | 0 € |
| **Webhook Discord** | Notifications et alertes | Une URL, rien à héberger | 0 € |

### Écartés, et pourquoi

- **Fly.io, Render** : plus gratuits pour un service toujours allumé, ou mis en veille.
- **Oracle Always Free** : quota divisé par deux en 2026, instances inactives récupérées.
- **Bot Discord interactif (Cloudflare Workers)** : possible et gratuit, mais
  ajoute une plateforme et une vérification de signature. Gardé en option si
  la page de validation ne suffit pas.
- **Hermès / Ollama local** : dépend du Mac allumé ; c'est la cause de l'arrêt du 31/08.
- **API Gmail en OAuth** : jetons qui expirent au bout de 7 jours en mode test.

## La journée type

| Heure (Paris) | Quoi | Où |
|---|---|---|
| 07h07 | La routine prépare le lot et le pousse | Cloud Claude |
| 09h30 | Contrôle : le lot du jour existe-t-il ? Sinon, alerte Discord avec un lien pour relancer la routine | Apps Script |
| 10h10 | Notification Discord : « 3 approches à valider » + lien | Apps Script |
| Quand Hugo veut | Il valide, modifie ou rejette chaque approche (motif en un clic) | Page de validation |
| 10h10-12h, 14h-17h | Envoi des approches validées, écart aléatoire de 12 à 45 min | Apps Script → Gmail |
| Toutes les 15 min | Relève des réponses ; refus et demandes d'arrêt en liste noire ; alerte Discord si réponse positive | Apps Script |
| 17h30 | Bilan du jour sur Discord | Apps Script |
| 18h00 | Export du suivi vers le dépôt | Apps Script → GitHub |
| Dimanche 19h07 | Bilan hebdomadaire et mise à jour des apprentissages | Routine Claude |

Une approche validée trop tard pour partir dans la journée part le
lendemain, en tête de file. Rien ne se perd.

## Les garde-fous du code (indépendants des agents)

L'expéditeur refuse d'envoyer, quoi que dise le lot, si :
- l'approche n'est pas validée par Hugo ;
- son `id` a déjà été envoyé ;
- le domaine est dans la liste noire, dans les déjà-contactés, ou a été
  contacté il y a moins de 6 mois ;
- un motif interdit apparaît dans l'objet, le corps ou la relance ;
- le plafond du jour (montée en charge comprise) est atteint ;
- on est hors des fenêtres, un week-end ou un jour férié ;
- un champ obligatoire du format manque.

Chaque refus est écrit dans le Sheet et apparaît dans le bilan de 17h30.

Ces règles sont codées **une seule fois**, dans `moteur/regles.js`. Le même
fichier tourne dans la routine (`moteur/controle_lot.js`, avant l'écriture du
lot) et dans Apps Script (à l'import puis juste avant chaque envoi). Il est
couvert par `npm test` : 16 tests des règles et 7 scénarios de journée
complète simulée (import, validation, étalement, plafonds, jours fériés,
relance, opposition, week-end).

## Les fichiers du moteur

| Fichier | Rôle |
|---|---|
| `moteur/regles.js` | Garde-fous partagés (aucune dépendance) |
| `moteur/controle_lot.js` | Contrôle d'un lot en ligne de commande, utilisé par la routine |
| `moteur/apps-script/Code.js` | L'expéditeur : import, planification, envoi, réponses, bilans |
| `moteur/apps-script/Page.html` | La page de validation (téléphone) |
| `moteur/apps-script/appsscript.json` | Manifeste : fuseau de Paris, Gmail, accès restreint à Hugo |
| `moteur/tests/` | Tests des règles et simulation de journées complètes |
| `infra/exemple_lot.json` | Lot fictif de référence pour les tests |
| `infra/routines.md` | Les prompts et horaires des deux routines |
| `infra/MISE_EN_SERVICE.md` | Le pas à pas d'installation |

## Les limites connues, sans fard

- **Les routines sont en « research preview »** : le comportement peut changer.
  D'où le contrôle de 9h30 et le bouton de relance.
- **La recherche web dans une routine** doit être testée au premier essai.
  Si les outils web sont bridés, l'environnement cloud passe en accès réseau
  « Complet ».
- **Le quota Pro** : un lot bien recherché peut consommer une part notable du
  quota de la matinée. À mesurer la première semaine.
- **Le jeton GitHub d'Apps Script** expire au bout d'un an maximum : rappel
  automatique un mois avant, dans le bilan.
- **Gmail** : jusqu'à 100 destinataires par jour via Apps Script, on en vise 8 au plus.

## Mise en service (à faire par Hugo, guidé pas à pas)

1. Créer un compte GitHub et un dépôt privé `candidatures`, y pousser ce dossier.
2. Connecter GitHub à Claude (claude.ai/code), puis créer la routine.
3. Créer le Google Sheet « Suivi candidatures » et y coller le code Apps Script.
4. Créer un webhook Discord sur un salon privé.
5. Créer un jeton GitHub limité à ce dépôt, le ranger dans les propriétés du script.
6. Une semaine en **mode simulation** (rien ne part, tout est journalisé),
   puis bascule en mode réel.
