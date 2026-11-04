# Exclusions — qui on ne contacte jamais

Ce fichier est le plus strict du dépôt. Au moindre doute sur une cible :
**on l'écarte et on note pourquoi**. Une cible perdue ne coûte rien, une
fuite vers Camden coûte le poste actuel de Hugo.

## 1. Exclusions définitives (entreprises)

| Qui | Pourquoi |
|---|---|
| **Camden** (agence de pub, Lyon, bureaux Montréal, Toronto, Paris, Hong Kong) et **Les Distilleurs** | Employeur actuel. Recherche discrète |
| **Toute agence de pub, de com, studio de design ou de branding** | Décision de Hugo (03/11/2026) : on vise les entreprises dont la création n'est pas le produit. Bonus : c'est le milieu où Camden est connu |
| **Groupe Duvel Moortgat et toutes ses marques et brasseries** | Client de Camden, objet des cas cités |
| **Clients connus de Camden** (dont Petzl, Father & Sons) | Risque de fuite direct |
| **Structures qui se revendiquent « sans IA »** | Voir règle rouge n°10 |
| Tout domaine de `data/liste_noire.txt` | Refus, demandes d'arrêt, exclusions manuelles |

## 2. Exclusions de personnes

On écarte une personne, même dans une entreprise autorisée, si son profil
LinkedIn ou une source publique montre :
- un passage chez **Camden** ou **Les Distilleurs**, à n'importe quel poste ;
- une relation commune visible avec Camden en premier degré (quand l'enquêteur
  peut le voir) ;
- un poste dans un **cabinet de recrutement qui travaille pour Camden** ou pour
  une agence lyonnaise de son réseau ;
- un poste dans la **filière boissons et alcool** à Lyon ou en Rhône-Alpes.

L'enquêteur consigne la vérification dans le champ `verification_exclusions`
du lot. Une vérification absente = approche rejetée par le censeur.

## 3. La règle du « groupe brassicole »

Les cas Camden existent en deux versions dans `dossier/preuves.md` :

- **Version stricte** : « une marque d'un groupe international ». C'est
  **la version par défaut**.
- **Version secteur** : « une marque d'un groupe brassicole international ».

La version secteur n'est permise que si **toutes** ces conditions sont vraies :
1. la cible n'est **pas** dans les boissons, l'alcool, la grande distribution
   alimentaire, l'emballage ou l'impression d'étiquettes ;
2. la cible n'est **pas** un client, un concurrent ou un partenaire connu de
   Camden ;
3. la cible n'est **pas** basée en Auvergne-Rhône-Alpes (le milieu où
   l'information circulerait), sauf poste full remote d'une entreprise basée
   ailleurs ;
4. le stratège a écrit `version_preuves: "secteur"` **avec une justification**.

Si une seule condition manque ou est incertaine, c'est la version stricte.

## 4. Motifs interdits dans un message

Le censeur et le code de l'expéditeur cherchent ces motifs (insensible à la
casse, accents ignorés). Un seul motif trouvé = envoi bloqué.

```
motifs_interdits:
  - camden
  - distilleurs
  - duvel
  - moortgat
  - mont-blanc
  - mont blanc
  - petzl
  - father & sons
  - father and sons
  - —        # tiret cadratin
  - –        # demi-cadratin
  - " nous "
  - "notre équipe"
  - "notre agence"
```

## 5. Déjà contactés

`data/deja_contactes.txt` liste 1 080 domaines démarchés pendant les campagnes
freelance de 2025-2026. Une approche emploi vers un de ces domaines est
**interdite sans accord explicite de Hugo** : recevoir une offre de freelance
puis une candidature du même expéditeur donne une image confuse. Le stratège
peut la proposer dans la section `a_arbitrer` du lot, jamais dans le lot lui-même.

## 6. Délais

- **6 mois minimum** entre deux approches vers la même entreprise.
- Une relance (une seule, dans le même fil) ne compte pas comme nouvelle approche.
- Après un refus : jamais, quelle que soit la personne.
