// MAX ULTRA FINAL (Browser + Android + iOS PWA ready)
// - No email login, username from employees list (admin-managed)
// - All users see all tags
// - Auto-Admin via Firestore: admins/{uid} with enabled=true
// - Admin can manage employees/tags/tasks/daychange
// - Push prepared: stores FCM token (Android/Chrome). iOS only for installed PWA.
// ------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Optional (Push)
import {
  getMessaging, getToken, isSupported as messagingSupported, onMessage
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
const n = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const key = (s) => n(s).toLowerCase().replace(/["'„“”]/g, "").replace(/[^a-z0-9äöüß]/g, "");
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const tzDateKey = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};
const stamp = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const show = (el, on) => { if (el) el.hidden = !on; };

/* ---------------- config bootstrap ---------------- */
function loadCfg() {
  try { return JSON.parse(localStorage.getItem("firebaseConfig") || ""); } catch (e) { return null; }
}
function saveCfg(obj) {
  localStorage.setItem("firebaseConfig", JSON.stringify(obj));
}
function parseCfg(txt) {
  const t = String(txt || "").trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Kein JSON-Objekt gefunden.");
  const obj = JSON.parse(m[0]);
  if (!obj.projectId || !obj.apiKey) throw new Error("projectId/apiKey fehlen.");
  // Optional: vapidKey (für Web Push), messagingSenderId
  return obj;
}

/* ---------------- DOM (expects your GOD MODE index.html) ---------------- */
const setupView = $("setupView");
const loginView = $("loginView");
const appView   = $("appView");

const firebaseCfg = $("firebaseCfg");
const saveCfgBtn  = $("saveCfgBtn");
const resetCfgBtn = $("resetCfgBtn");
const setupErr    = $("setupErr");

const whoami    = $("whoami");
const reloadBtn = $("reloadBtn");
const logoutBtn = $("logoutBtn");

const nameSel  = $("nameSel");
const loginBtn = $("loginBtn");

const showUidBtn = $("showUidBtn");
const copyUidBtn = $("copyUidBtn");
const uidBox     = $("uidBox");

const tagSearch = $("tagSearch");
const tagList   = $("tagList");

const tabs = [...document.querySelectorAll(".tab")];
const panes = {
  tasks: $("tab_tasks"),
  rides: $("tab_rides"),
  admin: $("tab_admin"),
  god:   $("tab_god"),
};

const openTagTitle = $("openTagTitle");
const tagMeta      = $("tagMeta");
const closeTagBtn  = $("closeTagBtn");
const newTaskBtn   = $("newTaskBtn");
const taskList     = $("taskList");

const rideNameSel = $("rideNameSel");
const rideEinsatz = $("rideEinsatz");
const addRideBtn  = $("addRideBtn");
const rideInfo    = $("rideInfo");

const adminLock = $("adminLock");
const adminArea = $("adminArea");
const empAdd    = $("empAdd");
const empAddBtn = $("empAddBtn");
const empList   = $("empList");
const tagAdd    = $("tagAdd");
const tagAddBtn = $("tagAddBtn");
const adminTagList = $("adminTagList");

const godLock   = $("godLock");
const godArea   = $("godArea");
const godSummary= $("godSummary");
const godSearch = $("godSearch");
const godList   = $("godList");
const toggleOnlyOpenBtn = $("toggleOnlyOpenBtn");
const collapseAllBtn    = $("collapseAllBtn");
const dayChangeBtn      = $("dayChangeBtn");

/* ---------------- state ---------------- */
let app = null, auth = null, db = null;
let messaging = null;
let meName = "";
let isAdmin = false;

let currentTagId = "";
let currentTagKey = "";

let lastEmployees = [];
let lastTags = [];
let allTasks = [];

let unsubEmployees = null;
let unsubTags = null;
let unsubTasks = null;
let unsubAllTasks = null;

let ultraOnlyOpen = false;

/* ---------------- service worker (offline cache + optional push) ---------------- */
async function registerSW() {
  try {
    if (!("serviceWorker" in navigator)) return;

    // Offline cache SW
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });

    // firebase messaging SW must be at root path (served from repo root)
    // On GitHub Pages repo, root is /REPO/ -> so file must be /REPO/firebase-messaging-sw.js
    // We register it here for messaging if available.
    try {
      await navigator.serviceWorker.register("./firebase-messaging-sw.js", { scope: "./" });
    } catch (e) {
      // ignore if file missing
    }
  } catch (e) {
    // ignore
  }
}

