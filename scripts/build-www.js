// Construit www/index.html à partir de la page de démo (src/app.html) :
// ajoute l'en-tête HTML complet, charge ZXing en local (hors ligne) et ouvre les liens externes (WhatsApp) hors de l'app.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
let body = fs.readFileSync(path.join(root, "src/app.html"), "utf8");
body = body.replace(/<script src="https:\/\/unpkg\.com\/@zxing\/library@[^"]+"><\/script>/, '<script src="zxing.min.js"></script>');
const head = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font-size:14px}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
`;
const tail = `
<script>
// Liens WhatsApp : ouverts dans l'app WhatsApp plutôt que dans une fenêtre interne
document.addEventListener("click", e => {
  const a = e.target.closest('a[target="_blank"]');
  if (a && a.href) { e.preventDefault(); window.location.href = a.href; }
}, true);
</script>
</body></html>
`;
fs.writeFileSync(path.join(root, "www/index.html"), head + body + tail);
console.log("www/index.html généré");
