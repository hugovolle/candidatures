#!/usr/bin/env node
/**
 * Contrôle mécanique d'un lot, avec exactement les mêmes règles que
 * l'expéditeur (moteur/regles.js).
 *
 * Usage (depuis la racine du dépôt) :
 *   node moteur/controle_lot.js data/lots/2026-11-04.json
 *   node moteur/controle_lot.js data/lots/2026-11-04.json --corriger
 *
 * Sans option : affiche les erreurs, code de sortie 1 s'il y en a.
 * --corriger : déplace chaque approche fautive dans « ecartees » (motif
 * « contrôle final : … ») et réécrit le fichier. C'est ce que fait la
 * routine juste avant de pousser le lot.
 */
const fs = require('fs');
const path = require('path');
const R = require('./regles.js');

const racine = path.resolve(__dirname, '..');
const lire = (p) => (fs.existsSync(path.join(racine, p)) ? fs.readFileSync(path.join(racine, p), 'utf8') : '');

function contexte() {
  const config = R.lireToml(lire('config/quotas.toml'));
  const contacts = {};
  const suivi = lire('data/suivi_export.json');
  let listeNoire = R.lireListe(lire('data/liste_noire.txt'));
  if (suivi) {
    try {
      const s = JSON.parse(suivi);
      for (const c of s.contacts || []) {
        const d = String(c.domaine || '').toLowerCase();
        if (d && (!contacts[d] || contacts[d] < c.date)) contacts[d] = c.date;
      }
      listeNoire = listeNoire.concat((s.liste_noire_ajouts || []).map((x) => String(x.valeur || x).toLowerCase()));
    } catch (e) {
      console.error('⚠️  data/suivi_export.json illisible : ' + e.message);
    }
  }
  return {
    config,
    ctx: {
      listeNoire,
      dejaContactes: R.lireListe(lire('data/deja_contactes.txt')),
      contacts,
      aujourdhui: new Date(),
      delaiMois: (config.exclusions || {}).delai_meme_entreprise_mois || 6,
      scoreMinimum: (config.lot || {}).score_minimum || 65,
      noteMinimum: (config.lot || {}).note_censeur_minimum || 8,
      relanceActive: !!(config.relance || {}).active,
    },
  };
}

function main() {
  const fichier = process.argv[2];
  const corriger = process.argv.includes('--corriger');
  if (!fichier) { console.error('Usage : node moteur/controle_lot.js <lot.json> [--corriger]'); process.exit(2); }
  const lot = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  const { ctx } = contexte();
  const res = R.validerLot(lot, ctx);
  let nbErreurs = res.erreursLot.length;
  for (const e of res.erreursLot) console.log('✗ LOT : ' + e);
  for (const a of res.approches) {
    if (a.erreurs.length) {
      nbErreurs++;
      console.log('✗ ' + a.id + ' (' + a.entreprise + ')');
      for (const e of a.erreurs) console.log('    - ' + e);
    } else console.log('✓ ' + a.id + ' (' + a.entreprise + ')');
  }
  if (corriger && res.erreursLot.length === 0) {
    const fautives = new Map(res.approches.filter((a) => a.erreurs.length).map((a) => [a.id, a.erreurs]));
    lot.ecartees = lot.ecartees || [];
    lot.approches = lot.approches.filter((a) => {
      if (!fautives.has(a.id)) return true;
      lot.ecartees.push({ entreprise: a.entreprise, motif: 'contrôle final : ' + fautives.get(a.id).join(' ; ') });
      return false;
    });
    fs.writeFileSync(fichier, JSON.stringify(lot, null, 2) + '\n');
    console.log('→ ' + fautives.size + ' approche(s) déplacée(s) dans « ecartees », ' + lot.approches.length + ' conservée(s).');
    process.exit(0);
  }
  process.exit(nbErreurs ? 1 : 0);
}

if (require.main === module) main();
module.exports = { contexte };
