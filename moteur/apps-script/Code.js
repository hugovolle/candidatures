/**
 * Moteur de la recherche de poste de Hugo Volle — Google Apps Script.
 *
 * Tourne chez Google, ordinateur éteint. Lié au Google Sheet « Suivi
 * candidatures ». Un seul déclencheur, `tick`, toutes les 5 minutes, fait tout :
 *   09h30  contrôle que la routine a bien produit le lot du jour
 *   10h10  importe le lot depuis GitHub et prévient Hugo sur Discord
 *   journée  planifie et envoie les approches validées, une par passage
 *   /15 min  relève les réponses et les rebonds
 *   17h30  bilan du jour      18h00  export du suivi vers GitHub
 *   lundi 9h  publie le bilan hebdomadaire de l'analyste
 *
 * Les règles vérifiables viennent de `regles.js` (même fichier que celui de
 * la routine) : elles sont appliquées à l'import ET juste avant chaque envoi.
 */

const ONGLET = { approches: 'Approches', journal: 'Journal', listeNoire: 'ListeNoire', reponses: 'Reponses' };
const COLONNES = [
  'id', 'date_lot', 'statut', 'entreprise', 'domaine', 'prenom', 'nom', 'poste_personne', 'email',
  'canal', 'priorite', 'intitule', 'score', 'objet', 'corps', 'relance', 'linkedin_url',
  'linkedin_note', 'linkedin_message', 'linkedin_statut', 'erreurs_code', 'motif_rejet_hugo',
  'modifie_par_hugo', 'envoi_prevu', 'envoye_le', 'thread_id', 'message_id', 'relance_prevue',
  'relance_envoyee_le', 'reponse_classe', 'reponse_le', 'json', 'url_offre', 'candidature_statut',
];
const SIGNATURE = 'Hugo Volle\nDirecteur artistique et creative technologist\n+33 7 81 12 69 48';
const FUSEAU = 'Europe/Paris';

// ---------- Utilitaires ----------

function prop_(k, defaut) { const v = PropertiesService.getScriptProperties().getProperty(k); return v === null ? defaut : v; }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, String(v)); }
function jour_(d) { return Utilities.formatDate(d || new Date(), FUSEAU, 'yyyy-MM-dd'); }
function hhmm_(d) { return Utilities.formatDate(d || new Date(), FUSEAU, 'HH:mm'); }
function iso_(d) { return Utilities.formatDate(d, FUSEAU, "yyyy-MM-dd'T'HH:mm:ss"); }
function deIso_(s) { return s ? new Date(String(s).replace(' ', 'T')) : null; }
/** Vrai si la valeur est une date (texte ISO) tombant le jour j. Tolère les marqueurs comme « bloquee ». */
function estDuJour_(v, j) { if (!v) return false; const d = new Date(v); return !isNaN(d.getTime()) && jour_(d) === j; }
function modeReel_() { return prop_('MODE', 'simulation') === 'reel'; }
function fait_(cle) { return prop_('fait_' + cle, '') === '1'; }
function marquer_(cle) { setProp_('fait_' + cle, '1'); }

function feuille_(nom) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(nom) || ss.insertSheet(nom);
}

function journal_(niveau, evenement, detail) {
  feuille_(ONGLET.journal).appendRow([iso_(new Date()), niveau, evenement, String(detail || '').slice(0, 45000)]);
}

// ---------- Discord : des cartes lisibles en un coup d'œil ----------

const COULEUR = { info: 0x2C4A9B, succes: 0x1F6F43, attention: 0xC77700, erreur: 0x9B2C1F, neutre: 0x6F6B64, chaud: 0xE8590C };
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function dateLongue_(j) { const d = new Date(j + 'T12:00:00'); return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()]; }
function coupe_(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/**
 * Construit le message Discord d'une carte :
 * { titre, texte, couleur, champs: [{ nom, valeur, ligne }], lien, pied }.
 */
function charge_(carte) {
  if (typeof carte === 'string') carte = { texte: carte, couleur: COULEUR.neutre };
  const pied = [modeReel_() ? '' : '🧪 Simulation : rien n\'est envoyé', carte.pied || ''].filter(Boolean).join(' · ');
  const e = { color: carte.couleur || COULEUR.info, timestamp: new Date().toISOString() };
  if (carte.titre) e.title = coupe_(carte.titre, 250);
  if (carte.texte) e.description = coupe_(carte.texte, 3900);
  if (carte.lien) e.url = carte.lien;
  if (carte.champs && carte.champs.length) e.fields = carte.champs.slice(0, 20).map(function (c) { return { name: coupe_(c.nom, 250), value: coupe_(c.valeur || '—', 1000), inline: !!c.ligne }; });
  if (pied) e.footer = { text: coupe_(pied, 2000) };
  return { username: 'Candidatures', embeds: [e] };
}

/**
 * Prévient Hugo sur Discord, et uniquement sur Discord (choix de Hugo : pas
 * d'alertes par email). Discord bloque parfois les serveurs de Google
 * (erreur 429 / 1015) : le message est alors mis en file et renvoyé à chaque
 * passage, dans l'ordre, jusqu'à ce qu'il passe. Rien ne se perd.
 */
function notifier_(carte) {
  const p = PropertiesService.getScriptProperties();
  const cle = 'DISCORD_Q_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  p.setProperty(cle, JSON.stringify({ t: hhmm_(), charge: charge_(carte) }).slice(0, 8900));
  const cles = clesFile_();
  cles.slice(0, Math.max(0, cles.length - 30)).forEach(function (k) { p.deleteProperty(k); });
  viderFileDiscord_();
}

function clesFile_() {
  return Object.keys(PropertiesService.getScriptProperties().getProperties()).filter(function (k) { return /^DISCORD_Q_/.test(k); }).sort();
}

/** Envoie les messages en attente, du plus ancien au plus récent ; s'arrête au premier refus. */
function viderFileDiscord_() {
  const url = prop_('DISCORD_WEBHOOK', ''), p = PropertiesService.getScriptProperties();
  if (!url) return;
  for (const k of clesFile_()) {
    let m;
    try { m = JSON.parse(p.getProperty(k)); } catch (e) { p.deleteProperty(k); continue; }
    if (m.t !== hhmm_() && m.charge.embeds && m.charge.embeds[0]) {
      const f = m.charge.embeds[0].footer || { text: '' };
      f.text = (f.text ? f.text + ' · ' : '') + 'envoyé à ' + m.t + ', retardé par Discord';
      m.charge.embeds[0].footer = f;
    }
    let code;
    try { code = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(m.charge), muteHttpExceptions: true }).getResponseCode(); } catch (e) { code = 0; }
    setProp_('DERNIER_DISCORD', iso_(new Date()) + ' HTTP ' + code);
    if (code >= 300 || code === 0) {
      const marque = 'discord_refus_' + jour_() + '_' + hhmm_().slice(0, 2);
      if (!fait_(marque)) { marquer_(marque); journal_('erreur', 'Discord', 'HTTP ' + code + ', ' + clesFile_().length + ' message(s) en attente, nouvel essai dans 5 min'); }
      return;
    }
    p.deleteProperty(k);
  }
}

