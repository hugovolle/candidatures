# Écriture — comment Hugo approche un décideur

Le lecteur est un fondateur, un CMO ou un Head of Brand. Il reçoit des
dizaines de sollicitations par jour et se pose une seule question en
6 secondes : **« est-ce que cette personne résout un problème que j'ai
maintenant ? »** Un email qui parle de Hugo avant de parler de lui est perdu.

Ce n'est pas une candidature spontanée. C'est **une proposition de valeur
adressée à une personne précise, à un moment précis.**

## Ce qui fait répondre (par ordre de poids)

1. **Le bon moment** : un signal récent et sourcé (levée de fonds, lancement,
   recrutement marketing, nouvelle offre, rebranding annoncé, offre publiée).
2. **La bonne personne** : le décideur qui porte le problème, nommé.
3. **Un problème formulé à sa place** : ce que le signal implique pour sa
   création (« vous passez de 10 à 40 personnes, vos supports vont se
   multiplier plus vite que votre équipe »).
4. **Une preuve qui y répond** : un chiffre tiré de `dossier/preuves.md`,
   choisi pour sa proximité avec ce problème.
5. **Une demande légère** : une question à laquelle on répond en une ligne.

## Format de l'email

- **80 à 130 mots** pour le corps. Plus court que pour un client freelance :
  on veut un échange, pas convaincre en un message.
- **3 ou 4 paragraphes** d'une à trois phrases.
- **Vouvoiement** toujours.
- **Un seul lien** : le document « Portfolio & CV » de Hugo
  (`~/Documents/PORTFOLIO & CV - HUGO VOLLE 2026.pdf`, choisi par Hugo le
  03/11/2026), hébergé en lecture seule. Son URL est dans `config/quotas.toml`
  (`[documents] portfolio_cv_url`). L'ancien lien Figma n'est plus utilisé.
  **Dans le texte, la plume écrit `{{PORTFOLIO}}` à l'endroit du lien**, une
  seule fois, par exemple : « Mon portfolio : {{PORTFOLIO}} ». L'expéditeur
  remplace la balise par l'URL. Aucune autre adresse web dans le texte.
- **Aucune pièce jointe** : le PDF pèse 20 Mo, trop lourd pour un premier
  email (filtres antispam, lecture sur téléphone). Le lien suffit.
- **Signature fixe** (jamais retirée, c'est l'obligation d'identification) :
  ```
  Hugo Volle
  Directeur artistique et creative technologist
  +33 7 81 12 69 48
  ```

## Structure

1. **Le signal et ce qu'il implique.** Une phrase sur eux, sourcée, et le
   problème de création qu'elle pose. Jamais un compliment.
2. **La preuve.** Ce que Hugo a fait face à un problème proche, avec le chiffre.
   Deux preuves maximum.
3. **La proposition.** Le poste ou le rôle, dit simplement : « Je cherche à
   rejoindre une équipe comme la vôtre en tant que [poste], en full remote. »
4. **La demande et la sortie.** Une question légère, puis la phrase
   d'opposition, **mot pour mot** (le code la vérifie) :
   « Si le sujet ne vous concerne pas, dites-le-moi et je ne vous réécrirai pas. »

Exemples de demandes légères : « Est-ce un sujet chez vous en ce moment ? »,
« Qui serait la bonne personne pour en parler ? », « Un échange de 15 minutes
aurait-il du sens ? ». Jamais deux demandes dans le même email.

## Objet

- 3 à 6 mots, en minuscules sauf noms propres, sans emoji ni point d'exclamation.
- Il parle d'eux ou du problème, pas de Hugo.
- Bons : `votre croissance et la création`, `après votre levée`,
  `production créative chez <Entreprise>`, `votre offre Head of Brand`.
- Interdits : `Candidature spontanée`, `Opportunité`, `Collaboration`, tout
  objet qui pourrait aller à n'importe qui.

## Message LinkedIn

- **Invitation** : sans note par défaut (le compte gratuit n'a que 3 notes par
  mois). Si une note est utilisée : 200 caractères maximum, le signal et une
  phrase, aucune demande.
- **Message après acceptation** : 50 à 80 mots, même structure que l'email
  en plus court, sans pièce jointe, avec le lien portfolio.
- Jamais le même texte que l'email mot pour mot.

## Relance

Une seule, **6 jours ouvrés** après, **dans le même fil**, si aucune réponse :
2 ou 3 phrases, un élément nouveau (une autre preuve ou une idée concrète pour
eux), jamais « je me permets de relancer ». Rédigée en même temps que l'email
initial et validée avec lui.

## Ton

Direct, précis, calme. Quelqu'un de compétent qui propose quelque chose
d'utile, pas quelqu'un qui demande une faveur. Pas d'humilité feinte, pas
d'enthousiasme forcé.

## Bannis

Toutes les formules de `~/Prospection/profil/ton-de-voix.md` (liste dure),
plus :
- « candidature spontanée », « je me permets », « n'hésitez pas »
- « passionné », « motivé », « dynamique », « rigoureux », « créatif » comme
  adjectifs sur soi
- « je pense pouvoir apporter », « je serais ravi », « valeur ajoutée »
- « dans l'attente de votre retour », « cordialement » seul en fin de texte
  (la signature suffit)
- les trois points de suspension, les points d'exclamation
- toute phrase qui pourrait être envoyée telle quelle à une autre entreprise

## L'épreuve finale

Remplacer le nom de l'entreprise par celui d'une concurrente. **Si l'email
tient encore, il est trop générique : il est réécrit.**
