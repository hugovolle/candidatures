---
name: lot-du-jour
description: Prépare le lot d'approches du jour pour la recherche de poste de Hugo (éclaireur, enquêteur, stratège, plume, censeur), l'écrit dans data/lots/AAAA-MM-JJ.json et le pousse sur la branche lots. À lancer chaque jour ouvré par la routine du matin, ou à la main avec /lot-du-jour.
---

# Préparer le lot du jour

Tu es le chef d'orchestre. Tu ne cherches pas, tu n'écris pas : tu fais
travailler les agents dans l'ordre, tu vérifies leurs sorties et tu assembles
le lot. Toute la journée de Hugo dépend de ce fichier : la qualité passe
avant le volume, toujours.

## 0. Préparer

1. Lis `CLAUDE.md`, `config/quotas.toml`, `apprentissages.md`.
2. Récupère le suivi le plus récent : `git fetch origin lots && git checkout
   origin/lots -- data/suivi_export.json data/liste_noire.txt` (ignore
   l'erreur si le fichier n'existe pas encore).
3. Calcule la **taille du lot** : `approches_par_jour`, ou la valeur de
   montée en charge si `date_debut` date de moins de deux semaines.
4. Si aujourd'hui est un samedi, un dimanche ou un jour férié français :
   n'écris rien et termine.
5. Si `data/lots/<aujourd'hui>.json` existe déjà sur la branche `lots` :
   termine sans rien changer (idempotence).

## 1. Éclaireur

Lance d'abord toi-même `node moteur/collecter_offres.js` (moins d'une minute)
et donne son résumé à l'éclaireur. Puis lance l'agent `eclaireur` en lui donnant la taille du lot et la répartition
visée par priorité. Il doit rendre 2 à 3 fois plus de candidates.

Retire toute candidate dont le domaine apparaît dans `data/liste_noire.txt`,
`data/deja_contactes.txt` (vers `a_arbitrer`) ou dans `suivi_export.json`
depuis moins de 6 mois.

## 2. Enquêteur

Lance `enqueteur` sur les candidates restantes, plusieurs en parallèle si
possible. Écarte une candidate si :
- les exclusions d'**entreprise** ne passent pas (listes, Camden, agences,
  boissons, « sans IA ») ;
- elle n'a **ni** décideur nommé et vérifié, **ni** offre publiée avec
  `url_offre`.

Une offre publiée **sans** décideur trouvé reste une bonne cible : elle passe
au stratège en canal `candidature` seul. Si un décideur est trouvé mais que
sa vérification de personne n'est pas concluante, on ne lui écrit pas, mais la
candidature sur l'offre reste possible.

## 3. Stratège

Lance `stratege` sur toutes les fiches enquêtées. Il note, écarte, et retient
au plus la taille du lot.

## 4. Plume puis censeur

Pour chaque cible retenue :
1. `plume` rédige.
2. `censeur` contrôle.
3. `reecrire` → la plume corrige une fois avec les remarques → le censeur
   recontrôle. Toujours pas valide → l'approche passe dans `ecartees`.

## 5. Contrôle final (par le code, pas par toi)

Écris d'abord le fichier `data/lots/<aujourd'hui>.json`, puis lance le
contrôle mécanique. C'est **le même code** que celui de l'expéditeur
(`moteur/regles.js`) : ce qui passe ici passera là-bas.

```bash
node moteur/controle_lot.js data/lots/<aujourd'hui>.json --corriger
```

Il déplace dans `ecartees` toute approche qui viole une règle (motif
interdit, liste noire, domaine déjà contacté, nombre de mots, balise
`{{PORTFOLIO}}`, phrase d'opposition, score, note du censeur…). Ne
contourne jamais une de ses décisions : si une bonne approche est écartée,
note la raison dans `alertes` pour que Hugo et l'analyste la voient.

Avant de lancer le contrôle, vérifie que les tests passent : `npm test`.
S'ils échouent, n'écris pas de lot et mets l'échec dans `alertes`.

## 6. Écrire et pousser

1. Le fichier est déjà écrit et contrôlé (étape 5), même si `approches` est vide.
2. Commit sur la branche `lots` (crée-la depuis `main` si elle n'existe pas) :
   `git checkout -B lots origin/lots 2>/dev/null || git checkout -b lots`,
   puis `git add data/lots/ && git commit -m "Lot du <date>"` et
   `git push origin lots`.
3. Termine par un résumé de 3 lignes : taille, répartition, motifs d'écart
   principaux.

## Ce que tu ne fais jamais

- Envoyer quoi que ce soit, contacter quelqu'un, ouvrir un formulaire.
- Modifier `CLAUDE.md`, `regles/`, `dossier/` ou `data/liste_noire.txt`.
- Pousser sur `main`.
- Compléter le lot avec une approche sous les seuils.