/* ---------------- init entry ---------------- */
const cfg = loadCfg();

if (!cfg) {
  show(setupView, true);
  show(loginView, false);
  show(appView, false);

  if (saveCfgBtn) saveCfgBtn.onclick = () => {
    if (setupErr) setupErr.textContent = "";
    try {
      const obj = parseCfg(firebaseCfg ? firebaseCfg.value : "");
      saveCfg(obj);
      location.reload();
    } catch (e) {
      if (setupErr) setupErr.textContent = e.message || String(e);
    }
  };

  if (resetCfgBtn) resetCfgBtn.onclick = () => {
    localStorage.removeItem("firebaseConfig");
    localStorage.removeItem("meName");
    location.reload();
  };

} else {
  boot(cfg);
}

/* ---------------- boot firebase ---------------- */
async function boot(cfgObj) {
  await registerSW();

  app = initializeApp(cfgObj);
  auth = getAuth(app);
  db = getFirestore(app);

  // UI wiring
  show(setupView, false);
  show(loginView, true);
  show(appView, false);

  if (reloadBtn) reloadBtn.onclick = () => location.reload();
  if (logoutBtn) logoutBtn.onclick = async () => {
    try { await signOut(auth); } catch (e) {}
    localStorage.removeItem("meName");
    location.reload();
  };

  // Tabs
  tabs.forEach(t => {
    t.onclick = () => {
      tabs.forEach(x => x.classList.remove("active"));
      t.classList.add("active");
      const tab = t.dataset.tab;
      Object.values(panes).forEach(p => show(p, false));
      show(panes[tab], true);
    };
  });

  // Buttons
  if (closeTagBtn) closeTagBtn.onclick = () => closeTag();
  if (newTaskBtn) newTaskBtn.onclick = () => createTaskPrompt();
  if (addRideBtn) addRideBtn.onclick = () => addRide();
  if (empAddBtn)  empAddBtn.onclick  = () => addEmployee();
  if (tagAddBtn)  tagAddBtn.onclick  = () => addTag();

  if (toggleOnlyOpenBtn) toggleOnlyOpenBtn.onclick = () => {
    ultraOnlyOpen = !ultraOnlyOpen;
    renderGod();
  };
  if (collapseAllBtn) collapseAllBtn.onclick = () => {
    if (godList) godList.querySelectorAll("details").forEach(d => d.open = false);
  };
  if (dayChangeBtn) dayChangeBtn.onclick = () => runDayChange();

  if (tagSearch) tagSearch.oninput = () => renderTags(lastTags);
  if (godSearch) godSearch.oninput = () => renderGod();

  // UID
  if (showUidBtn) showUidBtn.onclick = () => showUid();
  if (copyUidBtn) copyUidBtn.onclick = async () => {
    const uid = auth?.currentUser?.uid || "";
    if (!uid) return;
    try { await navigator.clipboard.writeText(uid); alert("UID kopiert ✓"); }
    catch (e) { alert(uid); }
  };

  // Login button
  if (loginBtn) loginBtn.onclick = async () => {
    const nm = n(nameSel ? nameSel.value : "");
    if (!nm) { alert("Bitte Name wählen."); return; }

    await ensureAnon();

    // store name to users/{uid} (for audit)
    await setDoc(doc(db, "users", auth.currentUser.uid), {
      name: nm,
      updatedAt: serverTimestamp()
    }, { merge: true });

    localStorage.setItem("meName", nm);

    await refreshMe(); // sets isAdmin
    show(loginView, false);
    show(appView, true);
    const t0 = tabs.find(x => x.dataset.tab === "tasks");
    if (t0) t0.click();

    // Start GOD stream if admin
    startGodStreamIfAdmin();
    // Push init (optional)
    initPushIfPossible(cfgObj).catch(()=>{});
  };

  // auth observer
  onAuthStateChanged(auth, async (u) => {
    if (!u) {
      // not signed in yet
      await loadEmployees();
      await loadTags();
      show(loginView, true);
      show(appView, false);
      if (whoami) whoami.textContent = "—";
      return;
    }

    await refreshMe();
    await loadEmployees();
    await loadTags();

    // Auto-open app if stored name
    const stored = n(localStorage.getItem("meName"));
    if (stored) {
      meName = stored;
      if (whoami) whoami.textContent = `${meName}${isAdmin ? " · ADMIN" : ""}`;
      show(loginView, false);
      show(appView, true);
      const t0 = tabs.find(x => x.dataset.tab === "tasks");
      if (t0) t0.click();
      startGodStreamIfAdmin();
      initPushIfPossible(cfgObj).catch(()=>{});
    } else {
      show(loginView, true);
      show(appView, false);
    }
  });

  // Ensure anonymous sign-in early (so UID always works)
  await ensureAnon();
}

