// Connexion de l'app à Supabase : comptes, ventes partagées, classement en direct.
// Chargé seulement dans l'APK (pas dans la démo en ligne). Hors connexion, les opérations
// sont gardées dans une file d'attente et envoyées dès que le réseau revient.
(function () {
  const SB_URL = "https://qgmutzddetgapbpelpqj.supabase.co";
  const SB_KEY = "sb_publishable_jSpq9natfaII04KcV1GQWg_sQYDBy_Z"; // clé publique (publishable)
  if (!window.supabase) return;
  const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  window.sbClient = sb;
  let me = null, profile = null, pdvByName = {}, pdvById = {}, flushing = false;
  S.queue = S.queue || [];

  // ---------- Écran de connexion ----------
  const css = document.createElement("style");
  css.textContent = `
  .auth{position:fixed;inset:0;z-index:50;background:var(--bg);overflow:auto;padding-top:calc(env(safe-area-inset-top,0px) + 24px);padding-bottom:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
  .auth .box{max-width:420px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
  .auth h2{font-family:var(--f-display);font-size:26px;margin:8px 0 0}
  .auth p{margin:0;color:var(--muted);font-size:14px}
  .auth .err{color:var(--warn);font-size:14px}
  .auth .ok{color:var(--good);font-size:14px}
  .auth .link{background:none;border:0;color:var(--accent);font:inherit;font-weight:600;cursor:pointer;padding:6px 0;text-align:left}
  .sync{font-size:11px;font-weight:600;color:var(--muted)}`;
  document.head.appendChild(css);
  const box = document.createElement("div");
  box.className = "auth"; box.hidden = true;
  box.innerHTML = `<div class="box">
    <h2 id="aTitle">Connexion</h2><p id="aSub">Connecte-toi avec ton compte Sales Expert.</p>
    <input id="aNom" placeholder="Nom et prénom" autocomplete="name" hidden>
    <select id="aPdv" aria-label="Point de vente" hidden></select>
    <input id="aEmail" type="email" placeholder="E-mail" autocomplete="email" inputmode="email">
    <input id="aPass" type="password" placeholder="Mot de passe (6 caractères min.)" autocomplete="current-password">
    <button class="btn primary" id="aGo">Se connecter</button>
    <p id="aMsg"></p>
    <button class="link" id="aSwitch">Pas encore de compte ? Créer un compte</button>
    <button class="link" id="aReset">Mot de passe oublié</button>
    <button class="link" id="aDemo">Continuer sans compte (données sur ce téléphone uniquement)</button>
  </div>`;
  document.body.appendChild(box);
  const $a = id => document.getElementById(id);
  let mode = "login";
  function setMode(m) {
    mode = m; const up = m === "signup";
    $a("aTitle").textContent = up ? "Créer un compte" : "Connexion";
    $a("aSub").textContent = up ? "Un compte par Sales Expert. Tes clients restent privés, seuls tes totaux apparaissent dans le classement." : "Connecte-toi avec ton compte Sales Expert.";
    $a("aNom").hidden = $a("aPdv").hidden = !up;
    $a("aGo").textContent = up ? "Créer mon compte" : "Se connecter";
    $a("aSwitch").textContent = up ? "J'ai déjà un compte : me connecter" : "Pas encore de compte ? Créer un compte";
    $a("aPass").autocomplete = up ? "new-password" : "current-password";
    msg("");
  }
  function msg(t, ok) { $a("aMsg").className = ok ? "ok" : "err"; $a("aMsg").textContent = t; }
  $a("aSwitch").onclick = () => setMode(mode === "login" ? "signup" : "login");
  $a("aDemo").onclick = () => { box.hidden = true; try { localStorage.setItem("se-offline-mode", "1"); } catch (e) {} };
  $a("aReset").onclick = async () => {
    const email = $a("aEmail").value.trim(); if (!email) return msg("Écris ton e-mail, puis appuie de nouveau sur « Mot de passe oublié ».");
    const { error } = await sb.auth.resetPasswordForEmail(email); msg(error ? frErr(error) : "E-mail de réinitialisation envoyé.", !error);
  };
  $a("aGo").onclick = async () => {
    const email = $a("aEmail").value.trim(), password = $a("aPass").value;
    if (!email || password.length < 6) return msg("Saisis ton e-mail et un mot de passe d'au moins 6 caractères.");
    $a("aGo").disabled = true;
    try {
      if (mode === "signup") {
        const nom = $a("aNom").value.trim(); if (!nom) { msg("Saisis ton nom."); return; }
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nom, pdv: $a("aPdv").value } } });
        if (error) return msg(frErr(error));
        if (!data.session) { setMode("login"); msg("Compte créé. Ouvre l'e-mail de confirmation, puis connecte-toi.", true); return; }
        await afterLogin(data.session.user);
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) return msg(frErr(error));
        await afterLogin(data.user);
      }
    } finally { $a("aGo").disabled = false; }
  };
  function frErr(e) {
    const m = (e && e.message || "").toLowerCase();
    if (m.includes("invalid login")) return "E-mail ou mot de passe incorrect.";
    if (m.includes("not confirmed")) return "Confirme d'abord ton e-mail (lien reçu par e-mail).";
    if (m.includes("already registered")) return "Un compte existe déjà avec cet e-mail : connecte-toi.";
    if (m.includes("fetch") || m.includes("network")) return "Pas de connexion internet. Réessaie dès que tu as du réseau.";
    return "Erreur : " + (e.message || e);
  }

  // ---------- Après connexion : profil, points de vente, données ----------
  async function loadPdvs() {
    const { data, error } = await sb.from("points_de_vente").select("id,nom").order("nom");
    if (error) throw error;
    pdvByName = {}; pdvById = {};
    for (const p of data) { pdvByName[p.nom] = p.id; pdvById[p.id] = p.nom; }
    PDVS.length = 0; PDVS.push(...data.map(p => p.nom));
    const sel = document.getElementById("pdv"); sel.innerHTML = PDVS.map(p => `<option>${esc(p)}</option>`).join("");
    $a("aPdv").innerHTML = PDVS.map(p => `<option>${esc(p)}</option>`).join("");
  }
  async function afterLogin(user) {
    me = user; box.hidden = true;
    try { localStorage.removeItem("se-offline-mode"); } catch (e) {}
    try {
      await loadPdvs();
      let { data: prof } = await sb.from("profiles").select("*").eq("id", me.id).maybeSingle();
      const wanted = me.user_metadata && me.user_metadata.pdv;
      if (prof && !prof.pdv_id && wanted && pdvByName[wanted]) {
        await sb.from("profiles").update({ pdv_id: pdvByName[wanted] }).eq("id", me.id);
        prof.pdv_id = pdvByName[wanted];
      }
      profile = prof;
      if (profile) { S.monthGoal = profile.objectif_las_mois || 60; if (profile.pdv_id && pdvById[profile.pdv_id]) S.pdv = pdvById[profile.pdv_id]; }
      document.getElementById("pdv").value = S.pdv;
      if (!S.cloudUser || S.cloudUser !== me.id) {
        // Première connexion sur ce téléphone : on retire les données d'exemple
        S.sales = S.sales.filter(x => !x.example); S.gtd = {}; S.cloudUser = me.id;
      }
      await flush();
      await pull();
    } catch (e) { toast("Synchronisation impossible pour l'instant"); }
    showAccount(); save(); renderAll();
  }
  async function pull() {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("sales").select("*,customers(nom,prenom)").eq("user_id", me.id).order("vendu_le").range(from, from + 999);
      if (error) throw error; rows.push(...data); if (data.length < 1000) break;
    }
    const pending = new Set(S.queue.filter(q => q.op === "sale" || q.op === "sales").flatMap(q => q.op === "sale" ? [q.sale.id] : q.sales.map(x => x.id)));
    const local = S.sales.filter(x => pending.has(x.id));
    S.sales = rows.map(r => ({
      id: r.id, pdv: pdvById[r.pdv_id] || "?", model: r.model_id, color: r.color_id, cat: r.categorie, ut: r.user_type,
      vouchers: r.bons_referral, parrain: r.parrain || "", serial: r.code_unique || "", ts: Date.parse(r.vendu_le), imported: r.importe,
      client: r.customers ? [r.customers.prenom, r.customers.nom].filter(Boolean).join(" ") || "Client sans fiche" : (r.importe ? "Import" : "Client sans fiche")
    })).concat(local);
    const { data: gts } = await sb.from("get_try_logs").select("pdv_id,jour,nombre").eq("user_id", me.id);
    if (gts) { for (const g of gts) S.gtd[(pdvById[g.pdv_id] || "?") + "|" + g.jour] = g.nombre; }
    const { data: codes } = await sb.from("product_codes").select("gtin,model_id,color_id");
    if (codes) { S.codes = S.codes || {}; for (const c of codes) S.codes["GTIN:" + c.gtin] = { model: c.model_id, color: c.color_id }; }
  }
  function showAccount() {
    const el = document.getElementById("acct"); if (!el) return;
    if (!me) { el.textContent = "Hors ligne · données sur ce téléphone"; return; }
    const n = S.queue.length;
    el.innerHTML = `${esc(profile ? profile.nom : me.email)}${profile && profile.role === "admin" ? " · admin" : ""} · <span class="sync">${n ? n + " en attente d'envoi" : "synchronisé"}</span> · <a href="#" id="logout" style="color:var(--accent)">Déconnexion</a>`;
    document.getElementById("logout").onclick = async e => { e.preventDefault(); await sb.auth.signOut(); me = null; profile = null; window.cloudBoardCache = {}; setMode("login"); box.hidden = false; showAccount(); };
  }

  // ---------- File d'attente et envoi ----------
  const saleRow = x => ({
    id: x.id, pdv_id: pdvByName[x.pdv], model_id: x.model, color_id: x.color, categorie: x.cat, user_type: x.ut,
    bons_referral: x.cat === "ref" ? (x.vouchers || 1) : 0, parrain: x.parrain || null, code_unique: x.serial || null,
    importe: !!x.imported, vendu_le: new Date(x.ts).toISOString(), customer_id: x.customer_id || null
  });
  async function runOp(q) {
    if (q.op === "sale") {
      if (q.cust) { const { error } = await sb.from("customers").upsert(q.cust); if (error) throw error; q.sale.customer_id = q.cust.id; }
      const { error } = await sb.from("sales").upsert(saleRow(q.sale)); if (error) throw error;
    } else if (q.op === "sales") {
      const custs = q.sales.filter(x => x._cust).map(x => { x.customer_id = x._cust.id; return x._cust; });
      for (let i = 0; i < custs.length; i += 500) { const { error } = await sb.from("customers").upsert(custs.slice(i, i + 500)); if (error) throw error; }
      for (let i = 0; i < q.sales.length; i += 500) { const { error } = await sb.from("sales").upsert(q.sales.slice(i, i + 500).map(saleRow)); if (error) throw error; }
    } else if (q.op === "del") {
      const { error } = await sb.from("sales").delete().eq("id", q.id); if (error) throw error;
    } else if (q.op === "gt") {
      if (!pdvByName[q.pdv]) return;
      const { error } = await sb.from("get_try_logs").upsert({ user_id: me.id, pdv_id: pdvByName[q.pdv], jour: q.jour, nombre: q.nombre }, { onConflict: "user_id,pdv_id,jour" }); if (error) throw error;
    } else if (q.op === "code") {
      const { error } = await sb.from("product_codes").upsert({ gtin: q.gtin, model_id: q.model, color_id: q.color, ref_dk: q.ref || null }, { onConflict: "gtin", ignoreDuplicates: true }); if (error) throw error;
    }
  }
  async function flush() {
    if (!me || flushing || !S.queue.length) { showAccount(); return; }
    flushing = true;
    try {
      while (S.queue.length) {
        const q = S.queue[0];
        try { await runOp(q); S.queue.shift(); save(); }
        catch (e) {
          const m = (e && (e.message || e.code) || "") + "";
          if (/fetch|network|Failed/i.test(m)) break;            // hors ligne : on réessaiera
          if (/duplicate|unique/i.test(m) && q.op === "sale") { toast("Cet appareil (code unique) est déjà enregistré"); S.queue.shift(); continue; }
          console.warn("Envoi refusé", q, e); S.queue.shift(); toast("Une opération a été refusée par le serveur");
        }
      }
    } finally { flushing = false; save(); showAccount(); }
  }
  window.cloudHook = (op, ...a) => {
    if (op === "sale") S.queue.push({ op, sale: a[0], cust: a[1] });
    else if (op === "sales") { if (a[0].length) S.queue.push({ op, sales: a[0] }); }
    else if (op === "del") { const i = S.queue.findIndex(q => q.op === "sale" && q.sale.id === a[0]); if (i >= 0) S.queue.splice(i, 1); else S.queue.push({ op, id: a[0] }); }
    else if (op === "gt") { S.queue = S.queue.filter(q => !(q.op === "gt" && q.pdv === a[0] && q.jour === a[1])); S.queue.push({ op, pdv: a[0], jour: a[1], nombre: a[2] }); }
    else if (op === "code") S.queue.push({ op, gtin: a[0], model: a[1], color: a[2], ref: a[3] });
    save(); setTimeout(flush, 50);
  };
  addEventListener("online", flush);
  setInterval(flush, 60000);

  // ---------- Classement en direct ----------
  window.cloudBoardCache = {};
  window.cloudBoard = R => {
    if (!me) return null;
    const key = +R.a + "-" + +R.b, c = window.cloudBoardCache[key];
    if (!c || Date.now() - c.t > 60000) {
      if (!c || !c.loading) {
        window.cloudBoardCache[key] = Object.assign(c || {}, { loading: true });
        sb.rpc("classement", { debut: R.a.toISOString(), fin: R.b.toISOString() }).then(({ data, error }) => {
          window.cloudBoardCache[key] = { t: Date.now(), rows: error ? null : data };
          if (!error) renderStats();
        });
      }
      if (!c || !c.rows) return null;
    }
    return c.rows.map(r => ({ n: r.user_id === me.id ? `Toi · ${r.pdv || "?"}` : `${r.nom}${r.pdv ? " · " + r.pdv : ""}`, v: Number(r.las), me: r.user_id === me.id })).sort((a, b) => b.v - a.v);
  };

  // ---------- Démarrage ----------
  sb.auth.getSession().then(async ({ data }) => {
    let offline = false; try { offline = localStorage.getItem("se-offline-mode") === "1"; } catch (e) {}
    try { await loadPdvs(); } catch (e) {}
    if (data.session) await afterLogin(data.session.user);
    else if (!offline) { setMode("login"); box.hidden = false; }
    showAccount();
  });
})();
