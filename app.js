import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, getDocs, writeBatch, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================================================
   ULTRA GOD MODE (Zero Setup)
   - Fixed Firebase Config (no setup screen)
   - Anonymous Auth
   - Login via employees_public (dropdown)
   - Auto-seed first employee: Patrick (if list empty)
   - Everyone sees all tags/tasks
   - Admin: manage employees, tags, tasks, final-check, reset, day-change, dashboard
   - Superadmin: can grant up to 3 superadmins and 8 admins
   - Bootstrap: first ever user becomes superadmin (only if none exists)

   FIXES:
   ✅ employees_public stream WITHOUT orderBy + error callback
   ✅ seed Patrick shows errors in UI if rules block writes
   ✅ Brand/title set to "Aufgabenliste ZDL RA 93"
   ========================================================= */

/* ---------------- Firebase config (fixed) ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyCPTt1ZZ-lj5qZ1Rrn-N7e5QZnhtXB-Pu8",
  authDomain: "aufgabenliste-zdl-ra-93.firebaseapp.com",
  projectId: "aufgabenliste-zdl-ra-93",
  storageBucket: "aufgabenliste-zdl-ra-93.firebasestorage.app",
  messagingSenderId: "857214150388",
  appId: "1:857214150388:web:8bc019911092be0cffe0a1",
  measurementId: "G-6MC0G2V2YY"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------------- constants ---------------- */
