# Notation d'une cible — la grille du stratège

Chaque cible est notée sur **100**. En dessous de **65**, elle est écartée,
même si le lot est incomplet. Un lot de 3 bonnes approches vaut mieux qu'un
lot de 5 dont 2 médiocres.

| Critère | Points | Comment le noter |
|---|---|---|
| **Signal** | 0-25 | 25 : signal de moins de 30 jours, sourcé, qui implique un besoin créatif (levée, offre publiée, recrutement marketing, lancement, rebranding). 15 : signal de 1 à 3 mois. 5 : pas de signal, seulement une bonne adéquation. 0 : rien |
| **Capacité à payer 45 k€+** | 0-20 | 20 : levée de plus de 3 M€ ou plus de 50 salariés ou fourchette affichée de 45 k€ ou plus. 10 : 15 à 50 salariés, financement inconnu. 0 : moins de 10 salariés sans levée, ou fourchette affichée sous 45 k€ (écarter) |
| **Adéquation au poste** | 0-20 | 20 : le besoin correspond à un poste A ou B et à au moins deux preuves. 10 : poste C ou D, ou une seule preuve pertinente. 0 : il faudrait inventer le lien |
| **Le décideur** | 0-15 | 15 : la personne qui porte le problème (fondateur en dessous de 30 salariés, CMO, VP Marketing, Head of Brand), nommée, avec email vérifié. 10 : offre publiée avec formulaire de candidature (canal `candidature`), sans manager trouvé. 8 : la bonne personne, LinkedIn seulement. 3 : un recruteur interne. 0 : personne de nommé et aucune offre publiée (écarter) |
| **Remote** | 0-10 | 10 : full remote affiché ou culture remote documentée. 5 : hybride possible ou inconnu. 0 : présentiel imposé hors Lyon (écarter) |
| **Force de l'angle** | 0-10 | 10 : on peut formuler leur problème en une phrase que seul quelqu'un qui les a étudiés écrirait. 5 : angle correct mais attendu. 0 : angle générique |

## Les écarts automatiques

Quel que soit le score, la cible est écartée si :
- elle tombe sous une exclusion de `regles/exclusions.md` ;
- elle est une agence, un studio ou une structure dont la création est le produit ;
- son domaine figure dans `data/deja_contactes.txt` (elle va dans `a_arbitrer`) ;
- aucune source n'étaye le signal ou la taille.

## Le choix des preuves

Le stratège choisit **deux preuves au maximum** dans `dossier/preuves.md`, en
répondant à : « quel est leur problème probable, et quelle preuve y répond le
plus directement ? »

| Leur problème probable | Preuves à privilégier |
|---|---|
| Ils produisent beaucoup de supports avec peu de monde | P1 (×5), P6 (decks en heures) |
| Ils viennent de lever ou préparent une levée | P6 (decks), P5 (rebranding piloté seul) |
| Ils veulent une marque plus forte ou différenciante | P2 (police propriétaire), P5 |
| Ils cherchent un premier créatif autonome | P5, P3 (impact business) |
| Ils veulent intégrer l'IA dans la création | P2, P1, P6 |
| Ils sont orientés performance et acquisition | P3 (60 k€), puis P1 |

## La répartition du lot

Respecter autant que possible la part de chaque priorité (`CLAUDE.md`) sur la
semaine, pas forcément chaque jour. Ne jamais compléter une priorité avec des
cibles sous le seuil.
