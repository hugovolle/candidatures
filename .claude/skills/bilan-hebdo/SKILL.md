---
name: bilan-hebdo
description: Bilan hebdomadaire de la recherche de poste : lance l'agent analyste sur le suivi de la semaine, met à jour apprentissages.md et pousse le résultat sur la branche lots. À lancer le dimanche par la routine, ou à la main avec /bilan-hebdo.
---

# Bilan de la semaine

1. Récupère la branche `lots` : `git fetch origin lots && git checkout -B lots origin/lots`.
2. Lance l'agent `analyste` sur `data/suivi_export.json` et les lots des sept
   derniers jours (`data/lots/`).
3. Vérifie que `apprentissages.md` respecte les règles de prudence (effectifs
   indiqués, aucune conclusion sous 20 cas, aucune contradiction avec une
   règle rouge).
4. Écris le bilan court dans `data/bilans/<date>.md`.
5. Commit et push sur `lots` : `git add apprentissages.md data/bilans/ && git
   commit -m "Bilan du <date>" && git push origin lots`.

L'expéditeur publie `data/bilans/<date>.md` sur Discord le lundi à 9h.
