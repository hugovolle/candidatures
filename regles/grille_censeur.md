# Grille du censeur

Le censeur relit chaque approche **comme un décideur pressé et méfiant**,
puis comme un juriste. Il n'a aucun intérêt à ce que le lot soit plein.

Le censeur tourne sur le même modèle que la plume : il partage ses angles
morts. C'est pour ça que la partie A est mécanique, que l'expéditeur la refait
dans le code, et que seule la partie B fait appel au jugement.

## A. Éliminatoire : un seul « non » et l'approche est rejetée ou réécrite

| # | Contrôle |
|---|---|
| A1 | Aucune exclusion de `regles/exclusions.md` ne s'applique (entreprise, personne, domaine, déjà contacté) |
| A2 | `verification_exclusions` est rempli et cohérent |
| A3 | Aucun motif interdit (section 4 de `regles/exclusions.md`) |
| A4 | La version des preuves respecte la règle du « groupe brassicole » |
| A5 | Chaque fait sur la cible a une URL source dans `sources`, et la source dit bien ce que l'email affirme |
| A6 | Chaque chiffre sur Hugo figure mot pour mot dans `dossier/preuves.md` |
| A7 | Le destinataire est un humain nommé (sauf adresse d'une offre publiée) |
| A8 | L'adresse est vérifiée, ou devinée selon la règle CNIL de `CLAUDE.md` |
| A9 | Corps de 80 à 130 mots, objet de 3 à 6 mots, un seul lien, signature présente |
| A10 | Phrase d'opposition présente dans le premier email |
| A11 | Aucune formule bannie de `regles/ecriture.md` |
| A12 | Une seule demande |
| A13 | L'épreuve du concurrent : en remplaçant le nom de l'entreprise, l'email ne tient plus |
| A14 | Le poste proposé correspond à la priorité choisie par le stratège |

## B. Qualité : note sur 10

Chaque critère est noté de 0 à 2 :
- **Pertinence** : le problème formulé est-il vraiment le leur ?
- **Clarté** : comprend-on en 6 secondes qui écrit, pourquoi, et ce qu'il demande ?
- **Crédibilité** : la preuve répond-elle au problème, sans exagération ?
- **Ton** : un pair compétent, ni quémandeur ni arrogant ?
- **Naturel** : un humain aurait-il pu l'écrire ? Aucun tic de texte généré
  (énumérations en trois, symétries, formules creuses) ?

**Seuil : 8/10.** De 6 à 7 : une seule réécriture par la plume, avec les
remarques précises du censeur. Sous 6, ou toujours sous 8 après réécriture :
l'approche est rejetée et le motif est consigné dans le lot.

## Ce que le censeur écrit

Pour chaque approche, dans le lot :
```json
"censeur": {
  "eliminatoire": "ok" | "A5: le chiffre de la levée n'apparaît pas dans la source",
  "note": 8,
  "remarques": "…",
  "decision": "valide" | "reecrire" | "rejete"
}
```
