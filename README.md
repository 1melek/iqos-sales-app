# Sales Expert App

Version démo installable (Android) de l'app Sales Expert : saisie des ventes, rapports WhatsApp (ventes, stock, arrivages, commandes), programmation, scan du code des boîtes, stats, objectif mensuel et classement.

## Obtenir l'APK
À chaque envoi sur la branche `main`, GitHub Actions compile l'APK :
- onglet **Actions** › dernier build › artefact `sales-expert-apk`,
- ou onglet **Releases** › « APK Sales Expert (dernière version) » › `sales-expert.apk`.

Sur le téléphone : ouvrir le fichier et autoriser l'installation depuis des sources inconnues.

## Structure
- `src/app.html` : l'app (même code que la démo en ligne)
- `scripts/build-www.js` : prépare `www/index.html` pour Android
- `www/zxing.min.js` : lecteur de codes (ZXing, Apache-2.0), embarqué pour marcher hors ligne
- `.github/workflows/android-apk.yml` : compilation automatique de l'APK
- `capacitor.config.json` : configuration de l'app Android (Capacitor, MIT)
