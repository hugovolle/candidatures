# Mise en service, pas à pas

Environ 30 minutes, une seule fois. Rien ne part avant l'étape 7 : jusque-là,
tout tourne en **simulation**.

À chaque étape, ce que tu fais toi et ce que je peux faire pour toi est
indiqué. Les mots de passe et jetons ne passent **jamais** par le chat : tu
les colles directement là où c'est indiqué.

---

## 1. GitHub : le dépôt (10 min)

1. Crée un compte sur github.com avec ton adresse **personnelle**, jamais
   l'adresse Camden.
2. Crée un dépôt **privé** nommé `candidatures`, vide (sans README).
3. Dis-moi ton nom d'utilisateur GitHub : je relie le dossier
   `~/Candidatures` au dépôt et je te donne la commande d'envoi (`git push`).
4. Crée aussi la branche `lots` (je te donne la commande).

## 2. Claude : la routine du matin (5 min)

1. Sur claude.ai/code, connecte GitHub et autorise l'application Claude
   **sur le seul dépôt `candidatures`**.
2. Dans les environnements cloud, règle l'accès réseau sur **Complet**.
3. Je crée les deux routines avec toi (`infra/routines.md`), ou tu les crées
   sur claude.ai/code/routines en copiant les prompts.
4. On lance « Run now » une première fois pour vérifier qu'un lot arrive bien
   sur la branche `lots`.

## 3. Google Drive : le portfolio (3 min)

1. Dépose ton PDF Portfolio & CV (de préférence la version allégée) sur Google
   Drive.
2. Partage-le en « Tous les utilisateurs disposant du lien », **lecteur**.
3. Copie le lien : il ira dans la propriété `URL_PORTFOLIO` (étape 5).

## 4. Discord : les notifications (2 min)

1. Sur ton serveur Discord, crée un salon privé `#candidatures`.
2. Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l'URL.

## 5. Google Sheets et Apps Script : le moteur (10 min)

1. Sur ton compte Google **personnel**, crée un Google Sheet nommé
   « Suivi candidatures ».
2. Menu Extensions → Apps Script. Dans l'éditeur :
   - Paramètres du projet (roue dentée) → coche « Afficher le fichier
     manifeste appsscript.json ». Remplace son contenu par
     `moteur/apps-script/appsscript.json`.
   - Renomme `Code.gs` en `Code` et colle `moteur/apps-script/Code.js`.
   - Fichier + → Script → `regles` : colle `moteur/regles.js`.
   - Fichier + → HTML → `Page` : colle `moteur/apps-script/Page.html`.
   - Services (+) → Gmail API → Ajouter (normalement déjà activé par le manifeste).
3. Paramètres du projet → Propriétés du script → ajoute :

| Propriété | Valeur |
|---|---|
| `MODE` | `simulation` |
| `GITHUB_DEPOT` | `<ton-pseudo>/candidatures` |
| `GITHUB_TOKEN` | un jeton GitHub « fine-grained », **limité au dépôt `candidatures`**, permission *Contents : Read and write*, expiration 1 an |
| `DISCORD_WEBHOOK` | l'URL de l'étape 4 |
| `URL_PORTFOLIO` | le lien de l'étape 3 |
| `LIEN_ROUTINE` | l'adresse de la routine « lot du jour » |

4. Sélectionne la fonction `installer` et clique Exécuter. Google demande
   les autorisations (Sheets, Gmail, accès externe) : accepte. L'écran
   « Application non validée » est normal pour un script personnel :
   Paramètres avancés → Accéder au projet.
5. Déployer → Nouveau déploiement → type **Application Web**, exécuter en
   tant que **moi**, accès **moi uniquement**. Copie l'URL : c'est ta page de
   validation. Ajoute-la à l'écran d'accueil de ton téléphone.

## 6. Une semaine de simulation

1. Exécute `testerAvecExemple` : le lot fictif apparaît sur ta page.
   Valide-le, regarde l'onglet Journal : l'envoi est simulé, rien ne part.
2. Pendant 5 jours ouvrés, la routine produit de vrais lots et tu valides
   comme en vrai. Les emails simulés sont écrits dans l'onglet Journal :
   relis-les comme si tu étais le destinataire.
3. Le vendredi, on fait le point ensemble : qualité des cibles, ton des
   emails, motifs de rejet.

## 7. Passage en réel

Quand tu es satisfait de la simulation : propriété `MODE` → `reel`.

- La montée en charge démarre seule : 3 emails par jour la première semaine,
  4 la deuxième, puis 5.
- Pour tout arrêter à tout moment : `MODE` → `simulation`. Plus rien ne part
  au passage suivant (5 minutes au plus).

---

## En cas de problème

| Symptôme | Où regarder |
|---|---|
| Pas de notification à 10h10 | Onglet Journal du Sheet ; alerte de 9h30 sur Discord |
| Une approche « bloquée par les garde-fous » | Sa raison exacte est sur la page de validation |
| Un envoi attendu n'est pas parti | Plafond du jour atteint ou fin de fenêtre : il est reporté au prochain jour ouvré |
| « Erreur du moteur » sur Discord | Onglet Journal, ligne « erreur » : envoie-la-moi |
| Jeton GitHub expiré | Recrée-le (étape 5.3) et remplace `GITHUB_TOKEN` |

## Pour modifier une règle

Les règles vivent dans le dépôt (`CLAUDE.md`, `regles/`, `config/quotas.toml`).
Après une modification de `moteur/regles.js`, lance `npm test` puis recolle le
fichier dans Apps Script : c'est le même code des deux côtés.
