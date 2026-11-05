// Simulation d'une journée complète du moteur Apps Script, sans Google :
// Sheets, Gmail, GitHub, Discord et l'horloge sont remplacés par des doublures.
// Lancer : TZ=Europe/Paris node --test moteur/tests/simulation.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const racine = path.resolve(__dirname, '..', '..');
const lireFichier = (p) => fs.readFileSync(path.join(racine, p), 'utf8');

function monde(options) {
  options = options || {};
  const RealDate = Date;
  let maintenant = new RealDate(2026, 10, 4, 7, 0);
  class FausseDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(maintenant.getTime()); else super(...a); }
    static now() { return maintenant.getTime(); }
  }
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d, f) => {
    const y = d.getFullYear(), M = pad(d.getMonth() + 1), j = pad(d.getDate()), h = pad(d.getHours()), m = pad(d.getMinutes()), s = pad(d.getSeconds());
    if (isNaN(d.getTime())) throw new Error('Date invalide passée à formatDate');
    return f === 'yyyy-MM-dd' ? `${y}-${M}-${j}` : f === 'HH:mm' ? `${h}:${m}` : `${y}-${M}-${j}T${h}:${m}:${s}`;
  };

  // --- Google Sheets ---
  const feuilles = {};
  const feuille = (nom) => {
    const donnees = [];
    return {
      donnees, nom,
      getLastRow: () => donnees.length, getMaxRows: () => 1000,
      appendRow: (r) => donnees.push(r.map((x) => (x === undefined || x === null ? '' : x))),
      setFrozenRows() {},
      getRange: (l, c) => ({ setValue: (v) => { donnees[l - 1][c - 1] = v; }, setNumberFormat() {} }),
      getDataRange: () => ({ getValues: () => donnees.map((r) => r.slice()) }),
    };
  };
  const SpreadsheetApp = { getActive: () => ({
    getSheetByName: (n) => feuilles[n] || null,
    insertSheet: (n) => (feuilles[n] = feuille(n)),
    deleteSheet() {},
  }) };

  // --- Propriétés, cache, verrou ---
  const proprietes = Object.assign({ MODE: 'simulation', GITHUB_DEPOT: 'hugo/candidatures', GITHUB_TOKEN: 'x', DISCORD_WEBHOOK: 'https://discord.test/hook' }, options.proprietes || {});
  const PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => (k in proprietes ? proprietes[k] : null),
    setProperty: (k, v) => { proprietes[k] = v; },
    getProperties: () => Object.assign({}, proprietes),
    deleteProperty: (k) => { delete proprietes[k]; },
  }) };
  const cache = {};
  const CacheService = { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) };
  const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };

  // --- GitHub et Discord ---
  const depot = { main: {}, lots: {} };
  depot.main['config/quotas.toml'] = options.quotas || lireFichier('config/quotas.toml');
  depot.main['data/liste_noire.txt'] = lireFichier('data/liste_noire.txt');
  depot.main['data/deja_contactes.txt'] = lireFichier('data/deja_contactes.txt');
  depot.main['infra/exemple_lot.json'] = lireFichier('infra/exemple_lot.json');
  const discord = [], cartes = [];
  const reponse = (code, corps) => ({ getResponseCode: () => code, getContentText: () => corps });
  const UrlFetchApp = { fetch: (url, o) => {
    o = o || {};
    if (url.startsWith('https://discord.test')) {
      if (etat.discordCode) return reponse(etat.discordCode, 'error code: 1015');
      const c = JSON.parse(o.payload), e = (c.embeds || [])[0] || {};
      cartes.push(c);
      discord.push([c.content, e.title, e.description, (e.fields || []).map((f) => f.name + ' ' + f.value).join(' '), e.footer && e.footer.text].filter(Boolean).join('\n'));
      return reponse(204, '');
    }
    const m = /contents\/([^?]+)(?:\?ref=(.+))?$/.exec(url);
    if (o.method === 'put') { const b = JSON.parse(o.payload); depot[b.branch][m[1]] = Buffer.from(b.content, 'base64').toString('utf8'); return reponse(200, '{}'); }
    const branche = m[2] || 'main', contenu = depot[branche][m[1]];
    if (contenu === undefined) return reponse(404, '{}');
    return reponse(200, JSON.stringify({ sha: 'abc', content: Buffer.from(contenu).toString('base64') }));
  } };

  // --- Gmail ---
  const envoyes = [], fils = {}, alertesEmail = [];
  const etat = { discordCode: options.discordCode || 0 };
  const GmailApp = {
    createDraft: (a, objet, corps) => ({ send: () => {
      const id = 'fil-' + (envoyes.length + 1);
      const msg = { getThread: () => ({ getId: () => id }), getHeader: () => '<' + id + '@mail.gmail.com>', getFrom: () => 'Hugo Volle <hugo.volle.da@gmail.com>' };
      envoyes.push({ a, objet, corps, quand: new RealDate(maintenant) }); fils[id] = [msg]; return msg;
    } }),
    getThreadById: (id) => ({ getMessages: () => fils[id] || [] }),
    search: () => [],
    sendEmail: (a, objet, corps) => { alertesEmail.push({ a, objet, corps }); },
  };
  const Gmail = { Users: { Messages: { send: (r) => { envoyes.push({ relance: true, threadId: r.threadId, quand: new RealDate(maintenant) }); } } } };
  const Utilities = {
    formatDate: (d, tz, f) => fmt(d, f),
    base64Encode: (s) => Buffer.from(s, 'utf8').toString('base64'),
    base64EncodeWebSafe: (s) => Buffer.from(s, 'utf8').toString('base64url'),
    base64Decode: (s) => Buffer.from(s, 'base64'),
    newBlob: (b) => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    Charset: { UTF_8: 'UTF-8' },
    DigestAlgorithm: { MD5: 'md5' },
    computeDigest: (alg, s) => [...require('crypto').createHash('md5').update(s).digest()],
  };
  const ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.test/page' }), getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) };
  const Session = { getEffectiveUser: () => ({ getEmail: () => 'hugo.volle.da@gmail.com' }) };

  Utilities.base64Encode = (s) => Buffer.from(Array.isArray(s) ? Buffer.from(s) : Buffer.from(s, 'utf8')).toString('base64');
  const ctx = vm.createContext({ Date: FausseDate, Math, JSON, String, Number, Object, Array, Set, Map, RegExp, Error, isNaN, console,
    SpreadsheetApp, PropertiesService, CacheService, LockService, UrlFetchApp, GmailApp, Gmail, Utilities, ScriptApp, Session, HtmlService: {} });
  // Les tests vérifient le moteur actif, même quand il est en pause en production.
  vm.runInContext(lireFichier('moteur/regles.js') + '\n' + lireFichier('moteur/apps-script/Code.js').replace('const EN_PAUSE = true;', 'const EN_PAUSE = false;'), ctx);

  return {
    ctx, feuilles, proprietes, depot, discord, cartes, envoyes, fils, alertesEmail, etat,
    allerA: (h, m, jour) => { maintenant = new RealDate(2026, 10, jour || 4, h, m); },
    /** Fait tourner tick() toutes les 5 minutes entre deux heures. */
    derouler: function (h1, m1, h2, m2, jour) {
      let t = new RealDate(2026, 10, jour || 4, h1, m1);
      const fin = new RealDate(2026, 10, jour || 4, h2, m2);
      while (t <= fin) { maintenant = t; ctx.tick(); t = new RealDate(t.getTime() + 5 * 60000); }
    },
    lignes: () => vm.runInContext('lignes_()', ctx),
  };
}

