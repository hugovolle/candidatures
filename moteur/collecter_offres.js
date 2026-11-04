#!/usr/bin/env node
/**
 * Collecteur d'offres — sans IA, sans clé, sans scraping fragile.
 *
 * Lit les pages carrières publiques des entreprises de data/vivier.csv via
 * les API ouvertes des plateformes de recrutement (Lever, Greenhouse, Ashby,
 * Workable), garde les postes créatifs ouverts en France ou en remote, et
 * écrit data/offres_du_jour.json. L'éclaireur part de ce fichier : ce sont
 * des offres réelles, datées, avec leur lien de candidature.
 *
 * Usage (racine du dépôt) : node moteur/collecter_offres.js
 */
const fs = require('fs');
const path = require('path');
const R = require('./regles.js');

const racine = path.resolve(__dirname, '..');

// Ce que Hugo vise (dossier/positionnement.md).
const TITRE_VISE = /(\bbrand\b|\bcreative\b|\bcr[ée]ati(f|ve|fs|ves)\b|direct(eur|rice|ion) artistique|\bartistic\b|\bart director\b|\bmotion design|\bgraphi(ste|c design)|\bvisual design|\bcontent design|\bdesign lead|\bhead of design|\bai designer|\bgenerative\b|creative technolog)/i;
// Ce qui n'est pas pour lui.
const TITRE_EXCLU = /(intern\b|internship|\bstage\b|stagiaire|alternan|apprenti|working student|product designer|product manager|ux research|ui engineer|software|developer|d[ée]veloppeur|\bsales\b|account exec|business develop|data analyst|brand support|company creation|customer|\bcdd\b|german speaker|italian speaker|spanish speaker)/i;
// France, ou remote ouvert à l'Europe. Une ville étrangère sans mention de la France est écartée.
const LIEU_FRANCE = /(france|paris|lyon|t[ée]l[ée]travail|\bfr\b)/i;
const LIEU_REMOTE_EUROPE = /(remote|full remote|anywhere).*(europe|emea|france)|(europe|emea|france).*(remote|anywhere)/i;
const LIEU_ETRANGER = /(san francisco|new york|california|\busa\b|united states|london|berlin|barcelona|milan|istanbul|madrid|amsterdam|lisbon|munich|toronto|singapore|dublin)/i;
function lieuOk(lieu) { return LIEU_FRANCE.test(lieu) || (LIEU_REMOTE_EUROPE.test(lieu) && !LIEU_ETRANGER.test(lieu)); }

const API = {
  lever: async (id) => (await obtenir(`https://api.lever.co/v0/postings/${id}?mode=json`)).map((o) => ({
    titre: o.text, lieu: [o.categories && o.categories.location, o.workplaceType].filter(Boolean).join(' · '),
    url: o.hostedUrl, publie: o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 10) : null,
    extrait: String(o.descriptionPlain || '').slice(0, 600),
  })),
  greenhouse: async (id) => ((await obtenir(`https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`)).jobs || []).map((o) => ({
    titre: o.title, lieu: (o.location && o.location.name) || '', url: o.absolute_url,
    publie: (o.first_published || o.updated_at || '').slice(0, 10) || null,
    extrait: String(o.content || '').replace(/&lt;[^&]*&gt;|<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').slice(0, 600),
  })),
  ashby: async (id) => ((await obtenir(`https://api.ashbyhq.com/posting-api/job-board/${id}`)).jobs || []).map((o) => ({
    titre: o.title, lieu: [o.location, o.isRemote ? 'remote' : '', o.workplaceType].filter(Boolean).join(' · '),
    url: o.jobUrl || o.applyUrl, publie: (o.publishedAt || '').slice(0, 10) || null,
    extrait: String(o.descriptionPlain || '').slice(0, 600),
  })),
  workable: async (id) => ((await obtenir(`https://apply.workable.com/api/v1/widget/accounts/${id}`)).jobs || []).map((o) => ({
    titre: o.title, lieu: [o.city, o.country, o.telecommuting ? 'remote' : ''].filter(Boolean).join(' · '),
    url: o.url || o.shortlink, publie: o.published_on || null, extrait: '',
  })),
};

async function obtenir(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function lireVivier() {
  return fs.readFileSync(path.join(racine, 'data/vivier.csv'), 'utf8').split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('entreprise,'))
    .map((l) => { const [entreprise, plateforme, identifiant] = l.split(',').map((x) => x.trim()); return { entreprise, plateforme, identifiant }; });
}

/** Filtre pur, testable : garde les offres créatives, en France ou remote, non exclues. */
function filtrer(offres, entreprise) {
  return offres.filter((o) => o.titre && TITRE_VISE.test(o.titre) && !TITRE_EXCLU.test(o.titre) && lieuOk(o.lieu))
    .filter(() => !R.chercherMotifs(entreprise).some((m) => !/nous|formule/.test(m)))
    .map((o) => Object.assign({ entreprise }, o));
}

async function main() {
  const vivier = lireVivier();
  const listeNoire = R.lireListe(fs.readFileSync(path.join(racine, 'data/liste_noire.txt'), 'utf8'));
  const resultats = [], erreurs = [];
  await Promise.all(vivier.map(async (v) => {
    try {
      const offres = await API[v.plateforme](v.identifiant);
      for (const o of filtrer(offres, v.entreprise)) {
        const domaine = (() => { try { return new URL(o.url).hostname; } catch (e) { return ''; } })();
        if (R.estDansListe('', v.entreprise.toLowerCase(), listeNoire)) continue;
        resultats.push(Object.assign(o, { plateforme: v.plateforme, page_offre_domaine: domaine }));
      }
    } catch (e) { erreurs.push(v.entreprise + ' (' + v.plateforme + ') : ' + e.message); }
  }));
  resultats.sort((a, b) => String(b.publie).localeCompare(String(a.publie)));
  const sortie = { genere_le: new Date().toISOString(), entreprises_lues: vivier.length - erreurs.length, offres: resultats, erreurs };
  fs.writeFileSync(path.join(racine, 'data/offres_du_jour.json'), JSON.stringify(sortie, null, 2) + '\n');
  console.log(resultats.length + ' offre(s) créative(s) trouvée(s) sur ' + sortie.entreprises_lues + ' entreprise(s) lue(s).');
  for (const o of resultats.slice(0, 40)) console.log('- ' + o.entreprise + ' : ' + o.titre + ' (' + o.lieu + ', ' + o.publie + ')');
  if (erreurs.length) console.log('Illisibles : ' + erreurs.join(' ; '));
}

if (require.main === module) main();
module.exports = { filtrer, lieuOk, TITRE_VISE, TITRE_EXCLU };
