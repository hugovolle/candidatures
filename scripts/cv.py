#!/usr/bin/env python3
"""Génère un CV PDF à partir de profil/cv.json et d'une variante.

    python3 scripts/cv.py da                          # variante de base -> sortie/CV_Hugo_Volle_da.pdf
    python3 scripts/cv.py offres/2026-09-24_x/variante.json -o offres/2026-09-24_x/CV_Hugo_Volle.pdf

Une variante d'offre peut hériter d'une variante de base ("base": "da") et
ajouter "mots_cles" : les puces qui les contiennent passent devant.
"""
import argparse, base64, io, json, re, sys
from pathlib import Path

import jinja2, qrcode
from PIL import Image
from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parent.parent


def charger_variante(arg):
    p = Path(arg)
    if not p.suffix:
        p = RACINE / "variantes" / f"{arg}.json"
    v = json.loads(p.read_text())
    if "base" in v:
        base = json.loads((RACINE / "variantes" / f"{v['base']}.json").read_text())
        base.update({k: val for k, val in v.items() if k != "base"})
        v = base
    return v, p


def gras(t):
    t = jinja2.utils.markupsafe.escape(t)
    return jinja2.utils.markupsafe.Markup(re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", str(t)))


def score(puce, profil, mots):
    txt = puce["t"].lower()
    bonus = sum(1 for m in mots if m.lower() in txt)
    return (profil not in puce["tags"], puce["prio"] - bonus)


def choisir_puces(xp, v):
    n = v.get("max_puces", {}).get(xp["id"], 3)
    if n == 0:
        return None
    mots = v.get("mots_cles", [])
    garder = sorted(xp["puces"], key=lambda p: score(p, v["profil"], mots))[:n]
    garder = [p for p in xp["puces"] if p in garder]  # ordre d'origine
    return [gras(p["t"]) for p in garder]


def data_uri_photo(chemin):
    im = Image.open(chemin).convert("RGB")
    im.thumbnail((500, 500))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def data_uri_qr(url):
    q = qrcode.QRCode(border=0, box_size=8); q.add_data(url); q.make(fit=True)
    buf = io.BytesIO(); q.make_image(fill_color="#141414", back_color="white").save(buf)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def rendre(v, sortie):
    cv = json.loads((RACINE / "profil/cv.json").read_text())
    ident = cv["identite"]
    xps = []
    for xp in cv["experiences"]:
        puces = choisir_puces(xp, v)
        if puces is not None:
            xps.append({**xp, "puces": puces})
    comp = cv["competences"]
    ordre = v.get("ordre_competences", list(comp))
    prenom, nom = ident["nom"].split(" ", 1)

    env = jinja2.Environment(loader=jinja2.FileSystemLoader(RACINE / "gabarit"), autoescape=True)
    html = env.get_template("cv.html").render(
        v=v, id=ident, prenom=prenom, nom=nom, experiences=xps,
        competences=[(k, comp[k]) for k in ordre],
        formation=cv["formation"], diffusions=cv["diffusions"],
        langues=cv["langues"], interets=cv["interets"],
        photo=data_uri_photo(ident["photo"]) if v.get("photo", True) else None,
        qr=data_uri_qr(ident["portfolio_url"]),
        fonts_css=jinja2.utils.markupsafe.Markup((RACINE / "gabarit/fonts/fonts.css").read_text()),
    )
    tmp = RACINE / "gabarit/_rendu.html"
    tmp.write_text(html)

    with sync_playwright() as p:
        nav = p.chromium.launch()
        page = nav.new_page()
        page.goto(tmp.as_uri()); page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")
        # Si ça déborde d'une page, on resserre le corps de texte par petits pas.
        for _ in range(8):
            deborde = page.evaluate("document.body.scrollHeight > document.body.clientHeight + 1")
            if not deborde:
                break
            page.evaluate("""() => { const b = document.body;
                const s = parseFloat(getComputedStyle(b).fontSize); b.style.fontSize = (s * 0.97) + 'px'; }""")
        else:
            print("⚠️  Le CV déborde toujours d'une page : retirer une puce.", file=sys.stderr)
        sortie.parent.mkdir(parents=True, exist_ok=True)
        page.pdf(path=str(sortie), format="A4", print_background=True, prefer_css_page_size=True)
        nav.close()
    tmp.unlink()
    return sortie


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("variante")
    ap.add_argument("-o", "--sortie")
    a = ap.parse_args()
    v, chemin = charger_variante(a.variante)
    sortie = Path(a.sortie) if a.sortie else RACINE / "sortie" / f"CV_Hugo_Volle_{chemin.stem}.pdf"
    print(rendre(v, sortie))