function lotDuJour(w, nb, jour) {
  const base = JSON.parse(lireFichier('infra/exemple_lot.json'));
  base.date = '2026-11-' + String(jour || 4).padStart(2, '0');
  base.approches = Array.from({ length: nb }, (_, i) => {
    const a = JSON.parse(JSON.stringify(base.approches[0]));
    a.id = base.date + '-0' + (i + 1);
    a.domaine = 'entreprise' + i + '.test'; a.email = 'camille.martin@entreprise' + i + '.test';
    return a;
  });
  w.depot.lots['data/lots/' + base.date + '.json'] = JSON.stringify(base);
  return base;
}

test('journée type en simulation : import 10h10, validation, envois étalés, bilan, export', () => {
  const w = monde({ proprietes: { URL_PORTFOLIO: 'https://drive.google.test/portfolio' } });
  w.ctx.installer();
  lotDuJour(w, 5);
  w.derouler(7, 0, 10, 5);
  assert.equal(w.lignes().length, 0, 'rien avant 10h10');
  w.derouler(10, 10, 10, 10);
  assert.equal(w.lignes().length, 5);
  assert.ok(w.lignes().every((l) => l.statut === 'a_valider'));
  const carte = w.cartes.find((c) => c.embeds[0].title === '📬 5 approches à valider');
  assert.ok(carte, 'carte du lot');
  assert.equal(carte.embeds[0].fields.length, 5, 'un champ par approche');
  assert.equal(carte.embeds[0].url, 'https://script.google.test/page', 'le titre ouvre la page de validation');
  assert.ok(w.cartes.every((c) => c.embeds[0].footer.text.includes('Simulation')));
  assert.ok(JSON.stringify(w.cartes).length < 6000 * w.cartes.length, 'sous la limite Discord');

  w.ctx.toutValider();
  w.derouler(10, 15, 17, 0);
  const l = w.lignes();
  const parties = l.filter((x) => x.statut === 'envoyee');
  assert.equal(parties.length, 3, 'semaine 1 : plafond de 3 premiers contacts');
  assert.equal(l.filter((x) => x.statut === 'validee').length, 2, 'le reste est reporté, pas perdu');
  assert.equal(w.envoyes.length, 0, 'mode simulation : aucun email réel');
  const heures = parties.map((x) => new Date(x.envoye_le)).sort((a, b) => a - b);
  for (let i = 0; i < heures.length; i++) {
    const h = heures[i].getHours() + heures[i].getMinutes() / 60;
    assert.ok((h >= 10 + 10 / 60 && h < 12) || (h >= 14 && h < 17), 'hors fenêtre : ' + heures[i]);
    if (i) assert.ok((heures[i] - heures[i - 1]) / 60000 >= 10, 'envois trop rapprochés');
  }
  w.derouler(17, 5, 18, 5);
  assert.ok(w.discord.some((d) => d.includes('Bilan du mercredi 4 novembre')));
  assert.ok(w.depot.lots['data/suivi_export.json'], 'export du suivi poussé sur la branche lots');
});