function urlPage_() { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } }

// ---------- GitHub ----------

function github_(chemin, branche, options) {
  const depot = prop_('GITHUB_DEPOT', ''), jeton = prop_('GITHUB_TOKEN', '');
  if (!depot || !jeton) throw new Error('GITHUB_DEPOT ou GITHUB_TOKEN manquant dans les propriétés du script');
  const url = 'https://api.github.com/repos/' + depot + '/contents/' + chemin + (branche ? '?ref=' + encodeURIComponent(branche) : '');
  const o = Object.assign({ muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + jeton, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }, options || {});
  return UrlFetchApp.fetch(url, o);
}

/** Contenu texte d'un fichier du dépôt, ou null s'il n'existe pas. */
function lireDepot_(chemin, branche) {
  const r = github_(chemin, branche);
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() >= 300) throw new Error('GitHub ' + r.getResponseCode() + ' sur ' + chemin + ' : ' + r.getContentText().slice(0, 300));
  const j = JSON.parse(r.getContentText());
  return Utilities.newBlob(Utilities.base64Decode(j.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
}

function ecrireDepot_(chemin, branche, contenu, message) {
  const existant = github_(chemin, branche);
  const sha = existant.getResponseCode() === 200 ? JSON.parse(existant.getContentText()).sha : undefined;
  const corps = { message: message, branch: branche, content: Utilities.base64Encode(contenu, Utilities.Charset.UTF_8) };
  if (sha) corps.sha = sha;
  const r = github_(chemin, null, { method: 'put', contentType: 'application/json', payload: JSON.stringify(corps) });
  if (r.getResponseCode() >= 300) throw new Error('Écriture GitHub ' + r.getResponseCode() + ' : ' + r.getContentText().slice(0, 300));
}

/** Configuration (config/quotas.toml de la branche main), gardée 1 h en cache. */
function config_() {
  const cache = CacheService.getScriptCache();
  let txt = cache.get('quotas');
  if (!txt) { txt = lireDepot_('config/quotas.toml', 'main') || ''; cache.put('quotas', txt, 3600); }
  const conf = Regles.lireToml(txt);
  conf.montee_en_charge = conf.montee_en_charge || {};
  if (!conf.montee_en_charge.date_debut && prop_('DATE_DEBUT', '')) conf.montee_en_charge.date_debut = prop_('DATE_DEBUT', '');
  return conf;
}

function listeDepot_(chemin) {
  const cache = CacheService.getScriptCache();
  let txt = cache.get('liste_' + chemin);
  if (txt === null) {
    txt = lireDepot_(chemin, 'main') || '';
    if (txt.length < 95000) cache.put('liste_' + chemin, txt, 3600);
  }
  return Regles.lireListe(txt);
}

// ---------- Tableau ----------

/** En-tête réel de l'onglet, complété des colonnes ajoutées depuis l'installation. */
function entete_() {
  const f = feuille_(ONGLET.approches);
  if (f.getLastRow() === 0) { f.appendRow(COLONNES); return COLONNES.slice(); }
  const e = f.getDataRange().getValues()[0].map(String);
  const manquantes = COLONNES.filter(function (c) { return e.indexOf(c) < 0; });
  manquantes.forEach(function (c) { e.push(c); f.getRange(1, e.length).setValue(c); });
  return e;
}

function lignes_() {
  const f = feuille_(ONGLET.approches);
  const v = f.getDataRange().getValues();
  if (v.length < 2) return [];
  const entete = v[0];
  return v.slice(1).map(function (row, i) {
    const o = { _ligne: i + 2 };
    entete.forEach(function (c, k) { o[c] = row[k]; });
    return o;
  });
}

function maj_(ligne, champs) {
  const f = feuille_(ONGLET.approches), e = entete_();
  for (const c in champs) {
    const k = e.indexOf(c);
    if (k < 0) throw new Error('Colonne inconnue : ' + c);
    f.getRange(ligne, k + 1).setValue(champs[c]);
  }
}

function listeNoireTableau_() {
  const v = feuille_(ONGLET.listeNoire).getDataRange().getValues();
  return v.slice(1).map(function (r) { return String(r[0]).toLowerCase().trim(); }).filter(Boolean);
}

function ajouterListeNoire_(valeur, motif) {
  if (!valeur) return;
  if (listeNoireTableau_().indexOf(String(valeur).toLowerCase()) >= 0) return;
  feuille_(ONGLET.listeNoire).appendRow([String(valeur).toLowerCase(), motif, jour_()]);
}

/** Contexte des règles : listes du dépôt + tableau + derniers contacts. */
function contexte_(sauf) {
  const conf = config_();
  const contacts = {};
  lignes_().forEach(function (l) {
    if (l.id === sauf || !l.envoye_le) return;
    const d = String(l.domaine).toLowerCase(), j = jour_(new Date(l.envoye_le));
    if (!contacts[d] || contacts[d] < j) contacts[d] = j;
  });
  return {
    config: conf,
    ctx: {
      listeNoire: listeDepot_('data/liste_noire.txt').concat(listeNoireTableau_()),
      dejaContactes: listeDepot_('data/deja_contactes.txt'),
      contacts: contacts,
      aujourdhui: new Date(),
      delaiMois: (conf.exclusions || {}).delai_meme_entreprise_mois || 6,
      scoreMinimum: (conf.lot || {}).score_minimum || 65,
      noteMinimum: (conf.lot || {}).note_censeur_minimum || 8,
      relanceActive: !!(conf.relance || {}).active,
    },
  };
}

function urlPortfolio_(conf) {
  return prop_('URL_PORTFOLIO', '') || ((conf.documents || {}).portfolio_cv_url || '');
}

/** Reconstruit l'approche depuis la ligne (les textes du tableau font foi : Hugo a pu les modifier). */
function approcheDeLigne_(l) {
  const a = JSON.parse(l.json);
  a.email = l.email;
  a.message = Object.assign({}, a.message, { objet: l.objet, corps: l.corps, relance: l.relance, linkedin_note: l.linkedin_note, linkedin_message: l.linkedin_message });
  return a;
}

// ---------- Installation ----------

/** À lancer une fois à la main depuis l'éditeur Apps Script. */
function installer() {
  const f = feuille_(ONGLET.approches);
  // Tout en texte brut : sinon Sheets convertit les dates ISO et les identifiants.
  f.getRange(1, 1, f.getMaxRows(), COLONNES.length + 5).setNumberFormat('@');
  entete_(); f.setFrozenRows(1);
  const j = feuille_(ONGLET.journal);
  if (j.getLastRow() === 0) { j.appendRow(['horodatage', 'niveau', 'evenement', 'detail']); j.setFrozenRows(1); }
  const n = feuille_(ONGLET.listeNoire);
  if (n.getLastRow() === 0) { n.appendRow(['valeur', 'motif', 'date']); n.setFrozenRows(1); }
  const r = feuille_(ONGLET.reponses);
  if (r.getLastRow() === 0) { r.appendRow(['date', 'id', 'entreprise', 'email', 'classe', 'extrait']); r.setFrozenRows(1); }
  const defaut = SpreadsheetApp.getActive().getSheetByName('Feuille 1') || SpreadsheetApp.getActive().getSheetByName('Sheet1');
  if (defaut && defaut.getLastRow() === 0) SpreadsheetApp.getActive().deleteSheet(defaut);

  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  // Valeurs non secrètes posées par défaut : il ne reste à saisir que les
  // trois secrets (GITHUB_TOKEN, DISCORD_WEBHOOK, URL_PORTFOLIO).
  if (!prop_('MODE', '')) setProp_('MODE', 'simulation');
  if (!prop_('GITHUB_DEPOT', '')) setProp_('GITHUB_DEPOT', 'hugovolle/candidatures');
  if (!prop_('LIEN_ROUTINE', '')) setProp_('LIEN_ROUTINE', 'https://claude.ai/code/routines/trig_01D1JZ7fL44yia5QBF5S3xgY');

  const manquants = ['GITHUB_TOKEN', 'DISCORD_WEBHOOK', 'URL_PORTFOLIO'].filter(function (k) { return !prop_(k, ''); });
  journal_('info', 'installation', 'Déclencheur toutes les 5 min créé. Mode : ' + prop_('MODE') + (manquants.length ? '. Propriétés manquantes : ' + manquants.join(', ') : ''));
  return manquants.length ? 'Propriétés manquantes : ' + manquants.join(', ') : 'Installation terminée (mode ' + prop_('MODE') + ').';
}

/**
 * Test de bout en bout : importe le lot d'exemple fictif du dépôt
 * (infra/exemple_lot.json) comme s'il s'agissait du lot du jour.
 * À lancer à la main depuis l'éditeur, en mode simulation.
 */
function testerAvecExemple() {
  const txt = lireDepot_('infra/exemple_lot.json', 'main');
  if (!txt) throw new Error('infra/exemple_lot.json introuvable sur la branche main');
  const lot = JSON.parse(txt);
  lot.date = jour_();
  lot.approches.forEach(function (a) { a.id = 'exemple-' + jour_() + '-' + hhmm_().replace(':', ''); });
  importerDonneesLot_(lot, true);
  return 'Lot d\'exemple importé : ouvre la page de validation.';
}

// ---------- Boucle principale ----------

function tick() {
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(20000)) return;
  try {
    const maintenant = new Date(), j = jour_(maintenant), h = hhmm_(maintenant);
    const ouvre = Regles.estJourOuvre(maintenant);
    viderFileDiscord_();
    if (ouvre && h >= '09:30' && !fait_('controle_' + j)) { controlerLot_(j); marquer_('controle_' + j); }
    // Le lot est relu à chaque passage jusqu'à 20h : un lot refait dans la journée est importé aussi.
    if (ouvre && h >= '10:10' && h < '20:00') importerLot_(j);
    if (ouvre) { planifier_(maintenant); envoyerUn_(maintenant); }
    if (Number(h.slice(3)) % 15 < 5) releverReponses_();
    if (ouvre && h >= '17:30' && !fait_('bilan_' + j)) { bilanDuJour_(j); marquer_('bilan_' + j); }
    if (h >= '18:00' && !fait_('export_' + j)) { exporterSuivi_(); marquer_('export_' + j); }
    if (maintenant.getDay() === 1 && h >= '09:00' && !fait_('hebdo_' + j)) { publierBilanHebdo_(maintenant); marquer_('hebdo_' + j); }
    if (h >= '23:00' && !fait_('menage_' + j)) { menage_(); marquer_('menage_' + j); }
    if (!fait_('apercu_cartes_v1')) { marquer_('apercu_cartes_v1'); PropertiesService.getScriptProperties().deleteProperty('FILE_DISCORD'); notifier_({ titre: '✨ Nouvelle présentation des notifications', couleur: COULEUR.succes, lien: urlPage_() || undefined,
      texte: 'Chaque matin, une carte comme celle-ci te présente le lot du jour. Un clic sur le titre ouvre ta page de validation.',
      champs: [{ nom: '📬 Bleu', valeur: 'Lot du jour à valider', ligne: true }, { nom: '🔥 Orange', valeur: 'Réponse positive', ligne: true }, { nom: '⏰ Ambre', valeur: 'Action ou alerte', ligne: true }, { nom: '🛑 Rouge', valeur: 'Blocage ou erreur', ligne: true }, { nom: '📊 Vert', valeur: 'Bilan, rien à faire', ligne: true }],
      pied: '✉️ email  📝 candidature  💼 LinkedIn' }); }
    if (!fait_('diag_' + j + '_' + h.slice(0, 2))) { marquer_('diag_' + j + '_' + h.slice(0, 2)); try { diagnostiquer(); } catch (e) { journal_('erreur', 'diagnostic', e.message); } }
  } catch (e) {
    journal_('erreur', 'tick', e.stack || e.message);
    const cle = 'erreur_' + jour_() + '_' + hhmm_().slice(0, 2);
    if (!fait_(cle)) { notifier_({ titre: '⚠️ Erreur du moteur', texte: '```' + coupe_(e.message, 1500) + '```\nLe détail est dans l\'onglet Journal du Sheet. Claude peut le lire dans le diagnostic.', couleur: COULEUR.erreur }); marquer_(cle); }
  } finally {
    verrou.releaseLock();
  }
}