/* ---------------- auth/admin ---------------- */
async function ensureAnon() {
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}

async function refreshMe() {
  await ensureAnon();
  const uid = auth.currentUser.uid;

  // read username if any
  const us = await getDoc(doc(db, "users", uid));
  meName = us.exists() ? (us.data().name || "") : (n(localStorage.getItem("meName")) || "");

  // admin check: admins/{uid}
  const ad = await getDoc(doc(db, "admins", uid));
  isAdmin = ad.exists() && (ad.data()?.enabled !== false);

  if (whoami) whoami.textContent = `${meName || "—"}${isAdmin ? " · ADMIN" : ""}`;

  show(adminLock, !isAdmin);
  show(adminArea, isAdmin);
  show(godLock, !isAdmin);
  show(godArea, isAdmin);
}

async function showUid() {
  try {
    await ensureAnon();
    const uid = auth.currentUser.uid;
    if (uidBox) uidBox.textContent = uid;
    if (copyUidBtn) copyUidBtn.disabled = false;
    alert("Deine UID:\n" + uid);
  } catch (e) {
    alert("UID Fehler: " + (e.message || e));
  }
}

/* ---------------- employees (login names) ---------------- */
async function loadEmployees() {
  if (unsubEmployees) unsubEmployees();

  unsubEmployees = onSnapshot(
    query(collection(db, "employees_public"), orderBy("name")),
    (snap) => {
      lastEmployees = snap.docs.map(d => n(d.data().name)).filter(Boolean);
      renderEmployeeSelectors();
      if (isAdmin) renderEmployeeAdmin();
    }
  );
}

function renderEmployeeSelectors() {
  const opts = [`<option value="">Name wählen…</option>`]
    .concat(lastEmployees.map(x => `<option value="${esc(x)}">${esc(x)}</option>`));

  if (nameSel) nameSel.innerHTML = opts.join("");
  if (rideNameSel) rideNameSel.innerHTML = opts.join("");

  const stored = n(localStorage.getItem("meName"));
  if (stored && nameSel) nameSel.value = stored;
  if (stored && rideNameSel) rideNameSel.value = stored;
}