const MAX_SUPER = 3;
const MAX_ADMIN = 8;
const META_COUNTS_REF = doc(db, "meta", "admin_counts");

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
const show = (el, on) => { if (el) el.classList.toggle("hidden", !on); };
const n = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const esc = (s) => String(s ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const key = (s) => n(s).toLowerCase().replace(/["'„“”]/g,"").replace(/[^a-z0-9äöüß]/g,"");
const stamp = () => {
  const d=new Date(); const p=(x)=>String(x).padStart(2,"0");
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const dayKey = () => {
  const d=new Date(); const p=(x)=>String(x).padStart(2,"0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
};
const uniq = (arr) => Array.from(new Set((arr||[]).map(x=>n(x)).filter(Boolean)));

function setBrand_(){
  try{
    document.title = "Aufgabenliste ZDL RA 93";
    const brandEl = document.querySelector(".brand");
    if(brandEl) brandEl.textContent = "Aufgabenliste ZDL RA 93";
  }catch(e){}
}

function setLoginError_(msg){
  if(loginErr) loginErr.textContent = msg ? String(msg) : "";
}

/* ---------------- DOM ---------------- */
const loginView = $("loginView");
const appView = $("appView");

const whoami = $("whoami");
const reloadBtn = $("reloadBtn");
const logoutBtn = $("logoutBtn");

const nameSel = $("nameSel");
const loginBtn = $("loginBtn");
const loginErr = $("loginErr");

const showUidBtn = $("showUidBtn");
const copyUidBtn = $("copyUidBtn");
const uidBox = $("uidBox");

const tagSearch = $("tagSearch");
const tagList = $("tagList");

const openTagTitle = $("openTagTitle");
const tagMeta = $("tagMeta");
const closeTagBtn = $("closeTagBtn");
const newTaskBtn = $("newTaskBtn");
const taskList = $("taskList");

const dayKeyBadge = $("dayKeyBadge");
const rideNameSel = $("rideNameSel");
const rideEinsatz = $("rideEinsatz");
const addRideBtn = $("addRideBtn");
const rideInfo = $("rideInfo");

const adminBadge = $("adminBadge");
const adminLock = $("adminLock");
const adminArea = $("adminArea");

const empAdd = $("empAdd");
const empAddBtn = $("empAddBtn");
const empList = $("empList");

const tagAdd = $("tagAdd");
const tagAddBtn = $("tagAddBtn");
const adminTagList = $("adminTagList");

const adminUidAdd = $("adminUidAdd");
const adminUidAddBtn = $("adminUidAddBtn");
const adminUidList = $("adminUidList");

const superUidAdd = $("superUidAdd");
const superUidAddBtn = $("superUidAddBtn");
const superUidList = $("superUidList");

const godSearch = $("godSearch");
const toggleOnlyOpenBtn = $("toggleOnlyOpenBtn");
const collapseAllBtn = $("collapseAllBtn");
const dayChangeBtn = $("dayChangeBtn");
const godSummary = $("godSummary");
const godList = $("godList");

/* ---------------- state ---------------- */
let meName = "";
let isAdmin = false;
let isSuperAdmin = false;

let employees = [];
let tags = [];
let allTasks = [];

let currentTagId = "";
let currentTagKey = "";
let onlyOpen = false;

let unsubEmployees=null, unsubTags=null, unsubTasks=null, unsubAllTasks=null, unsubAdmins=null, unsubSupers=null;

/* ---------------- Service Worker ---------------- */
(async ()=>{
  try{
    if("serviceWorker" in navigator){
      await navigator.serviceWorker.register("./sw.js", { scope:"./" });
      // optional (only if file exists)
      try{ await navigator.serviceWorker.register("./firebase-messaging-sw.js", { scope:"./" }); }catch(e){}
    }
  }catch(e){}
})();

/* ---------------- auth helpers ---------------- */
async function ensureAnon_(){
  if(auth.currentUser) return;
  await signInAnonymously(auth);
}

async function alertSafe_(msg){
  try{ alert(msg); }catch(e){}
}

/* ---------------- counts doc ---------------- */
async function ensureCountsDoc_(){
  const snap = await getDoc(META_COUNTS_REF);
  if(!snap.exists()){
    await setDoc(META_COUNTS_REF, { superCount:0, adminCount:0, updatedAt:serverTimestamp() }, { merge:true });
  }
}

async function getCounts_(){
  const snap = await getDoc(META_COUNTS_REF);
  return snap.exists() ? (snap.data()||{}) : { superCount:0, adminCount:0 };
}

async function setCounts_(superCount, adminCount){
  await setDoc(META_COUNTS_REF, {
    superCount: Math.max(0, Number(superCount||0)),
    adminCount: Math.max(0, Number(adminCount||0)),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.uid
  }, { merge:true });
}

async function incCount_(field, delta){
  const snap = await getDoc(META_COUNTS_REF);
  const cur = snap.exists() ? (snap.data()||{}) : {};
  const next = Math.max(0, Number(cur[field]||0) + delta);
  await setDoc(META_COUNTS_REF, { [field]: next, updatedAt:serverTimestamp(), updatedBy:auth.currentUser.uid }, { merge:true });
}

/* ---------------- bootstrap: first superadmin ---------------- */
async function bootstrapSuperAdminOnce_(){
  const q1 = query(collection(db,"superadmins"), where("enabled","==",true), limit(1));
  const snap = await getDocs(q1);
  if(!snap.empty) return;

  await ensureCountsDoc_();

  await setDoc(doc(db,"superadmins",auth.currentUser.uid), {
    enabled:true, addedAt:serverTimestamp(), addedBy:"BOOTSTRAP"
  }, { merge:true });

  // set to at least 1
  const counts = await getCounts_();
  if((counts.superCount||0) < 1){
    await setCounts_(1, counts.adminCount||0);
  }
}

/* ---------------- seed first employee: Patrick ---------------- */
async function seedFirstEmployeeIfEmpty_(){
  try{
    const snap = await getDocs(query(collection(db,"employees_public"), limit(1)));
    if(!snap.empty) return;

    const firstName = "Patrick";
    await setDoc(doc(db,"employees_public", key(firstName)), {
      name: firstName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      seeded: true
    }, { merge:true });
  }catch(e){
    console.error("seedFirstEmployeeIfEmpty_ failed:", e);
    setLoginError_("❌ Mitarbeiterliste konnte nicht erstellt werden (Firestore Rules blockieren Schreiben).");
  }
}

/* ---------------- role refresh ---------------- */
async function refreshRole_(){
  const uid = auth.currentUser.uid;

  const sdoc = await getDoc(doc(db,"superadmins",uid));
  isSuperAdmin = sdoc.exists() && sdoc.data()?.enabled === true;

  const adoc = await getDoc(doc(db,"admins",uid));
  isAdmin = isSuperAdmin || (adoc.exists() && adoc.data()?.enabled !== false);

  const label = `${meName || "—"}${isSuperAdmin ? " · SUPERADMIN" : (isAdmin ? " · ADMIN" : "")}`;
  if(whoami) whoami.textContent = label;

  if(adminBadge) adminBadge.classList.toggle("hidden", !isAdmin);
  show(adminLock, !isAdmin);
  show(adminArea, isAdmin);

  if(adminUidAddBtn) adminUidAddBtn.disabled = !isSuperAdmin;
  if(superUidAddBtn) superUidAddBtn.disabled = !isSuperAdmin;
}

/* ---------------- UI actions ---------------- */
reloadBtn && (reloadBtn.onclick = () => location.reload());

logoutBtn && (logoutBtn.onclick = async () => {
  try{ await signOut(auth); }catch(e){}
  localStorage.removeItem("meName");
  location.reload();
});

showUidBtn && (showUidBtn.onclick = async () => {
  await ensureAnon_();
  const uid = auth.currentUser.uid;
  if(uidBox) uidBox.textContent = uid;
  if(copyUidBtn) copyUidBtn.disabled = false;
  await alertSafe_("UID:\n" + uid);
});

copyUidBtn && (copyUidBtn.onclick = async () => {
  const uid = auth?.currentUser?.uid || "";
  if(!uid) return;
  try{ await navigator.clipboard.writeText(uid); await alertSafe_("UID kopiert ✓"); }
  catch(e){ await alertSafe_(uid); }
});

loginBtn && (loginBtn.onclick = async () => {
  setLoginError_("");
  const nm = n(nameSel?.value);
  if(!nm){
    setLoginError_("Bitte Name wählen.");
    return;
  }

  await ensureAnon_();
  meName = nm;
  localStorage.setItem("meName", nm);

  await setDoc(doc(db,"users",auth.currentUser.uid), { name:nm, updatedAt:serverTimestamp() }, { merge:true });

  await refreshRole_();
  enterApp_();
});

/* rides */
addRideBtn && (addRideBtn.onclick = async () => {
  const nm = n(rideNameSel?.value) || meName || n(localStorage.getItem("meName"));
  const eins = n(rideEinsatz?.value);

  if(!nm){ await alertSafe_("Name fehlt."); return; }
  if(!eins){ await alertSafe_("Einsatznummer fehlt."); return; }

  const d = dayKey();
  const ref = doc(db,"rides_daily",d,"people",key(nm));
  const snap = await getDoc(ref);
  const data = snap.exists()?snap.data():{name:nm,rides:[]};

  const rides = Array.isArray(data.rides) ? data.rides.slice(0) : [];
  rides.push({ einsatz: eins, at: stamp() });

  await setDoc(ref, { name:nm, rides, updatedAt:serverTimestamp() }, { merge:true });

  if(rideEinsatz) rideEinsatz.value = "";
  if(rideInfo) rideInfo.textContent = "Gespeichert ✓";
  setTimeout(()=>{ if(rideInfo) rideInfo.textContent=""; }, 1200);
});

/* admin: add employee */
empAddBtn && (empAddBtn.onclick = async () => {
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  const nm = n(empAdd?.value);
  if(!nm){ await alertSafe_("Name fehlt."); return; }
  await setDoc(doc(db,"employees_public", key(nm)), { name:nm, updatedAt:serverTimestamp() }, { merge:true });
  if(empAdd) empAdd.value = "";
});

/* admin: add tag */
tagAddBtn && (tagAddBtn.onclick = async () => {
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  const tid = n(tagAdd?.value);
  if(!tid){ await alertSafe_("Tag_ID fehlt."); return; }
  await setDoc(doc(db,"tags", key(tid)), { tagId:tid, tagKey:key(tid), updatedAt:serverTimestamp() }, { merge:true });
  if(tagAdd) tagAdd.value = "";
});

/* open/close tag */
closeTagBtn && (closeTagBtn.onclick = () => closeTag_());

/* add task */
newTaskBtn && (newTaskBtn.onclick = async () => {
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  if(!currentTagKey){ await alertSafe_("Erst Tag öffnen."); return; }

  const t = prompt("Neue Aufgabe:");
  if(!t) return;

  await addDoc(collection(db,"daily_tasks"), {
    tagId: currentTagId,
    tagKey: currentTagKey,
    task: n(t),
    status: "❌",
    doneBy: [],
    doneAtLast: "",
    finalOk: false,
    finalBy: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
});

/* superadmin: add admin */
adminUidAddBtn && (adminUidAddBtn.onclick = async () => {
  if(!isSuperAdmin){ await alertSafe_("Nur Super-Admin."); return; }
  const uid = n(adminUidAdd?.value);
  if(!uid){ await alertSafe_("UID fehlt."); return; }

  await ensureCountsDoc_();
  const counts = await getCounts_();
  if((counts.adminCount||0) >= MAX_ADMIN){
    await alertSafe_(`Maximal ${MAX_ADMIN} Admins erreicht.`);
    return;
  }

  await setDoc(doc(db,"admins",uid), { enabled:true, addedAt:serverTimestamp(), addedBy:auth.currentUser.uid }, { merge:true });
  await incCount_("adminCount", +1);

  if(adminUidAdd) adminUidAdd.value = "";
});

/* superadmin: add superadmin */
superUidAddBtn && (superUidAddBtn.onclick = async () => {
  if(!isSuperAdmin){ await alertSafe_("Nur Super-Admin."); return; }
  const uid = n(superUidAdd?.value);
  if(!uid){ await alertSafe_("UID fehlt."); return; }

  await ensureCountsDoc_();
  const counts = await getCounts_();
  if((counts.superCount||0) >= MAX_SUPER){
    await alertSafe_(`Maximal ${MAX_SUPER} Super-Admins erreicht.`);
    return;
  }

  await setDoc(doc(db,"superadmins",uid), { enabled:true, addedAt:serverTimestamp(), addedBy:auth.currentUser.uid }, { merge:true });
  await incCount_("superCount", +1);

  if(superUidAdd) superUidAdd.value = "";
});

/* dashboard controls */
toggleOnlyOpenBtn && (toggleOnlyOpenBtn.onclick = () => {
  onlyOpen = !onlyOpen;
  renderGod_();
});
collapseAllBtn && (collapseAllBtn.onclick = () => {
  if(!godList) return;
  godList.querySelectorAll("details").forEach(d=>d.open=false);
});
dayChangeBtn && (dayChangeBtn.onclick = async () => {
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  if(!confirm("Tageswechsel starten?\nArchiviert Tasks & Fahrten von HEUTE und leert die Tageslisten.")) return;
  await runDayChange_();
});

/* ---------------- render + streams ---------------- */
function enterApp_(){
  show(loginView,false);
  show(appView,true);
}

function renderEmployeeSelectors_(){
  if(!employees.length){
    const msg = "Keine Mitarbeiter (Rules/Permissions?)";
    if(nameSel) nameSel.innerHTML = `<option value="">${esc(msg)}</option>`;
    if(rideNameSel) rideNameSel.innerHTML = `<option value="">${esc(msg)}</option>`;
    return;
  }

  const opts = [`<option value="">Name wählen…</option>`].concat(
    employees.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`)
  ).join("");

  if(nameSel) nameSel.innerHTML = opts;
  if(rideNameSel) rideNameSel.innerHTML = opts;

  const stored = n(localStorage.getItem("meName"));
  if(stored){
    if(nameSel) nameSel.value = stored;
    if(rideNameSel) rideNameSel.value = stored;
  } else {
    const p = employees.find(x => String(x).toLowerCase() === "patrick");
    if(p){
      if(nameSel) nameSel.value = p;
      if(rideNameSel) rideNameSel.value = p;
    }
  }
}

function renderEmployeesAdmin_(){
  if(!empList) return;
  empList.innerHTML = "";
  employees.forEach(name=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main"><div class="title">${esc(name)}</div></div>
      <div class="actions"><button class="btn danger">🗑️</button></div>
    `;
    div.querySelector("button").onclick = async ()=>{
      if(!isAdmin) return;
      if(!confirm(`"${name}" löschen?`)) return;
      await deleteDoc(doc(db,"employees_public", key(name)));
    };
    empList.appendChild(div);
  });
}

function renderTags_(){
  if(!tagList) return;
  const qtxt = n(tagSearch?.value).toLowerCase();

  const list = tags.filter(t=>{
    const tid = String(t.tagId || t.id || "").toLowerCase();
    return !qtxt || tid.includes(qtxt);
  });

  tagList.innerHTML = "";
  if(!list.length){
    tagList.innerHTML = `<div class="muted">Keine Tags.</div>`;
    return;
  }

  list.forEach(t=>{
    const tid = t.tagId || t.id;
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">🏷️ ${esc(tid)}</div>
        <div class="sub muted small">${esc(t.tagKey||t.id||"")}</div>
      </div>
      <div class="actions"><button class="btn ghost">Öffnen</button></div>
    `;
    div.querySelector("button").onclick = ()=>openTag_(tid);
    tagList.appendChild(div);
  });
}

function renderAdminTags_(){
  if(!adminTagList) return;
  adminTagList.innerHTML = "";
  tags.forEach(t=>{
    const tid = t.tagId || t.id;
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">🏷️ ${esc(tid)}</div>
        <div class="sub muted small">${esc(t.id)}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-open="1">Öffnen</button>
        <button class="btn danger" data-del="1">Löschen</button>
      </div>
    `;
    div.querySelector('[data-open="1"]').onclick = ()=>openTag_(tid);
    div.querySelector('[data-del="1"]').onclick = ()=>deleteTagWithTasks_(t.id, tid);
    adminTagList.appendChild(div);
  });
}

/* ---------------- Tag + tasks ---------------- */
async function openTag_(tagId){
  currentTagId = n(tagId);
  currentTagKey = key(currentTagId);

  if(openTagTitle) openTagTitle.textContent = `Tag: ${currentTagId}`;
  if(tagMeta) tagMeta.textContent = `tagKey: ${currentTagKey}`;

  if(unsubTasks) unsubTasks();
  unsubTasks = onSnapshot(
    query(collection(db,"daily_tasks"), where("tagKey","==",currentTagKey), orderBy("task")),
    (snap)=>{
      const tasks = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderTasks_(tasks);
    }
  );
}

function closeTag_(){
  currentTagId = "";
  currentTagKey = "";
  if(openTagTitle) openTagTitle.textContent = "Kein Tag geöffnet";
  if(tagMeta) tagMeta.textContent = "";
  if(taskList) taskList.innerHTML = "";
  if(unsubTasks){ unsubTasks(); unsubTasks=null; }
}

function renderTasks_(tasks){
  if(!taskList) return;
  taskList.innerHTML = "";

  if(!tasks.length){
    taskList.innerHTML = `<div class="muted">Keine Aufgaben.</div>`;
    return;
  }

  tasks.forEach(t=>{
    const doneByTxt = Array.isArray(t.doneBy) ? t.doneBy.join(", ") : "";
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="main">
        <div class="title">${t.status==="✅"?"✅":"⏳"} ${esc(t.task||"")}</div>
        <div class="sub muted small">
          ${doneByTxt ? `Erledigt von: ${esc(doneByTxt)}` : ""}
          ${t.finalOk ? ` · 🧾 Endkontrolle: ${esc(t.finalBy||"")}` : ""}
        </div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-done="1">${t.status==="✅"?"↩️":"✅"}</button>
        ${isAdmin ? `
          <button class="btn ghost" data-final="1">🧾</button>
          <button class="btn ghost" data-edit="1">✏️</button>
          <button class="btn danger" data-del="1">🗑️</button>
        ` : ``}
      </div>
    `;

    div.querySelector('[data-done="1"]').onclick = async ()=>{
      const nm = meName || n(localStorage.getItem("meName"));
      if(!nm){ await alertSafe_("Bitte einloggen."); return; }

      if(t.status !== "✅"){
        const merged = uniq([...(Array.isArray(t.doneBy)?t.doneBy:[]), nm]);
        await updateDoc(doc(db,"daily_tasks",t.id), {
          status:"✅",
          doneBy: merged,
          doneAtLast: stamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        if(!isAdmin){ await alertSafe_("Nur Admin kann zurücksetzen."); return; }
        await updateDoc(doc(db,"daily_tasks",t.id), {
          status:"❌",
          doneBy: [],
          doneAtLast: "",
          finalOk: false,
          finalBy: "",
          updatedAt: serverTimestamp()
        });
      }
    };

    if(isAdmin){
      div.querySelector('[data-final="1"]').onclick = async ()=>{
        if(t.status!=="✅"){ await alertSafe_("Endkontrolle nur bei ✅."); return; }
        await updateDoc(doc(db,"daily_tasks",t.id), {
          finalOk: !t.finalOk,
          finalBy: meName || "Admin",
          updatedAt: serverTimestamp()
        });
      };

      div.querySelector('[data-edit="1"]').onclick = async ()=>{
        const nt = prompt("Aufgabe:", t.task || "");
        if(nt == null) return;
        await updateDoc(doc(db,"daily_tasks",t.id), { task:n(nt), updatedAt:serverTimestamp() });
      };

      div.querySelector('[data-del="1"]').onclick = async ()=>{
        if(!confirm("Aufgabe löschen?")) return;
        await deleteDoc(doc(db,"daily_tasks",t.id));
      };
    }

    taskList.appendChild(div);
  });
}

/* ---------------- Ultra Dashboard ---------------- */
function renderGod_(){
  if(!isAdmin){
    if(godSummary) godSummary.textContent = "";
    if(godList) godList.innerHTML = "";
    return;
  }

  const qtxt = n(godSearch?.value).toLowerCase();
  const map = new Map();

  for(const t of allTasks){
    const tk = t.tagKey || "";
    if(!tk) continue;

    if(!map.has(tk)){
      map.set(tk, { tagKey:tk, tagId:t.tagId||tk, done:0, open:0, final:0, openTasks:[] });
    }
    const g = map.get(tk);

    if((t.status||"❌")==="✅") g.done++;
    else { g.open++; g.openTasks.push(t); }

    if(t.finalOk) g.final++;
    if(t.tagId) g.tagId = t.tagId;
  }

  let groups = [...map.values()].sort((a,b)=>(a.tagId||"").localeCompare(b.tagId||""));
  if(onlyOpen) groups = groups.filter(g=>g.open>0);
  if(qtxt){
    groups = groups.filter(g=>{
      const inTag = (g.tagId||"").toLowerCase().includes(qtxt);
      const inTask = g.openTasks.some(t=>String(t.task||"").toLowerCase().includes(qtxt));
      return inTag || inTask;
    });
  }

  let open=0, done=0, fin=0;
  for(const g of map.values()){ open+=g.open; done+=g.done; fin+=g.final; }
  if(godSummary) godSummary.textContent = `Tags: ${map.size} · Aufgaben: ${allTasks.length} · Offen: ${open} · Erledigt: ${done} · Endkontrolle: ${fin}`;

  if(!godList) return;
  godList.innerHTML = "";
  if(!groups.length){
    godList.innerHTML = `<div class="muted">Keine Treffer.</div>`;
    return;
  }

  for(const g of groups){
    const det = document.createElement("details");
    det.className = "detailsCard";
    det.open = g.open > 0;

    det.innerHTML = `
      <summary>
        <div class="row between">
          <div><b>🏷️ ${esc(g.tagId)}</b></div>
          <div class="row">
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

    det.querySelector('[data-open="1"]').onclick = ()=>openTag_(g.tagId);
    det.querySelector('[data-reset="1"]').onclick = ()=>bulkResetTag_(g.tagKey, g.tagId);
    det.querySelector('[data-finalall="1"]').onclick = ()=>bulkFinalAll_(g.tagKey, g.tagId);
    det.querySelector('[data-delete="1"]').onclick = ()=>deleteTagWithTasks_(g.tagKey, g.tagId);

    const list = det.querySelector('[data-list="1"]');

    if(!g.openTasks.length){
      list.innerHTML = `<div class="muted">Keine offenen Aufgaben.</div>`;
    }else{
      g.openTasks.slice(0,30).forEach(t=>{
        const it = document.createElement("div");
        it.className = "item";
        it.innerHTML = `
          <div class="main">
            <div class="title">⏳ ${esc(t.task||"")}</div>
            <div class="sub muted small">${Array.isArray(t.doneBy)&&t.doneBy.length?`Erledigt von: ${esc(t.doneBy.join(", "))}`:""}</div>
          </div>
          <div class="actions">
            <button class="btn ghost" data-done="1">✅</button>
            <button class="btn ghost" data-edit="1">✏️</button>
            <button class="btn danger" data-del="1">🗑️</button>
          </div>
        `;
        it.querySelector('[data-done="1"]').onclick = async ()=>{
          const merged = uniq([...(Array.isArray(t.doneBy)?t.doneBy:[]), meName||"Admin"]);
          await updateDoc(doc(db,"daily_tasks",t.id), { status:"✅", doneBy:merged, doneAtLast:stamp(), updatedAt:serverTimestamp() });
        };
        it.querySelector('[data-edit="1"]').onclick = async ()=>{
          const nt = prompt("Aufgabe:", t.task || "");
          if(nt==null) return;
          await updateDoc(doc(db,"daily_tasks",t.id), { task:n(nt), updatedAt:serverTimestamp() });
        };
        it.querySelector('[data-del="1"]').onclick = async ()=>{
          if(!confirm("Aufgabe löschen?")) return;
          await deleteDoc(doc(db,"daily_tasks",t.id));
        };
        list.appendChild(it);
      });

      if(g.openTasks.length > 30){
        const more = document.createElement("div");
        more.className = "muted small";
        more.textContent = `… ${g.openTasks.length-30} weitere offene Aufgaben (Suche nutzen oder Tag öffnen).`;
        list.appendChild(more);
      }
    }

    godList.appendChild(det);
  }
}

async function bulkResetTag_(tagKeyStr, tagIdStr){
  if(!confirm(`Alle Aufgaben in "${tagIdStr}" zurücksetzen?`)) return;
  const snap = await getDocs(query(collection(db,"daily_tasks"), where("tagKey","==",tagKeyStr)));
  for(const d of snap.docs){
    await updateDoc(d.ref, { status:"❌", doneBy:[], doneAtLast:"", finalOk:false, finalBy:"", updatedAt:serverTimestamp() });
  }
  await alertSafe_("Reset ✓");
}

async function bulkFinalAll_(tagKeyStr, tagIdStr){
  if(!confirm(`Endkontrolle für alle ✅ in "${tagIdStr}" setzen?`)) return;
  const snap = await getDocs(query(collection(db,"daily_tasks"), where("tagKey","==",tagKeyStr)));
  for(const d of snap.docs){
    const t = d.data();
    if((t.status||"") === "✅" && !t.finalOk){
      await updateDoc(d.ref, { finalOk:true, finalBy:meName||"Admin", updatedAt:serverTimestamp() });
    }
  }
  await alertSafe_("Endkontrolle ✓");
}

async function deleteTagWithTasks_(tagKeyStr, tagIdStr){
  if(!confirm(`Tag "${tagIdStr}" + ALLE Tasks löschen?`)) return;

  const batch = writeBatch(db);

  const tasks = await getDocs(query(collection(db,"daily_tasks"), where("tagKey","==",tagKeyStr)));
  tasks.docs.forEach(d=>batch.delete(d.ref));

  batch.delete(doc(db,"tags",tagKeyStr));
  await batch.commit();

  await alertSafe_(`Gelöscht ✓ (Tasks: ${tasks.size})`);
}

/* ---------------- Day change: archive + clear ---------------- */
async function runDayChange_(){
  const d = dayKey();

  // archive tasks
  const tasks = await getDocs(query(collection(db,"daily_tasks")));
  for(const docu of tasks.docs){
    await setDoc(doc(db,"archives",d,"tasks",docu.id), { ...docu.data(), dayKey:d, archivedAt:serverTimestamp() }, { merge:true });
  }
  await deleteDocsInBatches_(tasks.docs.map(x=>x.ref));

  // archive rides (today)
  const rides = await getDocs(query(collection(db,"rides_daily",d,"people")));
  for(const docu of rides.docs){
    await setDoc(doc(db,"rides_archives",d,"people",docu.id), { ...docu.data(), dayKey:d, archivedAt:serverTimestamp() }, { merge:true });
  }
  await deleteDocsInBatches_(rides.docs.map(x=>x.ref));

  await alertSafe_(`Tageswechsel ✓\nArchiv Tasks: ${tasks.size}\nArchiv Fahrten: ${rides.size}`);
}

async function deleteDocsInBatches_(refs){
  const chunk = 350;
  for(let i=0;i<refs.length;i+=chunk){
    const b = writeBatch(db);
    refs.slice(i,i+chunk).forEach(r=>b.delete(r));
    await b.commit();
  }
}

/* ---------------- Admin lists render + remove ---------------- */
function renderAdmins_(rows){
  if(!adminUidList) return;
  adminUidList.innerHTML = "";

  if(!rows.length){
    adminUidList.innerHTML = `<div class="muted">Keine Admins.</div>`;
    return;
  }

  rows.forEach(r=>{
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="main">
        <div class="title">ADMIN UID: ${esc(r.id)}</div>
        <div class="sub muted small">enabled: ${String(r.enabled !== false)}</div>
      </div>
      <div class="actions">
        <button class="btn danger">Entfernen</button>
      </div>
    `;
    div.querySelector("button").onclick = async ()=>{
      if(!isSuperAdmin){ await alertSafe_("Nur Super-Admin."); return; }
      if(!confirm("Admin entfernen?")) return;
      await deleteDoc(doc(db,"admins",r.id));
      await incCount_("adminCount", -1);
    };
    adminUidList.appendChild(div);
  });
}

function renderSuperAdmins_(rows){
  if(!superUidList) return;
  superUidList.innerHTML = "";

  if(!rows.length){
    superUidList.innerHTML = `<div class="muted">Keine Super-Admins?</div>`;
    return;
  }

  rows.forEach(r=>{
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="main">
        <div class="title">SUPERADMIN UID: ${esc(r.id)}</div>
        <div class="sub muted small">enabled: ${String(r.enabled === true)}</div>
      </div>
      <div class="actions">
        <button class="btn danger">Entfernen</button>
      </div>
    `;
    div.querySelector("button").onclick = async ()=>{
      if(!isSuperAdmin){ await alertSafe_("Nur Super-Admin."); return; }

      const counts = await getCounts_();
      if((counts.superCount||0) <= 1){
        await alertSafe_("Mindestens 1 Super-Admin muss bleiben.");
        return;
      }

      if(!confirm("Super-Admin entfernen?")) return;
      await deleteDoc(doc(db,"superadmins",r.id));
      await incCount_("superCount", -1);
    };
    superUidList.appendChild(div);
  });
}

/* ---------------- streams ---------------- */
async function startStreams_(){
  // employees (FIXED: no orderBy + error callback)
  if(unsubEmployees) unsubEmployees();
  unsubEmployees = onSnapshot(
    collection(db,"employees_public"),
    (snap)=>{
      employees = snap.docs.map(d=>n(d.data()?.name)).filter(Boolean).sort((a,b)=>a.localeCompare(b));
      renderEmployeeSelectors_();
      if(isAdmin) renderEmployeesAdmin_();
      if(!employees.length){
        setLoginError_("❌ Keine Mitarbeiter sichtbar. Prüfe Firestore Rules / Permissions.");
      }else{
        setLoginError_("");
      }
    },
    (err)=>{
      console.error("employees_public snapshot error:", err);
      setLoginError_("❌ Zugriff auf Mitarbeiterliste verweigert (Firestore Rules).");
      employees = [];
      renderEmployeeSelectors_();
    }
  );

  // tags
  if(unsubTags) unsubTags();
  unsubTags = onSnapshot(query(collection(db,"tags"), orderBy("tagId")),
    (snap)=>{
      tags = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderTags_();
      if(isAdmin) renderAdminTags_();
    }
  );

  // tasks global (dashboard)
  if(unsubAllTasks) unsubAllTasks();
  unsubAllTasks = onSnapshot(query(collection(db,"daily_tasks"), orderBy("tagKey"), orderBy("task")),
    (snap)=>{
      allTasks = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderGod_();
    }
  );

  // admins
  if(unsubAdmins) unsubAdmins();
  unsubAdmins = onSnapshot(query(collection(db,"admins"), orderBy("addedAt")),
    (snap)=>{
      if(!isAdmin){ if(adminUidList) adminUidList.innerHTML=""; return; }
      const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderAdmins_(rows);
    }
  );

  // superadmins
  if(unsubSupers) unsubSupers();
  unsubSupers = onSnapshot(query(collection(db,"superadmins"), orderBy("addedAt")),
    (snap)=>{
      if(!isAdmin){ if(superUidList) superUidList.innerHTML=""; return; }
      const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderSuperAdmins_(rows);
    }
  );

  if(tagSearch) tagSearch.oninput = ()=>renderTags_();
  if(godSearch) godSearch.oninput = ()=>renderGod_();
}

/* ---------------- init ---------------- */
onAuthStateChanged(auth, async ()=>{
  setBrand_();
  await ensureAnon_();

  if(dayKeyBadge) dayKeyBadge.textContent = dayKey();

  await ensureCountsDoc_();
  await bootstrapSuperAdminOnce_();
  await seedFirstEmployeeIfEmpty_();

  const stored = n(localStorage.getItem("meName"));
  if(stored) meName = stored;

  await refreshRole_();
  await startStreams_();

  if(meName){
    enterApp_();
  } else {
    show(loginView,true);
    show(appView,false);
  }
});
