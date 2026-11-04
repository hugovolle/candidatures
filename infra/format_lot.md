# Format d'un lot

Un lot est un fichier `data/lots/AAAA-MM-JJ.json`, écrit par la routine du
matin et poussé sur la branche `lots` du dépôt. L'expéditeur Apps Script le
lit à 10h10 et l'affiche sur la page de validation de Hugo.

Le format est un **contrat** entre les agents et le code : un champ manquant
ou mal typé fait rejeter l'approche par l'expéditeur, qui le signale dans le
bilan.

```json
{
  "date": "2026-11-04",
  "genere_a": "2026-11-04T07:41:12+01:00",
  "version_format": 1,
  "taille_visee": 3,
  "resume": "3 approches (2 A, 1 B). 14 candidates examinées, 9 écartées, 2 rejetées par le censeur.",
  "approches": [
    {
      "id": "2026-11-04-01",
      "entreprise": "…",
      "domaine": "exemple.com",
      "personne": {"prenom": "…", "nom": "…", "poste": "…", "linkedin": "https://…"},
      "email": "prenom.nom@exemple.com",
      "statut_email": "verifiee",
      "preuve_email": "https://…",
      "canal": ["email", "linkedin"],
      "poste": "A",
      "intitule_vise": "Creative Technologist",
      "score": 81,
      "detail_score": {"signal": 25, "capacite": 20, "adequation": 18, "decideur": 15, "remote": 5, "angle": 8},
      "signal": "Série A de 8 M€ annoncée le 21/10/2026",
      "probleme": "…",
      "preuves": ["P1", "P6"],
      "version_preuves": "stricte",
      "pages_portfolio": "p. 25-26",
      "verification_exclusions": "…",
      "sources": ["https://…"],
      "message": {
        "objet": "…",
        "corps": "…",
        "relance": "…",
        "linkedin_note": null,
        "linkedin_message": "…"
      },
      "censeur": {"eliminatoire": "ok", "note": 9, "remarques": "…", "decision": "valide"}
    }
  ],
  "ecartees": [
    {"entreprise": "…", "motif": "score 58 : pas de signal récent"}
  ],
  "a_arbitrer": [
    {"entreprise": "…", "motif": "domaine dans deja_contactes.txt (campagne freelance d'août)"}
  ],
  "alertes": []
}
```

## Règles

- Seules les approches avec `censeur.decision = "valide"` figurent dans
  `approches`. Les autres vont dans `ecartees` avec leur motif.
- `id` est unique et stable : c'est la clé d'idempotence de l'expéditeur
  (une approche déjà envoyée ne repart jamais, même si le lot est relu).
- `corps` ne contient pas la signature : l'expéditeur l'ajoute.
- Un lot vide est un lot valide : `approches: []` et une explication dans
  `resume`. L'expéditeur le signale à Hugo au lieu de rester silencieux.