function menage_() {
  const p = PropertiesService.getScriptProperties(), limite = jour_(new Date(Date.now() - 10 * 86400000));
  Object.keys(p.getProperties()).forEach(function (k) {
    const m = /^(?:fait_\w+?_|LOT_IMPORTE_)(\d{4}-\d{2}-\d{2})/.exec(k);
    if (m && m[1] < limite) p.deleteProperty(k);
  });
}

// ---------- Diagnostic (lisible par Claude via GitHub) ----------

/**
 * État du moteur SANS aucun secret : quelles propriétés existent, si leur
 * format est plausible, le dernier appel Discord et la fin du journal.
 * Publié dans data/diagnostic.json (branche lots) pour qu'un diagnostic à
 * distance soit possible sans ouvrir le Sheet.
 */
function etatMoteur_() {
  const p = function (k) { return prop_(k, ''); };
  const v = feuille_(ONGLET.journal).getDataRange().getValues();
  return {
    genere_le: iso_(new Date()), mode: p('MODE') || 'simulation',
    proprietes: {
      GITHUB_DEPOT: p('GITHUB_DEPOT'), LIEN_ROUTINE: !!p('LIEN_ROUTINE'),
      GITHUB_TOKEN: p('GITHUB_TOKEN') ? (/^(github_pat_|ghp_)/.test(p('GITHUB_TOKEN')) ? 'présent, format GitHub' : 'présent, FORMAT INATTENDU') : 'absent',
      DISCORD_WEBHOOK: p('DISCORD_WEBHOOK') ? (/^https:\/\/(ptb\.|canary\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(p('DISCORD_WEBHOOK').trim()) ? 'présent, format webhook' : 'présent, FORMAT INATTENDU (pas une URL de webhook)') : 'absent',
      URL_PORTFOLIO: p('URL_PORTFOLIO') ? (/^https:\/\//.test(p('URL_PORTFOLIO')) ? 'présent' : 'présent, FORMAT INATTENDU') : 'absent',
      autres: Object.keys(PropertiesService.getScriptProperties().getProperties()).filter(function (k) { return !/^(fait_|DISCORD_Q_|LOT_IMPORTE_)/.test(k) && ['MODE', 'GITHUB_DEPOT', 'LIEN_ROUTINE', 'GITHUB_TOKEN', 'DISCORD_WEBHOOK', 'URL_PORTFOLIO', 'DERNIER_DISCORD', 'FILE_DISCORD', 'DATE_DEBUT', 'DIAG_EMPREINTE'].indexOf(k) < 0; }),
    },
    dernier_discord: p('DERNIER_DISCORD') || 'jamais',
    messages_discord_en_attente: clesFile_().length,
    declencheurs: ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }),
    approches: lignes_().length,
    journal: v.slice(Math.max(1, v.length - 25)).map(function (r) { return [r[0], r[1], r[2], String(r[3]).replace(/https:\/\/discord[^\s]+/g, '[webhook]').slice(0, 400)]; }),
  };
}