function renderEmployeeAdmin() {
  if (!empList) return;
  empList.innerHTML = "";

  lastEmployees.forEach(name => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="main"><div class="title">${esc(name)}</div></div>
      <div class="actions"><button class="btn ghost">🗑️</button></div>
    `;
    div.querySelector("button").onclick = async () => {
      if (!confirm(`"${name}" löschen?`)) return;
      await deleteDoc(doc(db, "employees_public", key(name)));
    };
    empList.appendChild(div);
  });
}

async function addEmployee() {
  if (!isAdmin) { alert("Nur Admin."); return; }
  const nm = n(empAdd ? empAdd.value : "");
  if (!nm) { alert("Name fehlt."); return; }

  await setDoc(doc(db, "employees_public", key(nm)), {
    name: nm,
    updatedAt: serverTimestamp()
  }, { merge: true });

  if (empAdd) empAdd.value = "";
}

/* ---------------- tags ---------------- */
async function loadTags() {
  if (unsubTags) unsubTags();

  unsubTags = onSnapshot(
    query(collection(db, "tags"), orderBy("tagId")),
    (snap) => {
      lastTags = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTags(lastTags);
      if (isAdmin) renderAdminTags(lastTags);
    }
  );
}

function renderTags(tags) {
  if (!tagList) return;
  const q = n(tagSearch ? tagSearch.value : "").toLowerCase();

  const list = tags.filter(t => {
    const id = String(t.tagId || t.id || "").toLowerCase();
    return !q || id.includes(q);
  });

  tagList.innerHTML = "";
  list.forEach(t => {
    const tid = t.tagId || t.id;
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="main">
        <div class="title">🏷️ ${esc(tid)}</div>
        <div class="sub muted small">${esc(t.tagKey || t.id)}</div>
      </div>
      <div class="actions"><button class="btn ghost">Öffnen</button></div>
    `;
    div.querySelector("button").onclick = () => openTag(tid);
    tagList.appendChild(div);
  });

  if (!list.length) tagList.innerHTML = `<div class="muted">Keine Tags.</div>`;
}

