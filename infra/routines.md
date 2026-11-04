# Les deux routines Claude Code

Créées sur claude.ai/code/routines (ou avec `/schedule`), sur le dépôt GitHub
privé `candidatures`, environnement cloud avec accès réseau **Complet**
(l'éclaireur et l'enquêteur lisent le web).

Les cron sont écrits avec le préfixe `CRON_TZ=Europe/Paris` : l'heure de Paris
est respectée été comme hiver.

Modèle conseillé : le plus capable disponible sur l'abonnement pour le lot
du jour (la qualité des approches est tout l'enjeu), un modèle plus léger
suffit pour le bilan.

---

## 1. Lot du jour

- **Nom** : `Candidatures — lot du jour`
- **Planification** : `CRON_TZ=Europe/Paris 7 7 * * 1-5` (7h07, jours ouvrés ;
  la skill s'arrête d'elle-même les jours fériés)
- **Prompt** :

```
Tu travailles dans le dépôt de la recherche de poste de Hugo Volle.
Lis CLAUDE.md, puis exécute la skill lot-du-jour de bout en bout, sans rien
demander : personne ne répondra pendant cette session.

Rappels non négociables :
- Tu ne contactes personne et tu n'envoies rien. Tu produis uniquement le
  fichier data/lots/<date du jour>.json et tu le pousses sur la branche lots.
- Le contrôle final se fait avec `node moteur/controle_lot.js <fichier> --corriger`.
  Tu ne contournes jamais ses décisions.
- Un lot court ou vide vaut mieux qu'une approche médiocre ou non sourcée.
- Si une étape échoue (web inaccessible, push refusé, tests en échec),
  écris quand même un lot avec "approches": [] et l'explication dans
  "alertes", pour que Hugo soit prévenu au lieu d'attendre.
Termine par un résumé de 3 lignes.
```

## 2. Bilan de la semaine

- **Nom** : `Candidatures — bilan hebdo`
- **Planification** : `CRON_TZ=Europe/Paris 7 19 * * 0` (dimanche 19h07)
- **Prompt** :

```
Tu travailles dans le dépôt de la recherche de poste de Hugo Volle.
Lis CLAUDE.md, puis exécute la skill bilan-hebdo de bout en bout, sans rien
demander. Respecte strictement les règles de prudence de l'agent analyste :
aucune conclusion sous 20 cas. Pousse uniquement sur la branche lots.
```

---

## Après création

Copie l'adresse de la routine « lot du jour »
(`https://claude.ai/code/routines/<id>`) dans la propriété `LIEN_ROUTINE` du
script Apps Script : l'alerte de 9h30 te donnera ce lien pour la relancer
d'un clic (« Run now »).
