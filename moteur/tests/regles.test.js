// Tests des garde-fous. Lancer depuis la racine : TZ=Europe/Paris node --test moteur/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../regles.js');

const racine = path.resolve(__dirname, '..', '..');
const exemple = () => JSON.parse(fs.readFileSync(path.join(racine, 'infra/exemple_lot.json'), 'utf8'));
const approche = () => exemple().approches[0];
const ctx = (extra) => Object.assign({ listeNoire: [], dejaContactes: [], contacts: {}, aujourdhui: new Date(2026, 10, 4, 9), relanceActive: true }, extra || {});
const contient = (erreurs, motif) => erreurs.some((e) => e.includes(motif));

test('l\'approche d\'exemple est conforme', () => {
  assert.deepEqual(R.validerApproche(approche(), ctx()), []);
});

test('motifs interdits : Camden, tirets, « nous », insensible à la casse et aux accents', () => {
  assert.ok(R.chercherMotifs('Chez CAMDEN on fait').length);
  assert.ok(R.chercherMotifs('une marque — superbe').length);
  assert.ok(R.chercherMotifs('de 10–15 jours').length);
  assert.ok(R.chercherMotifs('Nous avons livré').length);
  assert.ok(R.chercherMotifs('la Brasserie du Mont Blanc').length);
  assert.ok(R.chercherMotifs('groupe Duvel').length);
  assert.ok(R.chercherMotifs('Je me permets de vous écrire').length);
  assert.deepEqual(R.chercherMotifs('Vous avez levé des fonds, je propose un échange.'), []);
});

test('un motif interdit dans le corps bloque l\'approche', () => {
  const a = approche();
  a.message.corps = a.message.corps.replace('mon propre plugin Figma', 'notre équipe');
  assert.ok(contient(R.validerApproche(a, ctx()), 'notre equipe'));
});

test('liste noire : domaine, sous-domaine et adresse exacte', () => {
  assert.ok(R.estDansListe('a@lyon.camden.com', 'lyon.camden.com', ['camden.com']));
  assert.ok(R.estDansListe('jean@x.fr', 'x.fr', ['jean@x.fr']));
  assert.ok(!R.estDansListe('jean@x.fr', 'x.fr', ['y.fr', 'paul@x.fr']));
  const a = approche();
  assert.ok(contient(R.validerApproche(a, ctx({ listeNoire: ['exemple-tech.test'] })), 'liste noire'));
  assert.ok(contient(R.validerApproche(a, ctx({ dejaContactes: ['exemple-tech.test'] })), 'déjà démarché'));
});

test('cible exclue par son nom même sous un domaine inconnu', () => {
  const a = approche(); a.entreprise = 'Camden Paris';
  assert.ok(contient(R.validerApproche(a, ctx()), 'cible exclue'));
});

test('délai de 6 mois entre deux approches de la même entreprise', () => {
  const a = approche();
  assert.ok(contient(R.validerApproche(a, ctx({ contacts: { 'exemple-tech.test': '2026-08-01' } })), 'déjà contactée'));
  assert.deepEqual(R.validerApproche(a, ctx({ contacts: { 'exemple-tech.test': '2026-03-01' } })), []);
});

test('adresse générique, domaine incohérent, adresse déduite sans preuve', () => {
  let a = approche(); a.email = 'contact@exemple-tech.test';
  assert.ok(contient(R.validerApproche(a, ctx()), 'générique'));
  a = approche(); a.email = 'camille@autre.test';
  assert.ok(contient(R.validerApproche(a, ctx()), 'ne correspond pas'));
  a = approche(); a.statut_email = 'deduite'; delete a.preuve_email;
  assert.ok(contient(R.validerApproche(a, ctx()), 'CNIL'));
});

test('textes : longueur, balise portfolio, lien en clair, phrase d\'opposition', () => {
  let a = approche(); a.message.corps = 'Trop court. {{PORTFOLIO}} Si le sujet ne vous concerne pas, dites-le-moi et je ne vous réécrirai pas.';
  assert.ok(contient(R.validerApproche(a, ctx()), 'mots (80 à 130'));
  a = approche(); a.message.corps = a.message.corps.replace('{{PORTFOLIO}}', 'https://exemple.test');
  const e = R.validerApproche(a, ctx());
  assert.ok(contient(e, 'exactement une fois') && contient(e, 'adresse web'));
  a = approche(); a.message.corps = a.message.corps.replace('je ne vous réécrirai pas', 'je ne vous embêterai plus');
  assert.ok(contient(R.validerApproche(a, ctx()), 'opposition'));
  a = approche(); a.message.objet = 'bonjour';
  assert.ok(contient(R.validerApproche(a, ctx()), 'objet de 1 mots'));
});

test('décisions des agents : score, censeur, sources', () => {
  let a = approche(); a.score = 60;
  assert.ok(contient(R.validerApproche(a, ctx()), 'score'));
  a = approche(); a.censeur.decision = 'reecrire';
  assert.ok(contient(R.validerApproche(a, ctx()), 'censeur'));
  a = approche(); a.sources = [];
  assert.ok(contient(R.validerApproche(a, ctx()), 'source'));
});

