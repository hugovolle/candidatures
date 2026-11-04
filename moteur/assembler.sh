#!/bin/sh
# Rassemble les fichiers du projet Apps Script dans moteur/dist/ pour clasp.
# regles.js vit dans moteur/ (partagé avec la routine) : il est copié ici.
set -e
cd "$(dirname "$0")"
mkdir -p dist
cp regles.js apps-script/Code.js apps-script/Page.html apps-script/appsscript.json dist/
[ -f .clasp.json ] && cp .clasp.json dist/.clasp.json
echo "dist/ prêt : $(ls dist | tr '\n' ' ')"