/** Publie le diagnostic s'il a changé. Appelé chaque heure par tick, ou à la main. */
function diagnostiquer() {
  const etat = etatMoteur_();
  const empreinte = JSON.stringify([etat.proprietes, etat.dernier_discord, etat.messages_discord_en_attente, etat.journal.slice(-5), etat.approches]);
  if (empreinte === prop_('DIAG_EMPREINTE', '')) return 'Diagnostic inchangé.';
  ecrireDepot_('data/diagnostic.json', 'lots', JSON.stringify(etat, null, 2), 'Diagnostic du moteur');
  setProp_('DIAG_EMPREINTE', empreinte);
  return etat;
}

/** Envoie un message de test sur Discord et publie le diagnostic. */
function testerDiscord() {
  notifier_({ titre: '✅ Moteur connecté', texte: 'Les notifications de la recherche de poste arriveront dans ce salon.', couleur: COULEUR.succes });
  return diagnostiquer();
}

// ---------- Lot du jour ----------

function controlerLot_(j) {
  if (lireDepot_('data/lots/' + j + '.json', 'lots') !== null) return;
  const lien = prop_('LIEN_ROUTINE', '');
  notifier_({ titre: '⏰ Le lot du jour n\'est pas prêt', texte: 'À 9h30, la routine du matin n\'a encore rien déposé. Elle a peut-être échoué.' + (lien ? '\n\n**[Relancer la routine](' + lien + ')** (bouton « Run now »)' : ''), couleur: COULEUR.attention, lien: lien || undefined });
}

function importerLot_(j) {
  const txt = lireDepot_('data/lots/' + j + '.json', 'lots');
  if (txt === null) return false;
  const empreinte = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, txt));
  if (prop_('LOT_IMPORTE_' + j, '') === empreinte) return true;
  setProp_('LOT_IMPORTE_' + j, empreinte);
  let lot;
  try { lot = JSON.parse(txt); } catch (e) { notifier_({ titre: '⚠️ Lot illisible', texte: 'Le lot du ' + dateLongue_(j) + ' n\'est pas un JSON valide. Rien n\'est importé.', couleur: COULEUR.erreur }); return true; }
  importerDonneesLot_(lot, false);
  return true;
}