function renderAdminTags(tags) {
  if (!adminTagList) return;
  adminTagList.innerHTML = "";

  tags.forEach(t => {
    const tid = t.tagId || t.id;
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="main">
        <div class="title">🏷️ ${esc(tid)}</div>
        <div class="sub muted small">${esc(t.id)}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-open="1">Öffnen</button>
        <button class="btn ghost" data-del="1">🗑️</button>
      </div>
    `;
    div.querySelector('[data-open="1"]').onclick = () => openTag(tid);
    div.querySelector('[data-del="1"]').onclick = () => deleteTagWithTasks(t.id, tid);
    adminTagList.appendChild(div);
  });
}

async function addTag() {
  if (!isAdmin) { alert("Nur Admin."); return; }
  const tid = n(tagAdd ? tagAdd.value : "");
  if (!tid) { alert("Tag_ID fehlt."); return; }

  const k = key(tid);
  await setDoc(doc(db, "tags", k), {
    tagId: tid,
    tagKey: k,
    updatedAt: serverTimestamp()
  }, { merge: true });

  if (tagAdd) tagAdd.value = "";
}

/* ---------------- tasks per tag ---------------- */
async function openTag(tagId) {
  const tid = n(tagId);
  if (!tid) return;

  currentTagId = tid;
  currentTagKey = key(tid);

  if (openTagTitle) openTagTitle.textContent = `Tag: ${tid}`;
  if (tagMeta) tagMeta.textContent = `tagKey: ${currentTagKey}`;

  if (unsubTasks) unsubTasks();
  unsubTasks = onSnapshot(
    query(collection(db, "daily_tasks"), where("tagKey", "==", currentTagKey), orderBy("task")),
    (snap) => {
      const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTasks(tasks);
    }
  );

  const tTasks = tabs.find(x => x.dataset.tab === "tasks");
  if (tTasks) tTasks.click();
}

function closeTag() {
  currentTagId = "";
  currentTagKey = "";
  if (openTagTitle) openTagTitle.textContent = "Kein Tag geöffnet";
  if (tagMeta) tagMeta.textContent = "";
  if (taskList) taskList.innerHTML = "";
  if (unsubTasks) { unsubTasks(); unsubTasks = null; }
}

async function createTaskPrompt() {
  if (!isAdmin) { alert("Nur Admin."); return; }
  if (!currentTagKey) { alert("Erst Tag öffnen."); return; }

  const txt = prompt("Neue Aufgabe:");
  if (!txt) return;

  await addDoc(collection(db, "daily_tasks"), {
    tagId: currentTagId,
    tagKey: currentTagKey,
    task: n(txt),
    status: "❌",
    doneBy: [],
    doneAtLast: "",
    finalOk: false,
    finalBy: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function renderTasks(tasks) {
  if (!taskList) return;

  taskList.innerHTML = "";
  if (!tasks.length) {
    taskList.innerHTML = `<div class="muted">Keine Aufgaben.</div>`;
    return;
  }

  tasks.forEach(t => {
    const doneBy = Array.isArray(t.doneBy) ? t.doneBy.join(", ") : "";
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="main">
        <div class="title">${t.status === "✅" ? "✅" : "⏳"} ${esc(t.task || "")}</div>
        <div class="sub muted small">
          ${doneBy ? `Erledigt von: ${esc(doneBy)}` : ""}
          ${t.finalOk ? ` · 🧾 Endkontrolle: ${esc(t.finalBy || "")}` : ""}
        </div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-done="1">${t.status === "✅" ? "↩️" : "✅"}</button>
        ${isAdmin ? `
          <button class="btn ghost" data-final="1">🧾</button>
          <button class="btn ghost" data-edit="1">✏️</button>
          <button class="btn ghost" data-del="1">🗑️</button>
        ` : ``}
      </div>
    `;

    // done toggle
    div.querySelector('[data-done="1"]').onclick = async () => {
      // normal user: can only mark done
      if (t.status !== "✅") {
        const nm = n(localStorage.getItem("meName")) || meName;
        if (!nm) { alert("Bitte einloggen."); return; }

        const prev = Array.isArray(t.doneBy) ? t.doneBy : [];
        const merged = Array.from(new Set(prev.concat([nm])));

        await updateDoc(doc(db, "daily_tasks", t.id), {
          status: "✅",
          doneBy: merged,
          doneAtLast: stamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        // revert only admin
        if (!isAdmin) { alert("Nur Admin kann zurücksetzen."); return; }
        await updateDoc(doc(db, "daily_tasks", t.id), {
          status: "❌",
          doneBy: [],
          doneAtLast: "",
          finalOk: false,
          finalBy: "",
          updatedAt: serverTimestamp()
        });
      }
    };

    if (isAdmin) {
      div.querySelector('[data-final="1"]').onclick = async () => {
        if (t.status !== "✅") { alert("Endkontrolle nur bei ✅."); return; }
        await updateDoc(doc(db, "daily_tasks", t.id), {
          finalOk: !t.finalOk,
          finalBy: (meName || "Admin"),
          updatedAt: serverTimestamp()
        });
      };

      div.querySelector('[data-edit="1"]').onclick = async () => {
        const nt = prompt("Aufgabe:", t.task || "");
        if (nt == null) return;
        await updateDoc(doc(db, "daily_tasks", t.id), {
          task: n(nt),
          updatedAt: serverTimestamp()
        });
      };

      div.querySelector('[data-del="1"]').onclick = async () => {
        if (!confirm("Aufgabe löschen?")) return;
        await deleteDoc(doc(db, "daily_tasks", t.id));
      };
    }

    taskList.appendChild(div);
  });
}

/* ---------------- rides (today) ---------------- */
async function addRide() {
  const nm = n(rideNameSel ? rideNameSel.value : "") || meName || n(localStorage.getItem("meName"));
  const eins = n(rideEinsatz ? rideEinsatz.value : "");
  if (!nm) { alert("Name fehlt."); return; }
  if (!eins) { alert("Einsatznummer fehlt."); return; }

  const day = tzDateKey();
  const ref = doc(db, "rides_daily", day, "people", key(nm));

  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : { name: nm, rides: [] };
  const rides = Array.isArray(data.rides) ? data.rides.slice(0) : [];
  rides.push({ einsatz: eins, at: stamp() });

  await setDoc(ref, { name: nm, rides, updatedAt: serverTimestamp() }, { merge: true });

  if (rideEinsatz) rideEinsatz.value = "";
  if (rideInfo) rideInfo.textContent = "Gespeichert ✓";
}

/* ---------------- GOD MODE (admin dashboard across all tags) ---------------- */
function startGodStreamIfAdmin() {
  if (!isAdmin) return;
  if (unsubAllTasks) return;

  unsubAllTasks = onSnapshot(
    query(collection(db, "daily_tasks"), orderBy("tagKey"), orderBy("task")),
    (snap) => {
      allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderGod();
    }
  );
}

function renderGod() {
  if (!isAdmin || !godList) {
    if (godSummary) godSummary.textContent = "";
    if (godList) godList.innerHTML = "";
    return;
  }

  const q = n(godSearch ? godSearch.value : "").toLowerCase();

  // group by tagKey
  const map = new Map();
  for (const t of allTasks) {
    const tk = t.tagKey || "";
    if (!tk) continue;
    if (!map.has(tk)) map.set(tk, { tagKey: tk, tagId: t.tagId || tk, open: 0, done: 0, final: 0, openTasks: [] });
    const g = map.get(tk);
    if ((t.status || "❌") === "✅") g.done++;
    else { g.open++; g.openTasks.push(t); }
    if (t.finalOk) g.final++;
    if (t.tagId) g.tagId = t.tagId;
  }

  let groups = [...map.values()].sort((a, b) => (a.tagId || "").localeCompare(b.tagId || ""));

  if (ultraOnlyOpen) groups = groups.filter(g => g.open > 0);
  if (q) {
    groups = groups.filter(g => {
      const inTag = (g.tagId || "").toLowerCase().includes(q);
      const inTasks = g.openTasks.some(t => String(t.task || "").toLowerCase().includes(q));
      return inTag || inTasks;
    });
  }

  // summary (use all groups)
  let totalTasks = allTasks.length, open = 0, done = 0, fin = 0;
  for (const g of map.values()) { open += g.open; done += g.done; fin += g.final; }
  if (godSummary) godSummary.textContent = `Tags: ${map.size} · Aufgaben: ${totalTasks} · Offen: ${open} · Erledigt: ${done} · Endkontrolle: ${fin}`;

  godList.innerHTML = "";
  if (!groups.length) {
    godList.innerHTML = `<div class="muted">Keine Treffer.</div>`;
    return;
  }

  for (const g of groups) {
    const det = document.createElement("details");
    det.className = "detailsCard";
    det.open = g.open > 0;

    det.innerHTML = `
      <summary>
        <div class="row space">
          <div><b>🏷️ ${esc(g.tagId)}</b></div>
          <div class="pills">
            <span class="pill">✅ ${g.done}</span>
            <span class="pill">⏳ ${g.open}</span>
            <span class="pill">🧾 ${g.final}</span>
          </div>
        </div>
      </summary>
      <div class="row">
        <button class="btn ghost" data-open="1">Öffnen</button>
        <button class="btn ghost" data-reset="1">Reset Tag</button>
        <button class="btn ghost" data-finalall="1">Final alle ✅</button>
        <button class="btn danger" data-delete="1">Tag löschen</button>
      </div>
      <div class="list" data-list="1"></div>
    `;

    det.querySelector('[data-open="1"]').onclick = () => openTag(g.tagId);
    det.querySelector('[data-reset="1"]').onclick = () => bulkResetTag(g.tagKey, g.tagId);
    det.querySelector('[data-finalall="1"]').onclick = () => bulkFinalAll(g.tagKey, g.tagId);
    det.querySelector('[data-delete="1"]').onclick = () => deleteTagWithTasks(g.tagKey, g.tagId);

    const list = det.querySelector('[data-list="1"]');

    if (!g.openTasks.length) {
      list.innerHTML = `<div class="muted">Keine offenen Aufgaben.</div>`;
    } else {
      g.openTasks.slice(0, 30).forEach(t => {
        const it = document.createElement("div");
        it.className = "item";
        it.innerHTML = `
          <div class="main">
            <div class="title">⏳ ${esc(t.task || "")}</div>
            <div class="sub muted small">${Array.isArray(t.doneBy) && t.doneBy.length ? `Erledigt von: ${esc(t.doneBy.join(", "))}` : ""}</div>
          </div>
          <div class="actions">
            <button class="btn ghost" data-done="1">✅</button>
            <button class="btn ghost" data-edit="1">✏️</button>
            <button class="btn ghost" data-del="1">🗑️</button>
          </div>
        `;

        it.querySelector('[data-done="1"]').onclick = async () => {
          const prev = Array.isArray(t.doneBy) ? t.doneBy : [];
          const merged = Array.from(new Set(prev.concat([meName || n(localStorage.getItem("meName")) || "Admin"])));
          await updateDoc(doc(db, "daily_tasks", t.id), {
            status: "✅",
            doneBy: merged,
            doneAtLast: stamp(),
            updatedAt: serverTimestamp()
          });
        };
        it.querySelector('[data-edit="1"]').onclick = async () => {
          const nt = prompt("Aufgabe:", t.task || "");
          if (nt == null) return;
          await updateDoc(doc(db, "daily_tasks", t.id), { task: n(nt), updatedAt: serverTimestamp() });
        };
        it.querySelector('[data-del="1"]').onclick = async () => {
          if (!confirm("Aufgabe löschen?")) return;
          await deleteDoc(doc(db, "daily_tasks", t.id));
        };

        list.appendChild(it);
      });

      if (g.openTasks.length > 30) {
        const more = document.createElement("div");
        more.className = "muted small";
        more.textContent = `… ${g.openTasks.length - 30} weitere offene Aufgaben (Suche nutzen oder Tag öffnen).`;
        list.appendChild(more);
      }
    }

    godList.appendChild(det);
  }
}

async function bulkResetTag(tagKeyStr, tagIdStr) {
  if (!confirm(`Alle Aufgaben in "${tagIdStr}" zurücksetzen?`)) return;
  const snap = await getDocs(query(collection(db, "daily_tasks"), where("tagKey", "==", tagKeyStr)));
  for (const d of snap.docs) {
    await updateDoc(d.ref, {
      status: "❌",
      doneBy: [],
      doneAtLast: "",
      finalOk: false,
      finalBy: "",
      updatedAt: serverTimestamp()
    });
  }
  alert("Reset ✓");
}

async function bulkFinalAll(tagKeyStr, tagIdStr) {
  if (!confirm(`Endkontrolle für alle ✅ in "${tagIdStr}" setzen?`)) return;
  const snap = await getDocs(query(collection(db, "daily_tasks"), where("tagKey", "==", tagKeyStr)));
  for (const d of snap.docs) {
    const t = d.data();
    if ((t.status || "") === "✅" && !t.finalOk) {
      await updateDoc(d.ref, { finalOk: true, finalBy: meName || "Admin", updatedAt: serverTimestamp() });
    }
  }
  alert("Endkontrolle ✓");
}

async function deleteTagWithTasks(tagKeyStr, tagIdStr) {
  if (!confirm(`Tag "${tagIdStr}" + ALLE Tasks löschen?`)) return;
  const batch = writeBatch(db);

  const tasks = await getDocs(query(collection(db, "daily_tasks"), where("tagKey", "==", tagKeyStr)));
  tasks.docs.forEach(d => batch.delete(d.ref));

  batch.delete(doc(db, "tags", tagKeyStr));
  await batch.commit();

  alert(`Gelöscht ✓ (Tasks: ${tasks.size})`);
}

/* ---------------- day change (archive + clear) ---------------- */
async function runDayChange() {
  if (!isAdmin) { alert("Nur Admin."); return; }
  if (!confirm("Tageswechsel starten?\nArchiviert alle Tasks & Fahrten von HEUTE und leert die Tageslisten.")) return;

  const day = tzDateKey();

  // archive tasks
  const tasks = await getDocs(query(collection(db, "daily_tasks")));
  for (const d of tasks.docs) {
    await setDoc(doc(db, "archives", day, "tasks", d.id), {
      ...d.data(),
      dayKey: day,
      archivedAt: serverTimestamp()
    }, { merge: true });
  }
  await deleteDocsInBatches(tasks.docs.map(d => d.ref));

  // archive rides
  const rides = await getDocs(query(collection(db, "rides_daily", day, "people")));
  for (const d of rides.docs) {
    await setDoc(doc(db, "rides_archives", day, "people", d.id), {
      ...d.data(),
      dayKey: day,
      archivedAt: serverTimestamp()
    }, { merge: true });
  }
  await deleteDocsInBatches(rides.docs.map(d => d.ref));

  alert(`Tageswechsel ✓\nArchiv Tasks: ${tasks.size}\nArchiv Fahrten: ${rides.size}`);
}

async function deleteDocsInBatches(refs) {
  const chunk = 350;
  for (let i = 0; i < refs.length; i += chunk) {
    const b = writeBatch(db);
    refs.slice(i, i + chunk).forEach(r => b.delete(r));
    await b.commit();
  }
}

/* ---------------- PUSH (Android/Chrome best) ---------------- */
/*
  Real push sending requires backend (Cloud Function/Server).
  This client:
  - asks permission
  - retrieves FCM token (needs: messagingSenderId in config + optional vapidKey)
  - stores token in Firestore: push_tokens/{uid}
*/
async function initPushIfPossible(cfgObj) {
  try {
    const supported = await messagingSupported();
    if (!supported) return;

    // Need messagingSenderId for web messaging
    if (!cfgObj.messagingSenderId) return;

    messaging = getMessaging(app);

    // foreground message toast (optional)
    onMessage(messaging, (payload) => {
      // simple alert - you can change to nicer toast if you want
      const title = payload?.notification?.title || "Benachrichtigung";
      const body  = payload?.notification?.body  || "";
      if (body) alert(`${title}\n\n${body}`);
      else alert(title);
    });

    // Auto try (only if permission already granted)
    if (Notification.permission === "granted") {
      await registerAndStoreFcmToken(cfgObj);
    }

    // Add a small button to login view if exists
    // (works on Android Chrome; iOS only when installed to Home Screen)
    if (loginView) {
      let btn = document.getElementById("pushBtn");
      if (!btn) {
        btn = document.createElement("button");
        btn.id = "pushBtn";
        btn.className = "btn ghost";
        btn.textContent = "🔔 Push aktivieren";
        btn.style.marginTop = "10px";
        loginView.appendChild(btn);
      }
      btn.onclick = async () => {
        try {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") { alert("Push nicht erlaubt."); return; }
          await registerAndStoreFcmToken(cfgObj);
          alert("Push aktiviert ✓\n(Hinweis: echtes Senden braucht später eine Cloud Function/Server)");
        } catch (e) {
          alert("Push Fehler: " + (e.message || e));
        }
      };
    }
  } catch (e) {
    // ignore
  }
}

async function registerAndStoreFcmToken(cfgObj) {
  await ensureAnon();

  // use our registered SW (messaging SW)
  const swReg = await navigator.serviceWorker.getRegistration("./");
  const vapidKey = cfgObj.vapidKey || undefined; // optional (recommended for web push)

  const token = await getToken(messaging, {
    serviceWorkerRegistration: swReg || undefined,
    vapidKey
  });

  if (!token) return;

  await setDoc(doc(db, "push_tokens", auth.currentUser.uid), {
    token,
    updatedAt: serverTimestamp(),
    ua: navigator.userAgent,
    platform: "web",
  }, { merge: true });
}