test('lot absent à 9h30 : alerte, puis import quand il arrive', () => {
  const w = monde({ proprietes: { LIEN_ROUTINE: 'https://claude.ai/code/routines/x' } });
  w.ctx.installer();
  w.derouler(9, 0, 9, 35);
  assert.ok(w.discord.some((d) => d.includes('pas prêt') && d.includes('routines/x')));
  w.derouler(9, 40, 10, 20);
  assert.equal(w.lignes().length, 0);
  lotDuJour(w, 2);
  w.derouler(10, 25, 10, 25);
  assert.equal(w.lignes().length, 2);
});

test('garde-fous à l\'import : liste noire, motif interdit, doublon', () => {
  const w = monde();
  w.ctx.installer();
  const lot = lotDuJour(w, 3);
  lot.approches[0].domaine = 'camden.com'; lot.approches[0].email = 'x.y@camden.com';
  lot.approches[1].message.corps = lot.approches[1].message.corps.replace('mon propre plugin', 'notre agence et son plugin');
  w.depot.lots['data/lots/2026-11-04.json'] = JSON.stringify(lot);
  w.derouler(10, 10, 10, 10);
  const l = w.lignes();
  assert.equal(l[0].statut, 'refusee_code');
  assert.equal(l[1].statut, 'refusee_code');
  assert.equal(l[2].statut, 'a_valider');
  w.derouler(10, 15, 10, 15);
  assert.equal(w.lignes().length, 3, 'un lot relu n\'est jamais réimporté');
  assert.equal(w.discord.filter((d) => d.includes('à valider') && d.startsWith('📬')).length, 1, 'une seule notification pour un même lot');
});

test('sans lien de portfolio, rien ne part même en mode réel', () => {
  const w = monde({ proprietes: { MODE: 'reel' } });
  w.ctx.installer();
  lotDuJour(w, 1);
  w.derouler(10, 10, 10, 10);
  w.ctx.toutValider();
  w.derouler(10, 15, 12, 0);
  assert.equal(w.envoyes.length, 0);
  assert.equal(w.lignes()[0].statut, 'refusee_code');
  assert.ok(w.discord.some((d) => d.includes('Envoi bloqué')));
});