function importerDonneesLot_(lot, exemple) {
  const { ctx } = contexte_();
  const existants = {};
  lignes_().forEach(function (l) { existants[l.id] = true; });
  const res = Regles.validerLot(lot, ctx);
  const f = feuille_(ONGLET.approches), entete = entete_();
  let ok = 0, refusees = 0;
  (lot.approches || []).forEach(function (a, i) {
    if (!a || existants[a.id]) return;
    const err = res.approches[i].erreurs.concat(res.erreursLot);
    const m = a.message || {}, p = a.personne || {};
    const ligne = {
      id: a.id, date_lot: lot.date, statut: err.length ? 'refusee_code' : 'a_valider', entreprise: a.entreprise,
      domaine: a.domaine, prenom: p.prenom, nom: p.nom, poste_personne: p.poste, email: a.email || '',
      canal: (a.canal || []).join(','), priorite: a.poste, intitule: a.intitule_vise || '', score: a.score,
      objet: m.objet || '', corps: m.corps || '', relance: m.relance || '', linkedin_url: p.linkedin || '',
      linkedin_note: m.linkedin_note || '', linkedin_message: m.linkedin_message || '', linkedin_statut: '',
      erreurs_code: err.join(' ; '), json: JSON.stringify(a), url_offre: a.url_offre || '', candidature_statut: '',
    };
    f.appendRow(entete.map(function (c) { return ligne[c] === undefined ? '' : ligne[c]; }));
    if (err.length) refusees++; else ok++;
  });
  journal_('info', 'import ' + lot.date, ok + ' à valider, ' + refusees + ' refusée(s) par le code' + (exemple ? ' (exemple)' : ''));
  const lien = urlPage_();
  const icones = { email: '✉️', candidature: '📝', linkedin: '💼' };
  if (!(lot.approches || []).length) {
    notifier_({ titre: '📭 Pas d\'approche ' + (dateLongue_(lot.date).startsWith('lundi') ? 'ce lundi' : 'aujourd\'hui'), texte: coupe_(lot.resume || '', 900) + ((lot.alertes || []).length ? '\n\n**À savoir**\n' + lot.alertes.slice(0, 4).map(function (x) { return '• ' + coupe_(x, 220); }).join('\n') : ''), couleur: COULEUR.neutre, pied: dateLongue_(lot.date) });
  } else {
    const champs = (lot.approches || []).filter(function (a, i) { return a && !res.approches[i].erreurs.length; }).slice(0, 10).map(function (a) {
      const p = a.personne || {};
      return { nom: a.poste + ' · ' + (a.intitule_vise || '') + '  —  ' + a.entreprise,
        valeur: [(p.prenom ? p.prenom + ' ' + p.nom + (p.poste ? ', ' + p.poste : '') : 'Candidature sur l\'offre'), a.score + '/100 · ' + (a.canal || []).map(function (c) { return icones[c] || c; }).join(' ')].join('\n') + '\n_' + coupe_(a.signal, 160) + '_' };
    });
    notifier_({ titre: '📬 ' + ok + ' approche' + (ok > 1 ? 's' : '') + ' à valider', lien: lien || undefined,
      texte: (lien ? '**[Ouvrir ma page de validation](' + lien + ')**\n\n' : '') + coupe_(lot.resume || '', 600),
      champs: champs, couleur: COULEUR.info,
      pied: dateLongue_(lot.date) + (refusees ? ' · ' + refusees + ' bloquée(s) par les garde-fous' : '') + ' · ✉️ email  📝 candidature  💼 LinkedIn' });
  }
}

// ---------- Page de validation ----------