test('lot : deux approches vers la même entreprise sont refusées', () => {
  const lot = exemple();
  const b = JSON.parse(JSON.stringify(lot.approches[0])); b.id = '2026-11-04-02';
  lot.approches.push(b);
  const r = R.validerLot(lot, ctx());
  assert.ok(contient(r.approches[1].erreurs, 'même entreprise'));
});

test('lien du portfolio obligatoire au moment de l\'envoi', () => {
  assert.ok(contient(R.validerApproche(approche(), ctx({ urlPortfolio: '' })), 'portfolio'));
  assert.deepEqual(R.validerApproche(approche(), ctx({ urlPortfolio: 'https://drive.google.com/x' })), []);
});

test('calendrier français : Pâques, jours fériés, week-ends', () => {
  assert.equal(R.cle(R.paques(2026)), '2026-04-05');
  assert.equal(R.cle(R.paques(2027)), '2027-03-28');
  assert.ok(!R.estJourOuvre(new Date(2026, 10, 11, 10)));  // 11 novembre
  assert.ok(!R.estJourOuvre(new Date(2026, 4, 14, 10)));   // Ascension 2026
  assert.ok(!R.estJourOuvre(new Date(2026, 10, 7, 10)));   // samedi
  assert.ok(R.estJourOuvre(new Date(2026, 10, 4, 10)));    // mercredi
  // du mercredi 4/11 au jeudi 12/11 : 5, 6, 9, 10, 12 (le 11 est férié)
  assert.equal(R.joursOuvresEntre(new Date(2026, 10, 4), new Date(2026, 10, 12)), 5);
});

test('créneaux : dans les fenêtres, jamais entre 12h et 14h, espacés', () => {
  const fen = [['10:10', '12:00'], ['14:00', '17:00']];
  let graine = 1; const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  const c = R.creneaux(8, new Date(2026, 10, 4, 10, 10), fen, 12, 45, null, alea);
  assert.ok(c.length >= 6);
  for (let i = 0; i < c.length; i++) {
    assert.ok(R.dansFenetres(c[i], fen), 'hors fenêtre : ' + c[i]);
    const h = c[i].getHours() + c[i].getMinutes() / 60;
    assert.ok(!(h >= 12 && h < 14), 'pendant la pause : ' + c[i]);
    if (i) assert.ok((c[i] - c[i - 1]) / 60000 >= 12);
  }
  // à 16h50, on ne peut plus rien caser : tout est reporté
  assert.equal(R.creneaux(3, new Date(2026, 10, 4, 16, 58), fen, 12, 45, null, alea).length, 0);
});

test('montée en charge et plafonds durs', () => {
  const conf = R.lireToml(fs.readFileSync(path.join(racine, 'config/quotas.toml'), 'utf8'));
  assert.equal(conf.lot.approches_par_jour, 5);
  assert.deepEqual(conf.emails.fenetres, [['10:10', '12:00'], ['14:00', '17:00']]);
  assert.equal(R.plafondPremiers(conf, new Date(2026, 10, 4)), 3);
  const c2 = JSON.parse(JSON.stringify(conf)); c2.montee_en_charge.date_debut = '2026-11-02';
  assert.equal(R.plafondPremiers(c2, new Date(2026, 10, 10)), 4);
  assert.equal(R.plafondPremiers(c2, new Date(2026, 10, 20)), 5);
  c2.lot.approches_par_jour = 50;
  assert.equal(R.plafondPremiers(c2, new Date(2026, 11, 20)), R.PLAFOND_DUR_PREMIERS_JOUR);
  c2.emails.max_par_jour = 99;
  assert.equal(R.plafondEmails(c2), R.PLAFOND_DUR_EMAILS_JOUR);
});

test('réponses : citation retirée puis classement', () => {
  const avecCitation = 'Merci, échangeons jeudi ?\n\nLe mar. 3 nov. 2026, Hugo Volle a écrit :\n> Si le sujet ne vous concerne pas, dites-le-moi';
  assert.equal(R.sansCitation(avecCitation), 'Merci, échangeons jeudi ?');
  assert.equal(R.classerReponse(avecCitation), 'positif');
  assert.equal(R.classerReponse('Merci de ne plus me contacter.'), 'stop');
  assert.equal(R.classerReponse('Je suis actuellement absent jusqu\'au 12.'), 'auto');
  assert.equal(R.classerReponse('Nous ne recrutons pas en ce moment, bonne continuation.'), 'refus');
  assert.equal(R.classerReponse('Malheureusement pas de poste, mais je vous propose un appel pour en parler.'), 'a_lire');
  assert.equal(R.classerReponse('Bien reçu.'), 'a_lire');
});

test('texte final : balise remplacée, signature ajoutée', () => {
  const t = R.texteFinal('Voir {{PORTFOLIO}}', 'https://x.test', 'Hugo Volle');
  assert.equal(t, 'Voir https://x.test\n\nHugo Volle');
});