test('mode réel : envoi Gmail, relance à J+6 ouvrés, annulée si réponse', () => {
  const w = monde({ proprietes: { MODE: 'reel', URL_PORTFOLIO: 'https://drive.google.test/portfolio' } });
  w.ctx.installer();
  lotDuJour(w, 2);
  w.derouler(10, 10, 10, 10);
  w.ctx.toutValider();
  w.derouler(10, 15, 17, 0);
  assert.equal(w.envoyes.length, 2);
  assert.ok(w.envoyes[0].corps.includes('https://drive.google.test/portfolio'));
  assert.ok(w.envoyes[0].corps.endsWith('+33 7 81 12 69 48'));
  assert.ok(!w.envoyes[0].corps.includes('{{PORTFOLIO}}'));
  // La 2e personne répond positivement le 5.
  w.allerA(9, 0, 5);
  w.fils['fil-2'].push({ getFrom: () => 'Camille <camille.martin@entreprise1.test>', getPlainBody: () => 'Merci, échangeons jeudi ?\n\nLe 4 nov. Hugo a écrit :\n> blabla', getSubject: () => 'Re: après votre série A', getDate: () => new Date(2026, 10, 5, 9) });
  w.derouler(9, 0, 9, 0, 5);
  assert.equal(w.lignes()[1].statut, 'repondu');
  assert.ok(w.discord.some((d) => d.includes('🔥')));
  // Le 11 novembre est férié : 6 jours ouvrés après le 4 = le vendredi 13.
  w.derouler(10, 10, 17, 0, 12);
  assert.equal(w.envoyes.filter((e) => e.relance).length, 0, 'pas de relance avant J+6 ouvrés');
  w.derouler(10, 10, 17, 0, 13);
  const relances = w.envoyes.filter((e) => e.relance);
  assert.equal(relances.length, 1, 'une seule relance, pour celle qui n\'a pas répondu');
  assert.equal(relances[0].threadId, 'fil-1');
});

test('opposition : la personne et son domaine passent en liste noire', () => {
  const w = monde({ proprietes: { MODE: 'reel', URL_PORTFOLIO: 'https://drive.google.test/p' } });
  w.ctx.installer();
  lotDuJour(w, 1);
  w.derouler(10, 10, 10, 10);
  w.ctx.toutValider();
  w.derouler(10, 15, 17, 0);
  w.fils['fil-1'].push({ getFrom: () => 'c@entreprise0.test', getPlainBody: () => 'Merci de ne plus me contacter.', getSubject: () => 'Re', getDate: () => new Date(2026, 10, 5, 9) });
  w.derouler(9, 0, 9, 0, 5);
  const noire = w.feuilles.ListeNoire.donnees.map((r) => r[0]);
  assert.ok(noire.includes('entreprise0.test'));
  assert.ok(noire.includes('camille.martin@entreprise0.test'));
});

test('week-end : aucune action d\'envoi', () => {
  const w = monde({ proprietes: { URL_PORTFOLIO: 'https://drive.google.test/p' } });
  w.ctx.installer();
  lotDuJour(w, 2, 7);
  w.derouler(9, 0, 17, 0, 7);
  assert.equal(w.lignes().length, 0);
});

test('Discord refuse (429 / 1015) : le message attend et part au passage suivant, jamais par email', () => {
  const w = monde({ discordCode: 429 });
  w.ctx.installer();
  lotDuJour(w, 1);
  w.derouler(10, 10, 10, 10);
  assert.equal(w.discord.length, 0);
  assert.equal(w.alertesEmail.length, 0, 'aucune alerte par email');
  w.etat.discordCode = 0;
  w.derouler(10, 15, 10, 15);
  assert.ok(w.discord.some((d) => d.includes('à valider') && d.includes('retardé par Discord')));
  assert.equal(Object.keys(w.proprietes).filter((k) => k.startsWith('DISCORD_Q_')).length, 0, 'file vidée');
});

test('candidature sur offre publiée : validée, à déposer à la main, jamais envoyée par email', () => {
  const w = monde({ proprietes: { MODE: 'reel', URL_PORTFOLIO: 'https://drive.google.test/p' } });
  w.ctx.installer();
  const lot = lotDuJour(w, 1);
  const a = lot.approches[0];
  a.canal = ['candidature']; a.url_offre = 'https://jobs.ashbyhq.com/exemple/123';
  a.personne = { prenom: '', nom: '', poste: '' }; delete a.email;
  a.message.corps = 'Bonjour, ' + 'je relie marque et production à grande échelle avec des outils que je construis moi-même, pour une équipe qui grandit vite. '.repeat(3) + 'Mon portfolio : {{PORTFOLIO}}';
  w.depot.lots['data/lots/2026-11-04.json'] = JSON.stringify(lot);
  w.derouler(10, 10, 10, 10);
  assert.equal(w.lignes()[0].statut, 'a_valider', w.lignes()[0].erreurs_code);
  w.ctx.toutValider();
  w.derouler(10, 15, 17, 0);
  assert.equal(w.envoyes.length, 0, 'aucun email pour une candidature');
  const d = w.ctx.donneesPage();
  assert.equal(d.candidatures.length, 1);
  assert.ok(d.candidatures[0].message_candidature.includes('https://drive.google.test/p'));
  w.ctx.candidatureDeposee(a.id);
  assert.ok(w.lignes()[0].envoye_le, 'le dépôt compte comme une approche (délai de 6 mois)');
  assert.equal(w.ctx.donneesPage().candidatures.length, 0);
});