function doGet() {
  return HtmlService.createTemplateFromFile('Page').evaluate()
    .setTitle('Lot du jour')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function donneesPage() {
  const conf = config_(), url = urlPortfolio_(conf);
  const ls = lignes_();
  const vue = function (l) {
    const a = JSON.parse(l.json || '{}');
    return {
      id: l.id, date_lot: String(l.date_lot).slice(0, 10), statut: l.statut, entreprise: l.entreprise, domaine: l.domaine,
      personne: l.prenom + ' ' + l.nom, poste_personne: l.poste_personne, email: l.email, canal: String(l.canal),
      priorite: l.priorite, intitule: l.intitule, score: l.score, signal: a.signal || '', probleme: a.probleme || '',
      sources: a.sources || [], objet: l.objet, corps: l.corps, relance: l.relance, linkedin_url: l.linkedin_url,
      linkedin_note: l.linkedin_note, linkedin_message: String(l.linkedin_message || '').replace(Regles.BALISE_PORTFOLIO, url || '[lien portfolio]'),
      linkedin_statut: l.linkedin_statut, erreurs: l.erreurs_code, envoi_prevu: l.envoi_prevu ? hhmm_(new Date(l.envoi_prevu)) : '',
      remarques: (a.censeur || {}).remarques || '', url_offre: l.url_offre || '',
      message_candidature: String(l.corps || '').replace(Regles.BALISE_PORTFOLIO, url || '[lien portfolio]'),
    };
  };
  const aujourdhui = jour_();
  return {
    mode: prop_('MODE', 'simulation'), portfolioConfigure: /^https:\/\//.test(url),
    aValider: ls.filter(function (l) { return l.statut === 'a_valider'; }).map(vue),
    bloquees: ls.filter(function (l) { return l.statut === 'refusee_code' && String(l.date_lot).slice(0, 10) === aujourdhui; }).map(vue),
    planifiees: ls.filter(function (l) { return ['validee', 'planifiee'].indexOf(l.statut) >= 0; }).map(vue),
    candidatures: ls.filter(function (l) { return String(l.canal).indexOf('candidature') >= 0 && ['validee', 'planifiee', 'envoyee', 'linkedin_seul'].indexOf(l.statut) >= 0 && l.candidature_statut !== 'deposee'; }).map(vue),
    linkedin: ls.filter(function (l) { return String(l.canal).indexOf('linkedin') >= 0 && ['validee', 'planifiee', 'envoyee', 'linkedin_seul'].indexOf(l.statut) >= 0 && l.linkedin_statut !== 'message'; }).map(vue),
  };
}

function trouver_(id) {
  const l = lignes_().filter(function (x) { return x.id === id; })[0];
  if (!l) throw new Error('Approche introuvable : ' + id);
  return l;
}

function valider(id) {
  const l = trouver_(id);
  if (l.statut !== 'a_valider') throw new Error('Cette approche n\'est plus à valider (' + l.statut + ').');
  const emailPrevu = String(l.canal).indexOf('email') >= 0;
  maj_(l._ligne, { statut: emailPrevu ? 'validee' : 'linkedin_seul' });
  journal_('info', 'validée par Hugo', id);
  return donneesPage();
}

function toutValider() {
  lignes_().filter(function (l) { return l.statut === 'a_valider'; }).forEach(function (l) {
    maj_(l._ligne, { statut: String(l.canal).indexOf('email') >= 0 ? 'validee' : 'linkedin_seul' });
  });
  journal_('info', 'tout validé par Hugo', '');
  return donneesPage();
}

function rejeter(id, motif) {
  const l = trouver_(id);
  maj_(l._ligne, { statut: 'rejetee', motif_rejet_hugo: motif || 'sans motif' });
  journal_('info', 'rejetée par Hugo', id + ' : ' + motif);
  return donneesPage();
}

/** Hugo modifie un texte : les garde-fous sont relancés sur la nouvelle version. */
function modifier(id, champs) {
  const l = trouver_(id);
  if (['a_valider', 'validee', 'planifiee'].indexOf(l.statut) < 0) throw new Error('Approche déjà envoyée ou fermée.');
  const permis = ['objet', 'corps', 'relance', 'linkedin_message'];
  const nouveau = Object.assign({}, l);
  permis.forEach(function (k) { if (champs[k] !== undefined) nouveau[k] = champs[k]; });
  const { ctx } = contexte_(id);
  const err = Regles.validerApproche(approcheDeLigne_(nouveau), ctx);
  if (err.length) return { erreurs: err };
  const maj = { modifie_par_hugo: 'oui' };
  permis.forEach(function (k) { if (champs[k] !== undefined) maj[k] = champs[k]; });
  maj_(l._ligne, maj);
  journal_('info', 'modifiée par Hugo', id);
  return donneesPage();
}

function linkedinFait(id, etape) {
  const l = trouver_(id);
  const champs = { linkedin_statut: etape === 'message' ? 'message' : 'invitation' };
  // Un contact LinkedIn compte comme une approche (délai de 6 mois).
  if (!l.envoye_le && String(l.canal).indexOf('email') < 0) champs.envoye_le = iso_(new Date());
  maj_(l._ligne, champs);
  return donneesPage();
}

/** Hugo a déposé la candidature sur la page de l'offre. */
function candidatureDeposee(id) {
  const l = trouver_(id);
  const champs = { candidature_statut: 'deposee' };
  if (!l.envoye_le && String(l.canal).indexOf('email') < 0) champs.envoye_le = iso_(new Date());
  maj_(l._ligne, champs);
  journal_('info', 'candidature déposée', id);
  return donneesPage();
}

// ---------- Planification et envoi ----------

function planifier_(maintenant) {
  const conf = config_(), aujourdhui = jour_(maintenant), em = conf.emails || {};
  const fen = em.fenetres || [['10:10', '12:00'], ['14:00', '17:00']];
  const ls = lignes_();
  // Ce qui était prévu un jour précédent et n'est pas parti revient en file.
  ls.forEach(function (l) {
    if (l.statut === 'planifiee' && l.envoi_prevu && jour_(new Date(l.envoi_prevu)) < aujourdhui) { maj_(l._ligne, { statut: 'validee', envoi_prevu: '' }); l.statut = 'validee'; l.envoi_prevu = ''; }
    if (l.relance_prevue && !l.relance_envoyee_le && jour_(new Date(l.relance_prevue)) < aujourdhui) { maj_(l._ligne, { relance_prevue: '' }); l.relance_prevue = ''; }
  });
  const duJour = function (v) { return estDuJour_(v, aujourdhui); };
  const premiersDuJour = ls.filter(function (l) { return duJour(l.envoye_le) || (l.statut === 'planifiee' && duJour(l.envoi_prevu)); }).length;
  const relancesDuJour = ls.filter(function (l) { return duJour(l.relance_envoyee_le) || (duJour(l.relance_prevue) && !l.relance_envoyee_le); }).length;
  const resteTotal = Regles.plafondEmails(conf) - premiersDuJour - relancesDuJour;
  if (resteTotal <= 0) return;

  const relances = (conf.relance || {}).active ? ls.filter(function (l) {
    return l.statut === 'envoyee' && l.thread_id && l.relance && !l.relance_prevue && !l.relance_envoyee_le && !l.reponse_classe &&
      l.envoye_le && Regles.joursOuvresEntre(new Date(l.envoye_le), maintenant) >= ((conf.relance || {}).jours_ouvres || 6);
  }) : [];
  const resteP = Math.max(0, Regles.plafondPremiers(conf, maintenant) - premiersDuJour);
  const premiers = ls.filter(function (l) { return l.statut === 'validee' && String(l.canal).indexOf('email') >= 0; })
    .sort(function (a, b) { return String(a.date_lot) < String(b.date_lot) ? -1 : String(a.date_lot) > String(b.date_lot) ? 1 : b.score - a.score; })
    .slice(0, resteP);
  const aCaser = relances.map(function (l) { return { l: l, relance: true }; }).concat(premiers.map(function (l) { return { l: l, relance: false }; })).slice(0, resteTotal);
  if (!aCaser.length) return;

  const prevus = ls.map(function (l) { return [l.envoi_prevu, l.envoye_le, l.relance_prevue, l.relance_envoyee_le]; })
    .reduce(function (a, b) { return a.concat(b); }, []).filter(duJour).map(function (v) { return new Date(v); });
  const dernier = prevus.length ? new Date(Math.max.apply(null, prevus)) : null;
  const heures = Regles.creneaux(aCaser.length, maintenant, fen, em.ecart_min || 12, em.ecart_max || 45, dernier);
  heures.forEach(function (h, i) {
    const x = aCaser[i];
    if (x.relance) maj_(x.l._ligne, { relance_prevue: iso_(h) });
    else maj_(x.l._ligne, { statut: 'planifiee', envoi_prevu: iso_(h) });
  });
  if (heures.length < aCaser.length) journal_('info', 'report', (aCaser.length - heures.length) + ' envoi(s) reporté(s) au prochain jour ouvré');
}

/** Envoie AU PLUS un message par passage : l'espacement est garanti même si le planning dérape. */
function envoyerUn_(maintenant) {
  const conf = config_(), fen = (conf.emails || {}).fenetres || [['10:10', '12:00'], ['14:00', '17:00']];
  if (!Regles.dansFenetres(maintenant, fen)) return;
  const ls = lignes_();
  const relance = ls.filter(function (l) { return l.relance_prevue && !l.relance_envoyee_le && !l.reponse_classe && new Date(l.relance_prevue) <= maintenant; })[0];
  if (relance) return envoyerRelance_(relance, conf);
  const l = ls.filter(function (x) { return x.statut === 'planifiee' && x.envoi_prevu && new Date(x.envoi_prevu) <= maintenant; })
    .sort(function (a, b) { return new Date(a.envoi_prevu) - new Date(b.envoi_prevu); })[0];
  if (l) envoyerPremier_(l, conf);
}

function envoyerPremier_(l, conf) {
  // En simulation, un portfolio pas encore en ligne ne bloque pas le test :
  // une balise visible le remplace. En réel, son absence bloque tout envoi.
  const url = urlPortfolio_(conf) || (modeReel_() ? '' : 'https://[lien-du-portfolio-a-configurer]');
  const { ctx } = contexte_(l.id);
  ctx.urlPortfolio = url;
  const a = approcheDeLigne_(l);
  const err = Regles.validerApproche(a, ctx);
  if (err.length) {
    maj_(l._ligne, { statut: 'refusee_code', erreurs_code: err.join(' ; ') });
    journal_('alerte', 'envoi bloqué', l.id + ' : ' + err.join(' ; '));
    notifier_({ titre: '🛑 Envoi bloqué : ' + l.entreprise, texte: 'Les garde-fous ont arrêté cet email juste avant l\'envoi :\n' + err.slice(0, 8).map(function (x) { return '• ' + x; }).join('\n'), couleur: COULEUR.erreur });
    return;
  }
  const texte = Regles.texteFinal(a.message.corps, url, SIGNATURE);
  const maintenant = new Date();
  if (!modeReel_()) {
    maj_(l._ligne, { statut: 'envoyee', envoye_le: iso_(maintenant), thread_id: 'simulation' });
    journal_('simulation', 'envoi simulé', l.email + ' | ' + a.message.objet + '\n\n' + texte);
    return;
  }
  const brouillon = GmailApp.createDraft(l.email, a.message.objet, texte, { name: 'Hugo Volle' });
  const msg = brouillon.send();
  maj_(l._ligne, { statut: 'envoyee', envoye_le: iso_(maintenant), thread_id: msg.getThread().getId(), message_id: msg.getHeader('Message-ID') || '' });
  if (!prop_('DATE_DEBUT', '')) setProp_('DATE_DEBUT', jour_(maintenant));
  journal_('info', 'envoyé', l.id + ' → ' + l.email);
}

function encoderEntete_(s) { return '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?='; }

function envoyerRelance_(l, conf) {
  const maintenant = new Date();
  const motifs = Regles.chercherMotifs(l.relance);
  if (motifs.length || Regles.estDansListe(l.email, l.domaine, contexte_(l.id).ctx.listeNoire)) {
    maj_(l._ligne, { relance_envoyee_le: 'bloquee' });
    journal_('alerte', 'relance bloquée', l.id + ' ' + motifs.join(', '));
    return;
  }
  const texte = String(l.relance).trim() + '\n\n' + SIGNATURE;
  if (!modeReel_() || l.thread_id === 'simulation') {
    maj_(l._ligne, { relance_envoyee_le: iso_(maintenant) });
    journal_('simulation', 'relance simulée', l.email + '\n\n' + texte);
    return;
  }
  // Dernière vérification : personne n'a répondu dans le fil entre-temps.
  const fil = GmailApp.getThreadById(l.thread_id), moi = Session.getEffectiveUser().getEmail().toLowerCase();
  if (fil.getMessages().some(function (m) { return m.getFrom().toLowerCase().indexOf(moi) < 0; })) {
    maj_(l._ligne, { relance_envoyee_le: 'annulee_reponse' });
    return;
  }
  const entetes = ['To: ' + l.email, 'Subject: ' + encoderEntete_('Re: ' + l.objet)];
  if (l.message_id) entetes.push('In-Reply-To: ' + l.message_id, 'References: ' + l.message_id);
  entetes.push('MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64');
  const brut = entetes.join('\r\n') + '\r\n\r\n' + Utilities.base64Encode(texte, Utilities.Charset.UTF_8);
  Gmail.Users.Messages.send({ raw: Utilities.base64EncodeWebSafe(brut, Utilities.Charset.UTF_8), threadId: l.thread_id }, 'me');
  maj_(l._ligne, { relance_envoyee_le: iso_(maintenant) });
  journal_('info', 'relance envoyée', l.id + ' → ' + l.email);
}

// ---------- Réponses ----------

function releverReponses_() {
  if (!modeReel_()) return;
  const moi = Session.getEffectiveUser().getEmail().toLowerCase();
  const limite = Date.now() - 60 * 86400000;
  const ls = lignes_().filter(function (l) { return l.statut === 'envoyee' && l.thread_id && l.thread_id !== 'simulation' && !l.reponse_classe && new Date(l.envoye_le).getTime() > limite; });
  ls.forEach(function (l) {
    const msgs = GmailApp.getThreadById(l.thread_id).getMessages();
    const reponse = msgs.filter(function (m) { return m.getFrom().toLowerCase().indexOf(moi) < 0; })[0];
    if (!reponse) return;
    const corps = reponse.getPlainBody() || '';
    const classe = Regles.classerReponse(corps, reponse.getSubject());
    if (classe === 'auto') return; // une absence n'est pas une réponse : la relance reste possible
    const extrait = Regles.sansCitation(corps).slice(0, 500);
    maj_(l._ligne, { statut: 'repondu', reponse_classe: classe, reponse_le: iso_(reponse.getDate()) });
    feuille_(ONGLET.reponses).appendRow([iso_(reponse.getDate()), l.id, l.entreprise, l.email, classe, extrait]);
    if (classe === 'stop') { ajouterListeNoire_(l.email, 'opposition'); ajouterListeNoire_(l.domaine, 'opposition'); }
    if (classe === 'refus') ajouterListeNoire_(l.domaine, 'refus');
    const style = {
      positif: { t: '🔥 Réponse positive', c: COULEUR.chaud },
      a_lire: { t: '📩 Nouvelle réponse', c: COULEUR.info },
      refus: { t: '🙅 Refus', c: COULEUR.neutre },
      stop: { t: '⛔ Demande de ne plus être contacté', c: COULEUR.erreur },
    }[classe] || { t: '📩 Nouvelle réponse', c: COULEUR.info };
    const fil = 'https://mail.google.com/mail/u/0/#inbox/' + l.thread_id;
    notifier_({ titre: style.t + ' — ' + l.prenom + ' ' + l.nom + ' (' + l.entreprise + ')', lien: fil, couleur: style.c,
      texte: '> ' + coupe_(extrait, 700).replace(/\n/g, '\n> ') + '\n\n' + (classe === 'positif' || classe === 'a_lire' ? '**[Répondre depuis Gmail](' + fil + ')** : c\'est à toi de jouer.' : (classe === 'stop' ? 'Ajouté à la liste noire, plus jamais recontacté.' : 'Entreprise ajoutée à la liste noire. Pas de relance.')) });
  });
  // Rebonds : adresses invalides.
  GmailApp.search('from:(mailer-daemon OR postmaster) newer_than:3d', 0, 20).forEach(function (t) {
    const texte = t.getMessages().map(function (m) { return m.getPlainBody(); }).join('\n').toLowerCase();
    lignes_().filter(function (l) { return l.statut === 'envoyee' && l.email && texte.indexOf(String(l.email).toLowerCase()) >= 0; }).forEach(function (l) {
      maj_(l._ligne, { statut: 'invalide', reponse_classe: 'rebond' });
      notifier_({ titre: '↩️ Adresse invalide', texte: l.email + ' (' + l.entreprise + ') a rebondi. L\'analyste en tiendra compte.', couleur: COULEUR.attention });
    });
  });
}

// ---------- Bilans et export ----------

function bilanDuJour_(j) {
  const ls = lignes_();
  const duJour = function (v) { return estDuJour_(v, j); };
  const envoyes = ls.filter(function (l) { return duJour(l.envoye_le); }).length;
  const relances = ls.filter(function (l) { return duJour(l.relance_envoyee_le); }).length;
  const reponses = ls.filter(function (l) { return duJour(l.reponse_le); });
  const attente = ls.filter(function (l) { return l.statut === 'a_valider'; }).length;
  const reportes = ls.filter(function (l) { return l.statut === 'validee'; }).length;
  const bloques = ls.filter(function (l) { return l.statut === 'refusee_code' && String(l.date_lot).slice(0, 10) === j; }).length;
  const actif = function (l) { return ['validee', 'planifiee', 'envoyee', 'linkedin_seul'].indexOf(l.statut) >= 0; };
  const li = ls.filter(function (l) { return actif(l) && ((String(l.canal).indexOf('linkedin') >= 0 && l.linkedin_statut !== 'message') || (String(l.canal).indexOf('candidature') >= 0 && l.candidature_statut !== 'deposee')); }).length;
  const total = ls.filter(function (l) { return l.envoye_le; }).length;
  const positifs = ls.filter(function (l) { return l.reponse_classe === 'positif'; }).length;
  const lien = urlPage_();
  const aFaire = attente + li;
  notifier_({ titre: '📊 Bilan du ' + dateLongue_(j), couleur: aFaire ? COULEUR.attention : COULEUR.succes, lien: lien || undefined,
    texte: aFaire ? '**Il te reste ' + aFaire + ' action' + (aFaire > 1 ? 's' : '') + '.**' + (lien ? ' [Ouvrir ma page](' + lien + ')' : '') : 'Rien en attente de ton côté.',
    champs: [
      { nom: 'Envoyés', valeur: String(envoyes), ligne: true },
      { nom: 'Relances', valeur: String(relances), ligne: true },
      { nom: 'Réponses', valeur: String(reponses.length), ligne: true },
      { nom: 'À valider', valeur: String(attente), ligne: true },
      { nom: 'Actions à la main', valeur: String(li), ligne: true },
      { nom: 'Reportés à demain', valeur: String(reportes), ligne: true },
    ].concat(bloques ? [{ nom: 'Bloqués par les garde-fous', valeur: String(bloques) }] : []),
    pied: 'Depuis le début : ' + total + ' approche(s), ' + positifs + ' réponse(s) positive(s)' });
}

function exporterSuivi_() {
  if (!prop_('GITHUB_DEPOT', '')) return;
  const ls = lignes_();
  const suivi = {
    genere_le: iso_(new Date()), mode: prop_('MODE', 'simulation'),
    contacts: ls.filter(function (l) { return l.envoye_le && l.thread_id !== 'simulation'; }).map(function (l) {
      return { id: l.id, domaine: l.domaine, email: l.email, date: jour_(new Date(l.envoye_le)), priorite: l.priorite, canal: l.canal, relance: !isNaN(new Date(l.relance_envoyee_le || 'x').getTime()), reponse: l.reponse_classe || null };
    }),
    approches: ls.map(function (l) {
      const a = JSON.parse(l.json || '{}');
      return { id: l.id, date_lot: String(l.date_lot).slice(0, 10), statut: l.statut, priorite: l.priorite, signal: a.signal || '', preuves: a.preuves || [], version_preuves: a.version_preuves || '', modifie_par_hugo: l.modifie_par_hugo === 'oui', motif_rejet_hugo: l.motif_rejet_hugo || null, erreurs_code: l.erreurs_code || null, reponse: l.reponse_classe || null };
    }),
    liste_noire_ajouts: feuille_(ONGLET.listeNoire).getDataRange().getValues().slice(1).map(function (r) { return { valeur: r[0], motif: r[1], date: r[2] }; }),
  };
  ecrireDepot_('data/suivi_export.json', 'lots', JSON.stringify(suivi, null, 2), 'Suivi du ' + jour_());
}

function publierBilanHebdo_(maintenant) {
  const dimanche = new Date(maintenant.getTime() - 86400000);
  const txt = lireDepot_('data/bilans/' + jour_(dimanche) + '.md', 'lots');
  if (txt) notifier_({ titre: '🗓️ Bilan de la semaine', texte: coupe_(txt, 3800), couleur: COULEUR.info });
}
