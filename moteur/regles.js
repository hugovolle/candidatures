/**
 * Garde-fous de la recherche de poste — code partagé.
 *
 * Ce fichier est la SEULE implémentation des règles vérifiables du système.
 * Il tourne à deux endroits, à l'identique :
 *   - dans Google Apps Script (l'expéditeur), avant chaque envoi ;
 *   - dans Node (`moteur/controle_lot.js`), lancé par la routine du matin
 *     avant d'écrire le lot.
 * Une règle ajoutée ici s'applique donc des deux côtés. Les règles de
 * jugement (qualité, pertinence) restent aux agents ; ici, uniquement ce
 * qu'un programme peut trancher sans se tromper.
 *
 * Aucune dépendance : JavaScript standard, compatible Apps Script V8.
 */
const Regles = (function () {
  // Plafonds durs : jamais dépassés, quoi que disent config/quotas.toml ou le lot.
  const PLAFOND_DUR_EMAILS_JOUR = 10;
  const PLAFOND_DUR_PREMIERS_JOUR = 8;

  const PHRASE_OPPOSITION = 'si le sujet ne vous concerne pas, dites-le-moi et je ne vous reecrirai pas';
  const BALISE_PORTFOLIO = '{{PORTFOLIO}}';

  // Section 4 de regles/exclusions.md. Comparés sur le texte normalisé
  // (minuscules, sans accents).
  const MOTIFS_INTERDITS = [
    'camden', 'distilleurs', 'duvel', 'moortgat', 'mont-blanc', 'mont blanc',
    'petzl', 'father & sons', 'father and sons', 'notre equipe', 'notre agence',
  ];
  // Contrôlés à part car ils ne survivent pas à la normalisation ou
  // demandent une frontière de mot.
  const CARACTERES_INTERDITS = { '—': 'tiret cadratin (—)', '–': 'demi-cadratin (–)' };
  const MOT_NOUS = /(^|[^a-z])nous([^a-z]|$)/;

  const FORMULES_BANNIES = [
    'candidature spontanee', 'je me permets', "n'hesitez pas", 'n’hesitez pas',
    'passionne', 'je serais ravi', 'valeur ajoutee', 'dans l\'attente de votre retour',
    'dans l’attente de votre retour', 'je pense pouvoir apporter', 'fort de ',
    'riche de mon experience', 'votre travail m\'inspire', 'votre travail m’inspire',
  ];

  const CHAMPS_OBLIGATOIRES = [
    'id', 'entreprise', 'domaine', 'personne', 'canal', 'poste', 'score',
    'preuves', 'version_preuves', 'verification_exclusions', 'sources', 'message', 'censeur',
  ];

  function normaliser(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function compterMots(s) {
    return String(s || '').replace(/\{\{PORTFOLIO\}\}/g, ' ')
      .split(/\s+/).filter(function (m) { return /[\p{L}\p{N}]/u.test(m); }).length;
  }

  function domaineDe(email) {
    const m = /^[^@\s]+@([^@\s]+)$/.exec(String(email || '').trim().toLowerCase());
    return m ? m[1] : null;
  }

  /** Lit une liste (liste noire, déjà contactés) : une entrée par ligne, # = commentaire. */
  function lireListe(texte) {
    return String(texte || '').split('\n')
      .map(function (l) { return l.replace(/#.*/, '').trim().toLowerCase(); })
      .filter(function (l) { return l.length > 0; });
  }

  /** Vrai si l'email ou son domaine (ou un domaine parent) figure dans la liste. */
  function estDansListe(email, domaine, liste) {
    const e = String(email || '').toLowerCase();
    const d = String(domaine || domaineDe(e) || '').toLowerCase();
    const ens = new Set(liste);
    if (e && ens.has(e)) return true;
    const morceaux = d.split('.');
    for (let i = 0; i < morceaux.length - 1; i++) {
      if (ens.has(morceaux.slice(i).join('.'))) return true;
    }
    return false;
  }

  /** Motifs interdits trouvés dans un texte. Renvoie une liste de libellés. */
  function chercherMotifs(texte) {
    const trouves = [];
    const brut = String(texte || '');
    for (const c in CARACTERES_INTERDITS) if (brut.indexOf(c) >= 0) trouves.push(CARACTERES_INTERDITS[c]);
    const n = normaliser(brut);
    for (const m of MOTIFS_INTERDITS) if (n.indexOf(m) >= 0) trouves.push('« ' + m + ' »');
    if (MOT_NOUS.test(n)) trouves.push('« nous »');
    for (const f of FORMULES_BANNIES) if (n.indexOf(normaliser(f)) >= 0) trouves.push('formule bannie « ' + f.trim() + ' »');
    return trouves;
  }

  function moisEntre(dateIso, aujourdhui) {
    const d = new Date(dateIso + 'T12:00:00');
    return (aujourdhui.getTime() - d.getTime()) / (1000 * 3600 * 24 * 30.44);
  }

  /**
   * Vérifie une approche. Renvoie la liste des erreurs (vide = conforme).
   * ctx = {
   *   listeNoire: [...], dejaContactes: [...],
   *   contacts: { 'domaine.fr': 'AAAA-MM-JJ' },   // dernier contact connu
   *   aujourdhui: Date, delaiMois: 6,
   *   scoreMinimum: 65, noteMinimum: 8, relanceActive: true,
   *   urlPortfolio: '...' (optionnel côté routine, obligatoire côté envoi)
   * }
   */
  function validerApproche(a, ctx) {
    const err = [];
    ctx = ctx || {};
    if (!a || typeof a !== 'object') return ['approche illisible'];
    for (const c of CHAMPS_OBLIGATOIRES) {
      if (a[c] === undefined || a[c] === null || a[c] === '') err.push('champ manquant : ' + c);
    }
    if (err.length) return err;

    const canal = Array.isArray(a.canal) ? a.canal : [];
    const parEmail = canal.indexOf('email') >= 0;
    const parCandidature = canal.indexOf('candidature') >= 0;
    const parLinkedin = canal.indexOf('linkedin') >= 0;
    if (!parEmail && !parCandidature && !parLinkedin) err.push('aucun canal valide (email, candidature ou linkedin)');
    const msg = a.message || {};

    // Destinataire
    // Exception de la règle rouge n°5 : une candidature sur une offre publiée
    // n'a pas besoin d'un destinataire nommé (le formulaire de l'offre suffit).
    if ((parEmail || parLinkedin) && (!a.personne.prenom || !a.personne.nom)) err.push('personne non nommée (règle rouge n°5)');
    if (parEmail) {
      const dom = domaineDe(a.email);
      if (!dom) err.push('adresse email invalide : ' + a.email);
      else if (dom !== String(a.domaine).toLowerCase()) err.push('le domaine de l\'email (' + dom + ') ne correspond pas au domaine de l\'entreprise (' + a.domaine + ')');
      if (['verifiee', 'deduite'].indexOf(a.statut_email) < 0) err.push('statut_email doit être « verifiee » ou « deduite » pour un envoi par email');
      if (a.statut_email === 'deduite' && !a.preuve_email) err.push('adresse déduite sans preuve du format (règle CNIL)');
      if (/^(contact|info|hello|bonjour|jobs|job|rh|hr|recrutement|careers|carrieres|team|admin|support)@/i.test(String(a.email || ''))) err.push('adresse générique interdite en approche directe (règle rouge n°5)');
    }

    // Exclusions
    const cible = [a.entreprise, a.domaine, a.email, a.personne.poste].join(' ');
    const motifsCible = chercherMotifs(cible).filter(function (m) { return m.indexOf('formule') < 0 && m.indexOf('nous') < 0; });
    if (motifsCible.length) err.push('cible exclue : ' + motifsCible.join(', '));
    if (estDansListe(a.email, a.domaine, ctx.listeNoire || [])) err.push('domaine ou adresse en liste noire');
    if (estDansListe(a.email, a.domaine, ctx.dejaContactes || [])) err.push('domaine déjà démarché en freelance : accord de Hugo nécessaire');
    const dernier = (ctx.contacts || {})[String(a.domaine).toLowerCase()];
    if (dernier && ctx.aujourdhui && moisEntre(dernier, ctx.aujourdhui) < (ctx.delaiMois || 6)) err.push('entreprise déjà contactée le ' + dernier + ' (moins de ' + (ctx.delaiMois || 6) + ' mois)');
    if (String(a.verification_exclusions).trim().length < 20) err.push('vérification des exclusions absente ou trop vague');

    // Décisions des agents
    if (!Array.isArray(a.sources) || a.sources.filter(function (s) { return /^https?:\/\//.test(s); }).length === 0) err.push('aucune source (règle rouge n°4)');
    if (typeof a.score !== 'number' || a.score < (ctx.scoreMinimum || 65)) err.push('score sous le seuil (' + a.score + ')');
    if (['A', 'B', 'C', 'D'].indexOf(a.poste) < 0) err.push('priorité de poste invalide : ' + a.poste);
    if (['stricte', 'secteur'].indexOf(a.version_preuves) < 0) err.push('version_preuves invalide');
    const c = a.censeur || {};
    if (c.decision !== 'valide') err.push('le censeur n\'a pas validé');
    if (typeof c.note !== 'number' || c.note < (ctx.noteMinimum || 8)) err.push('note du censeur sous le seuil (' + c.note + ')');
    if (c.eliminatoire !== 'ok') err.push('contrôle éliminatoire du censeur non passé');

    // Textes
    const textes = { objet: msg.objet, corps: msg.corps, relance: msg.relance, linkedin_note: msg.linkedin_note, linkedin_message: msg.linkedin_message };
    for (const k in textes) {
      if (!textes[k]) continue;
      const m = chercherMotifs(textes[k]);
      if (m.length) err.push(k + ' : ' + m.join(', '));
    }
    if (parEmail) {
      const nObjet = compterMots(msg.objet);
      if (nObjet < 3 || nObjet > 6) err.push('objet de ' + nObjet + ' mots (3 à 6 attendus)');
      const nCorps = compterMots(msg.corps);
      if (nCorps < 80 || nCorps > 130) err.push('corps de ' + nCorps + ' mots (80 à 130 attendus)');
      const corps = String(msg.corps || '');
      const nBalises = corps.split(BALISE_PORTFOLIO).length - 1;
      if (nBalises !== 1) err.push('le corps doit contenir {{PORTFOLIO}} exactement une fois (trouvé ' + nBalises + ')');
      if (/https?:\/\/|www\./i.test(corps)) err.push('aucune adresse web en clair dans le corps : utiliser {{PORTFOLIO}}');
      if (normaliser(corps).replace(/[’']/g, "'").indexOf(PHRASE_OPPOSITION) < 0) err.push('phrase d\'opposition absente ou modifiée');
      if (ctx.relanceActive && msg.relance) {
        const nRel = compterMots(msg.relance);
        if (nRel > 70) err.push('relance trop longue (' + nRel + ' mots)');
        if (/https?:\/\/|www\./i.test(msg.relance)) err.push('aucune adresse web dans la relance');
      }
    }
    if (parCandidature) {
      if (!/^https:\/\//.test(String(a.url_offre || ''))) err.push('url_offre manquante ou invalide pour une candidature');
      if (!parEmail) {
        const nC = compterMots(msg.corps);
        if (nC < 60 || nC > 150) err.push('message de candidature de ' + nC + ' mots (60 à 150 attendus)');
        const nB = String(msg.corps || '').split(BALISE_PORTFOLIO).length - 1;
        if (nB !== 1) err.push('le message de candidature doit contenir {{PORTFOLIO}} exactement une fois');
        if (/https?:\/\/|www\./i.test(String(msg.corps || ''))) err.push('aucune adresse web en clair dans le message : utiliser {{PORTFOLIO}}');
      }
    }
    if (msg.linkedin_note && String(msg.linkedin_note).length > 200) err.push('note LinkedIn de plus de 200 caractères');
    if (canal.indexOf('linkedin') >= 0) {
      if (!a.personne.linkedin || !/^https:\/\/([a-z]+\.)?linkedin\.com\//.test(a.personne.linkedin)) err.push('profil LinkedIn absent ou invalide');
      if (msg.linkedin_message) {
        const nL = compterMots(msg.linkedin_message);
        if (nL < 40 || nL > 90) err.push('message LinkedIn de ' + nL + ' mots (50 à 80 attendus)');
      }
    }
    if (ctx.urlPortfolio !== undefined && !/^https:\/\//.test(String(ctx.urlPortfolio || ''))) err.push('lien du portfolio non configuré : aucun envoi possible');
    return err;
  }

  /** Vérifie un lot entier. Renvoie { erreursLot, approches: [{id, erreurs}] }. */
  function validerLot(lot, ctx) {
    const erreursLot = [];
    if (!lot || typeof lot !== 'object') return { erreursLot: ['lot illisible'], approches: [] };
    if (lot.version_format !== 1) erreursLot.push('version_format inattendue : ' + lot.version_format);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(lot.date))) erreursLot.push('date du lot invalide');
    if (!Array.isArray(lot.approches)) erreursLot.push('« approches » doit être une liste');
    const vus = { id: {}, domaine: {} };
    const res = [];
    for (const a of (lot.approches || [])) {
      const e = validerApproche(a, ctx);
      const d = String((a && a.domaine) || '').toLowerCase();
      if (a && vus.id[a.id]) e.push('id en double dans le lot');
      if (d && vus.domaine[d]) e.push('deux approches vers la même entreprise dans le lot (règle rouge n°8)');
      if (a) { vus.id[a.id] = true; vus.domaine[d] = true; }
      res.push({ id: a && a.id, entreprise: a && a.entreprise, erreurs: e });
    }
    return { erreursLot: erreursLot, approches: res };
  }

  // ---------- Calendrier ----------

  function paques(annee) {
    // Algorithme de Meeus/Jones/Butcher.
    const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(annee, mois - 1, jour, 12);
  }

  function cle(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function joursFeries(annee) {
    const p = paques(annee);
    const decale = function (n) { const d = new Date(p); d.setDate(d.getDate() + n); return cle(d); };
    return new Set([
      annee + '-01-01', decale(1), annee + '-05-01', annee + '-05-08', decale(39), decale(50),
      annee + '-07-14', annee + '-08-15', annee + '-11-01', annee + '-11-11', annee + '-12-25',
    ]);
  }

  function estJourOuvre(d) {
    const j = d.getDay();
    if (j === 0 || j === 6) return false;
    return !joursFeries(d.getFullYear()).has(cle(d));
  }

  /** Nombre de jours ouvrés strictement après `depuis` et jusqu'à `jusqua` inclus. */
  function joursOuvresEntre(depuis, jusqua) {
    const d = new Date(depuis.getFullYear(), depuis.getMonth(), depuis.getDate(), 12);
    const fin = new Date(jusqua.getFullYear(), jusqua.getMonth(), jusqua.getDate(), 12);
    let n = 0;
    while (d < fin) { d.setDate(d.getDate() + 1); if (estJourOuvre(d)) n++; }
    return n;
  }

  function aHeure(jour, hhmm) {
    const p = String(hhmm).split(':');
    return new Date(jour.getFullYear(), jour.getMonth(), jour.getDate(), Number(p[0]), Number(p[1] || 0), 0);
  }

  function dansFenetres(t, fenetres) {
    return fenetres.some(function (f) { return t >= aHeure(t, f[0]) && t < aHeure(t, f[1]); });
  }

  /**
   * Tire `n` heures d'envoi pour la journée de `maintenant`, dans les fenêtres,
   * espacées aléatoirement de ecartMin à ecartMax minutes, après `apres`
   * (dernier envoi prévu ou fait). Renvoie moins de `n` heures si la journée
   * est trop avancée : le reste est reporté au lendemain par l'appelant.
   */
  function creneaux(n, maintenant, fenetres, ecartMin, ecartMax, apres, alea) {
    alea = alea || Math.random;
    const tirage = function (a, b) { return a + Math.floor(alea() * (b - a + 1)); };
    const res = [];
    let curseur = new Date(Math.max(maintenant.getTime(), apres ? apres.getTime() + ecartMin * 60000 : 0));
    curseur = new Date(curseur.getTime() + tirage(2, 9) * 60000);
    for (let k = 0; k < n; k++) {
      if (!dansFenetres(curseur, fenetres)) {
        const suivante = fenetres.map(function (f) { return aHeure(curseur, f[0]); }).filter(function (d) { return d > curseur; })[0];
        if (!suivante) break;
        curseur = new Date(suivante.getTime() + tirage(0, 9) * 60000);
        if (!dansFenetres(curseur, fenetres)) break;
      }
      res.push(new Date(curseur));
      curseur = new Date(curseur.getTime() + tirage(ecartMin, ecartMax) * 60000);
    }
    return res;
  }

  /** Plafond de premiers contacts du jour, montée en charge comprise. */
  function plafondPremiers(config, aujourdhui) {
    const lot = (config.lot || {}).approches_par_jour || 5;
    const mc = config.montee_en_charge || {};
    let p = lot;
    if (!mc.date_debut) p = mc.semaine_1 || lot;
    else {
      const jours = (aujourdhui.getTime() - new Date(mc.date_debut + 'T00:00:00').getTime()) / 86400000;
      if (jours < 7) p = mc.semaine_1 || lot;
      else if (jours < 14) p = mc.semaine_2 || lot;
    }
    return Math.min(p, PLAFOND_DUR_PREMIERS_JOUR);
  }

  function plafondEmails(config) {
    return Math.min((config.emails || {}).max_par_jour || 8, PLAFOND_DUR_EMAILS_JOUR);
  }

  // ---------- Réponses ----------

  /** Coupe le texte cité (« Le … a écrit : », lignes « > », en-têtes de transfert). */
  function sansCitation(texte) {
    const lignes = String(texte || '').split(/\r?\n/);
    const out = [];
    for (const l of lignes) {
      const t = l.trim();
      if (/^>/.test(t)) break;
      if (/^(le|on)\s.+(a\s+[ée]crit|wrote)\s*:?\s*$/i.test(t)) break;
      if (/^-{2,}\s*(message d'origine|original message|forwarded)/i.test(t)) break;
      if (/^(de|from)\s*:\s/i.test(t) && out.length) break;
      out.push(l);
    }
    return out.join('\n').trim();
  }

  const MOTS = {
    stop: ['ne plus me contacter', 'ne plus etre contacte', 'desinscri', 'unsubscribe', 'retirez-moi', 'retirez moi', 'supprimez mes', 'ne m\'ecrivez plus', 'plus de mails', 'stop'],
    auto: ['absent du bureau', 'actuellement absent', 'out of office', 'en conges', 'message automatique', 'reponse automatique', 'automatic reply', 'accuse de reception', 'je suis absent'],
    refus: ['pas de besoin', 'pas de poste', 'pas d\'ouverture', 'pas de recrutement', 'ne recrutons pas', 'ne donnerons pas suite', 'pas a l\'ordre du jour', 'not hiring', 'no openings', 'pas interesse', 'ne sommes pas interesses'],
    positif: ['echang', 'un appel', 'call', 'disponible', 'rendez-vous', 'rdv', 'entretien', 'interesse', 'interessant', 'votre cv', 'en parler', 'creneau', 'visio', 'rencontrer'],
  };

  /** Classe une réponse : stop | auto | refus | positif | a_lire. */
  function classerReponse(texte, objet) {
    const n = normaliser(sansCitation(texte) + ' ' + (objet || '')).replace(/’/g, "'");
    const a = function (k) { return MOTS[k].some(function (m) { return n.indexOf(m) >= 0; }); };
    if (a('stop')) return 'stop';
    if (a('auto')) return 'auto';
    const r = a('refus'), p = a('positif') && !/pas interesse/.test(n);
    if (r && p) return 'a_lire';
    if (r) return 'refus';
    if (p) return 'positif';
    return 'a_lire';
  }

  // ---------- Configuration ----------

  /** Lit le sous-ensemble de TOML utilisé par config/quotas.toml. */
  function lireToml(texte) {
    const out = {};
    let section = out;
    for (const brute of String(texte || '').split('\n')) {
      let l = '', dansChaine = false;
      for (const ch of brute) { if (ch === '"') dansChaine = !dansChaine; if (ch === '#' && !dansChaine) break; l += ch; }
      l = l.trim();
      if (!l) continue;
      const s = /^\[([\w.-]+)\]$/.exec(l);
      if (s) { section = out[s[1]] = out[s[1]] || {}; continue; }
      const kv = /^([\w-]+)\s*=\s*(.+)$/.exec(l);
      if (!kv) continue;
      try { section[kv[1]] = JSON.parse(kv[2]); } catch (e) { section[kv[1]] = kv[2]; }
    }
    return out;
  }

  /** Assemble le texte final envoyé : corps + lien + signature. */
  function texteFinal(corps, urlPortfolio, signature) {
    return String(corps).replace(BALISE_PORTFOLIO, urlPortfolio).trim() + '\n\n' + signature;
  }

  return {
    PLAFOND_DUR_EMAILS_JOUR, PLAFOND_DUR_PREMIERS_JOUR, PHRASE_OPPOSITION, BALISE_PORTFOLIO,
    normaliser, compterMots, domaineDe, lireListe, estDansListe, chercherMotifs,
    validerApproche, validerLot, paques, joursFeries, estJourOuvre, joursOuvresEntre,
    creneaux, dansFenetres, plafondPremiers, plafondEmails, sansCitation, classerReponse,
    lireToml, texteFinal, cle,
  };
})();

if (typeof module !== 'undefined') module.exports = Regles;
