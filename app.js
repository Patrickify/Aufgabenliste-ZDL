import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, getDocs,
  writeBatch, limit, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =========================================================
  ULTRA PRO UI — Aufgabenliste ZDL RA 93
  - Fixed Firebase config (no setup screen)
  - Anonymous Auth
  - Login via employees_public (dropdown)
  - Auto-seed first employee: Patrick (if list empty)
  - Everyone sees all tags
  - Normal users see only OPEN tasks (✅ hidden by rules + query)
  - Mark Done: multi selection (prompt)
  - Points are booked ONLY when Admin toggles Endkontrolle (finalOk)
  - Endkontrolle on: +1 per person in doneBy (once; pointsBooked/bookedFor)
  - Endkontrolle off: -1 per bookedFor
  - Admin area separated with subtabs
  - Weekly templates + Today extras
  - Day change: archive + clear + regenerate from weekly + today extras
  - Auto day change: runs when first admin opens after midnight
========================================================= */

/* ---------------- Firebase config (FIX) ---------------- */
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
const META_DAY_REF = doc(db, "meta", "current_day");

/* ---------------- helpers ---------------- */
const $ = (id) => document.getElementById(id);
const show = (el, on) => { if (el) el.classList.toggle("hidden", !on); };
const n = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const esc = (s) => String(s ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const key = (s) => n(s).toLowerCase().replace(/["'„“”]/g,"").replace(/[^a-z0-9äöüß]/g,"");
const uniq = (arr) => Array.from(new Set((arr||[]).map(x=>n(x)).filter(Boolean)));

const stamp = () => {
  const d=new Date(); const p=(x)=>String(x).padStart(2,"0");
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const dayKey = () => {
  const d=new Date(); const p=(x)=>String(x).padStart(2,"0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
};
const weekday = () => new Date().getDay(); // 0=Sun..6=Sat

async function alertSafe_(msg){ try{ alert(msg); }catch(e){} }

/* ---------------- DOM ---------------- */
const loginView = $("loginView");
const appView   = $("appView");

const whoami    = $("whoami");
const reloadBtn = $("reloadBtn");
const logoutBtn = $("logoutBtn");

const nameSel   = $("nameSel");
const loginBtn  = $("loginBtn");
const loginErr  = $("loginErr");

const showUidBtn = $("showUidBtn");
const copyUidBtn = $("copyUidBtn");
const uidBox     = $("uidBox");

const tagSearch = $("tagSearch");
const tagList   = $("tagList");

const openTagTitle = $("openTagTitle");
const tagMeta      = $("tagMeta");
const closeTagBtn  = $("closeTagBtn");
const newTaskBtn   = $("newTaskBtn");
const taskList     = $("taskList");

/* rides */
const dayKeyBadge = $("dayKeyBadge");
const rideNameSel = $("rideNameSel");
const rideEinsatz = $("rideEinsatz");
const addRideBtn  = $("addRideBtn");
const rideInfo    = $("rideInfo");
const ridesList   = $("ridesList");

/* tabs */
const tabs = Array.from(document.querySelectorAll(".tab"));
const pages = {
  tasks: $("page_tasks"),
  rides: $("page_rides"),
  admin: $("page_admin")
};

/* admin */
const adminBadge = $("adminBadge");
const adminLock  = $("adminLock");
const adminArea  = $("adminArea");

const subtabs = Array.from(document.querySelectorAll(".subtab"));
const subpages = {
  employees: $("sub_employees"),
  tags: $("sub_tags"),
  tools: $("sub_tools"),
  points: $("sub_points"),
  roles: $("sub_roles"),
  day: $("sub_day")
};

const empAdd    = $("empAdd");
const empAddBtn = $("empAddBtn");
const empList   = $("empList");

const tagAdd    = $("tagAdd");
const tagAddBtn = $("tagAddBtn");
const adminTagList = $("adminTagList");

const weekdaySel = $("weekdaySel");
const tplTagId   = $("tplTagId");
const tplTask    = $("tplTask");
const addTemplateBtn = $("addTemplateBtn");
const templatesList  = $("templatesList");

const todayTagId = $("todayTagId");
const todayTask  = $("todayTask");
const addTodayBtn = $("addTodayBtn");
const todayExtraList = $("todayExtraList");

const godSearch = $("godSearch");
const toggleOnlyOpenBtn = $("toggleOnlyOpenBtn");
const collapseAllBtn = $("collapseAllBtn");
const godSummary = $("godSummary");
const godList = $("godList");

const refreshPointsBtn = $("refreshPointsBtn");
const pointsList = $("pointsList");

const adminUidAdd = $("adminUidAdd");
const adminUidAddBtn = $("adminUidAddBtn");
const adminUidList = $("adminUidList");

const superUidAdd = $("superUidAdd");
const superUidAddBtn = $("superUidAddBtn");
const superUidList = $("superUidList");

const dayChangeBtn = $("dayChangeBtn");
const dayInfo = $("dayInfo");

/* ---------------- state ---------------- */
let meName = "";
let isAdmin = false;
let isSuperAdmin = false;

let employees = [];
let tags = [];
let allTasks = []; // for admin dashboard

let currentTagId = "";
let currentTagKey = "";
let onlyOpen = false;

let unsubEmployees=null, unsubTags=null, unsubTasks=null, unsubAllTasks=null;
let unsubAdmins=null, unsubSupers=null, unsubRides=null;
let unsubTemplates=null, unsubTodayExtras=null, unsubPoints=null;

/* ---------------- SW ---------------- */
(async ()=>{
  try{
    if("serviceWorker" in navigator){
      await navigator.serviceWorker.register("./sw.js", { scope:"./" });
    }
  }catch(e){}
})();

/* ---------------- auth helpers ---------------- */
async function ensureAnon_(){
  if(auth.currentUser) return;
  await signInAnonymously(auth);
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

async function incCount_(field, delta){
  const snap = await getDoc(META_COUNTS_REF);
  const cur = snap.exists() ? (snap.data()||{}) : {};
  const next = Math.max(0, Number(cur[field]||0) + delta);
  await setDoc(META_COUNTS_REF, { [field]: next, updatedAt:serverTimestamp(), updatedBy: auth.currentUser.uid }, { merge:true });
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

  const counts = await getCounts_();
  if((counts.superCount||0) < 1){
    await setDoc(META_COUNTS_REF, { superCount: 1, adminCount: counts.adminCount||0, updatedAt:serverTimestamp() }, { merge:true });
  }
}

/* ---------------- seed first employee: Patrick ---------------- */
async function seedFirstEmployeeIfEmpty_(){
  const snap = await getDocs(query(collection(db,"employees_public"), limit(1)));
  if(!snap.empty) return;

  const firstName = "Patrick";
  await setDoc(doc(db,"employees_public", key(firstName)), {
    name:firstName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    seeded:true
  }, { merge:true });
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

/* ---------------- UI: tabs ---------------- */
function setTab_(name){
  tabs.forEach(b=>b.classList.toggle("active", b.dataset.tab === name));
  Object.keys(pages).forEach(k=>show(pages[k], k === name));
}
tabs.forEach(b=>{
  b.onclick = ()=>setTab_(b.dataset.tab);
});

function setSubtab_(name){
  subtabs.forEach(b=>b.classList.toggle("active", b.dataset.sub === name));
  Object.keys(subpages).forEach(k=>show(subpages[k], k === name));
}
subtabs.forEach(b=>{
  b.onclick = ()=>setSubtab_(b.dataset.sub);
});

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
  loginErr && (loginErr.textContent = "");
  const nm = n(nameSel?.value);
  if(!nm){
    if(loginErr) loginErr.textContent = "Bitte Name wählen.";
    return;
  }

  await ensureAnon_();
  meName = nm;
  localStorage.setItem("meName", nm);

  await setDoc(doc(db,"users",auth.currentUser.uid), { name:nm, updatedAt:serverTimestamp() }, { merge:true });

  await refreshRole_();
  enterApp_();
});

/* ---------------- rides ---------------- */
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

/* ---------------- admin actions ---------------- */
empAddBtn && (empAddBtn.onclick = async () => {
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  const nm = n(empAdd?.value);
  if(!nm){ await alertSafe_("Name fehlt."); return; }
  await setDoc(doc(db,"employees_public", key(nm)), { name:nm, updatedAt:serverTimestamp() }, { merge:true });
  if(empAdd) empAdd.value = "";
});

tagAddBtn && (tagAddBtn.onclick = async () => {
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  const tid = n(tagAdd?.value);
  if(!tid){ await alertSafe_("Tag_ID fehlt."); return; }
  await setDoc(doc(db,"tags", key(tid)), { tagId:tid, tagKey:key(tid), updatedAt:serverTimestamp() }, { merge:true });
  if(tagAdd) tagAdd.value = "";
});

addTemplateBtn && (addTemplateBtn.onclick = async () => {
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }

  const wd = Number(weekdaySel?.value);
  const tid = n(tplTagId?.value);
  const task = n(tplTask?.value);
  if(tid === "" || task === "" || isNaN(wd)){
    await alertSafe_("Bitte Wochentag, Tag_ID und Aufgabe ausfüllen.");
    return;
  }

  await addDoc(collection(db,"task_templates_weekly"), {
    weekday: wd,
    tagId: tid,
    tagKey: key(tid),
    task,
    updatedAt: serverTimestamp()
  });

  if(tplTask) tplTask.value = "";
});

addTodayBtn && (addTodayBtn.onclick = async () => {
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }

  const tid = n(todayTagId?.value);
  const task = n(todayTask?.value);
  if(tid === "" || task === ""){
    await alertSafe_("Bitte Tag_ID und Aufgabe ausfüllen.");
    return;
  }

  await addDoc(collection(db,"task_extras_today"), {
    day: dayKey(),
    tagId: tid,
    tagKey: key(tid),
    task,
    updatedAt: serverTimestamp()
  });

  if(todayTask) todayTask.value = "";
});

adminUidAddBtn && (adminUidAddBtn.onclick = async ()=>{
  if(!isSuperAdmin){ await alertSafe_("Nur Superadmin."); return; }
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

superUidAddBtn && (superUidAddBtn.onclick = async ()=>{
  if(!isSuperAdmin){ await alertSafe_("Nur Superadmin."); return; }
  const uid = n(superUidAdd?.value);
  if(!uid){ await alertSafe_("UID fehlt."); return; }

  await ensureCountsDoc_();
  const counts = await getCounts_();
  if((counts.superCount||0) >= MAX_SUPER){
    await alertSafe_(`Maximal ${MAX_SUPER} Superadmins erreicht.`);
    return;
  }

  await setDoc(doc(db,"superadmins",uid), { enabled:true, addedAt:serverTimestamp(), addedBy:auth.currentUser.uid }, { merge:true });
  await incCount_("superCount", +1);
  if(superUidAdd) superUidAdd.value = "";
});

dayChangeBtn && (dayChangeBtn.onclick = async ()=>{
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  if(!confirm("Tageswechsel starten?\nArchiviert Tasks & Fahrten (heute) und erstellt neue Aufgaben.")) return;
  await runDayChange_({manual:true});
});

/* ---------------- tasks ---------------- */
closeTagBtn && (closeTagBtn.onclick = () => closeTag_());

newTaskBtn && (newTaskBtn.onclick = async ()=>{
  // Heute-Task: Admin only
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  if(!currentTagKey){ await alertSafe_("Erst Tag öffnen."); return; }

  const t = prompt("Neue Aufgabe (nur heute):");
  if(!t) return;

  await addDoc(collection(db,"daily_tasks"), {
    day: dayKey(),
    tagId: currentTagId,
    tagKey: currentTagKey,
    task: n(t),
    status:"❌",
    doneBy: [],
    doneAtLast:"",
    finalOk:false,
    finalBy:"",
    pointsBooked:false,
    bookedFor:[],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
});

/* Mark done with multi-select prompt (ALL users) */
async function markDoneMulti_(task){
  const nmDefault = meName || n(localStorage.getItem("meName")) || "";
  const raw = prompt("Wer hat diese Aufgabe erledigt?\nMehrere Namen mit Komma trennen:", nmDefault);
  if(raw == null) return;

  const selected = uniq(raw.split(",").map(x=>n(x)));
  if(!selected.length){
    await alertSafe_("Bitte mindestens 1 Mitarbeiter auswählen.");
    return;
  }

  // Normal users are only allowed to update limited fields & only once.
  await updateDoc(doc(db,"daily_tasks",task.id), {
    status:"✅",
    doneBy: selected,
    doneAtLast: stamp(),
    updatedAt: serverTimestamp()
  });
}

/* Admin: toggle Endkontrolle & book/unbook points (transaction) */
async function toggleFinalAndPoints_(taskId){
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }

  const ref = doc(db,"daily_tasks",taskId);

  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    if(!snap.exists()) return;
    const t = snap.data() || {};

    if((t.status||"❌") !== "✅"){
      throw new Error("Endkontrolle nur bei erledigten Aufgaben.");
    }

    const names = Array.isArray(t.doneBy) ? uniq(t.doneBy) : [];
    const finalNow = !t.finalOk;

    // toggle final
    tx.update(ref, {
      finalOk: finalNow,
      finalBy: finalNow ? (meName || "Admin") : "",
      updatedAt: serverTimestamp()
    });

    // book points only when turning ON
    if(finalNow && !t.pointsBooked){
      for(const nm of names){
        const pRef = doc(db,"points", key(nm));
        const pSnap = await tx.get(pRef);
        const cur = pSnap.exists() ? (pSnap.data()||{}) : {};
        const old = Number(cur.taskPoints||0)||0;

        tx.set(pRef, { name:nm, taskPoints: old + 1, updatedAt:serverTimestamp() }, { merge:true });
      }
      tx.update(ref, { pointsBooked:true, bookedFor:names });
    }

    // unbook points when turning OFF
    if(!finalNow && t.pointsBooked){
      const booked = Array.isArray(t.bookedFor) ? uniq(t.bookedFor) : [];
      for(const nm of booked){
        const pRef = doc(db,"points", key(nm));
        const pSnap = await tx.get(pRef);
        const cur = pSnap.exists() ? (pSnap.data()||{}) : {};
        const old = Number(cur.taskPoints||0)||0;

        tx.set(pRef, { name:nm, taskPoints: Math.max(0, old - 1), updatedAt:serverTimestamp() }, { merge:true });
      }
      tx.update(ref, { pointsBooked:false, bookedFor:[] });
    }
  });
}

/* Admin reset */
async function resetTask_(taskId){
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  const ref = doc(db,"daily_tasks",taskId);

  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(ref);
    if(!snap.exists()) return;
    const t = snap.data() || {};

    // If points booked, undo (like final off)
    if(t.pointsBooked){
      const booked = Array.isArray(t.bookedFor) ? uniq(t.bookedFor) : [];
      for(const nm of booked){
        const pRef = doc(db,"points", key(nm));
        const pSnap = await tx.get(pRef);
        const cur = pSnap.exists() ? (pSnap.data()||{}) : {};
        const old = Number(cur.taskPoints||0)||0;
        tx.set(pRef, { name:nm, taskPoints: Math.max(0, old - 1), updatedAt:serverTimestamp() }, { merge:true });
      }
    }

    tx.update(ref,{
      status:"❌",
      doneBy:[],
      doneAtLast:"",
      finalOk:false,
      finalBy:"",
      pointsBooked:false,
      bookedFor:[],
      updatedAt: serverTimestamp()
    });
  });
}

/* Admin edit task text */
async function editTask_(taskId, current){
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  const nt = prompt("Aufgabe:", current || "");
  if(nt == null) return;
  await updateDoc(doc(db,"daily_tasks",taskId), { task:n(nt), updatedAt:serverTimestamp() });
}

/* Admin delete task */
async function deleteTask_(taskId){
  if(!isAdmin){ await alertSafe_("Nur Admin."); return; }
  if(!confirm("Aufgabe löschen?")) return;
  await deleteDoc(doc(db,"daily_tasks",taskId));
}

/* open tag */
async function openTag_(tagId){
  currentTagId = n(tagId);
  currentTagKey = key(currentTagId);

  if(openTagTitle) openTagTitle.textContent = `Tag: ${currentTagId}`;
  if(tagMeta) tagMeta.textContent = `tagKey: ${currentTagKey}`;

  if(unsubTasks) unsubTasks();

  // IMPORTANT:
  // Normal users: only open tasks (status == ❌) — matches rules
  // Admin: see all tasks
  const qTasks = isAdmin
    ? query(collection(db,"daily_tasks"),
        where("tagKey","==",currentTagKey),
        orderBy("task"))
    : query(collection(db,"daily_tasks"),
        where("tagKey","==",currentTagKey),
        where("status","==","❌"),
        orderBy("task"));

  unsubTasks = onSnapshot(qTasks, (snap)=>{
    const tasks = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderTasks_(tasks);
  });
}

function closeTag_(){
  currentTagId = "";
  currentTagKey = "";
  if(openTagTitle) openTagTitle.textContent = "Kein Tag geöffnet";
  if(tagMeta) tagMeta.textContent = "";
  if(taskList) taskList.innerHTML = "";
  if(unsubTasks){ unsubTasks(); unsubTasks=null; }
}

/* render tasks list */
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

    const statusIcon = (t.status==="✅") ? "✅" : "⏳";
    const finalTxt = t.finalOk ? ` · 🧾 Endkontrolle: ${esc(t.finalBy||"")}` : "";

    div.innerHTML = `
      <div class="main">
        <div class="title">${statusIcon} ${esc(t.task||"")}</div>
        <div class="sub muted small">
          ${doneByTxt ? `Erledigt von: ${esc(doneByTxt)}` : ""}
          ${finalTxt}
        </div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-done="1">✅</button>
        ${isAdmin ? `
          <button class="btn ghost" data-final="1">🧾</button>
          <button class="btn ghost" data-reset="1">↩️</button>
          <button class="btn ghost" data-edit="1">✏️</button>
          <button class="btn danger" data-del="1">🗑️</button>
        ` : ``}
      </div>
    `;

    // user done (only if open; done tasks not visible to users anyway)
    div.querySelector('[data-done="1"]').onclick = async ()=>{
      if((t.status||"❌")==="✅"){
        await alertSafe_("Schon erledigt.");
        return;
      }
      try{
        await markDoneMulti_(t);
      }catch(e){
        await alertSafe_("Fehler: " + (e?.message||String(e)));
      }
    };

    if(isAdmin){
      div.querySelector('[data-final="1"]').onclick = async ()=>{
        try{ await toggleFinalAndPoints_(t.id); }
        catch(e){ await alertSafe_("Fehler: " + (e?.message||String(e))); }
      };
      div.querySelector('[data-reset="1"]').onclick = async ()=>{
        try{ await resetTask_(t.id); }
        catch(e){ await alertSafe_("Fehler: " + (e?.message||String(e))); }
      };
      div.querySelector('[data-edit="1"]').onclick = async ()=>{
        try{ await editTask_(t.id, t.task); }
        catch(e){ await alertSafe_("Fehler: " + (e?.message||String(e))); }
      };
      div.querySelector('[data-del="1"]').onclick = async ()=>{
        try{ await deleteTask_(t.id); }
        catch(e){ await alertSafe_("Fehler: " + (e?.message||String(e))); }
      };
    }

    taskList.appendChild(div);
  });
}

/* render tags list */
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

/* admin tags list */
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

/* employees admin list */
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

/* employee selectors (login + rides) */
function renderEmployeeSelectors_(){
  const opts = [`<option value="">Name wählen…</option>`].concat(
    employees.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`)
  ).join("");

  if(nameSel) nameSel.innerHTML = opts;
  if(rideNameSel) rideNameSel.innerHTML = opts;

  const stored = n(localStorage.getItem("meName"));
  if(stored){
    if(nameSel) nameSel.value = stored;
    if(rideNameSel) rideNameSel.value = stored;
  }
}

/* rides list for today */
function renderRides_(rows){
  if(!ridesList) return;
  ridesList.innerHTML = "";
  if(!rows.length){
    ridesList.innerHTML = `<div class="muted">Noch keine Fahrten heute.</div>`;
    return;
  }

  rows.forEach(r=>{
    const rides = Array.isArray(r.rides) ? r.rides : [];
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">${esc(r.name||"")}</div>
        <div class="sub muted small">${esc(rides.map(x=>x.einsatz).join(", "))}</div>
      </div>
      <div class="actions">
        ${isAdmin ? `<button class="btn danger">Leeren</button>` : ``}
      </div>
    `;
    if(isAdmin){
      div.querySelector("button").onclick = async ()=>{
        if(!confirm(`Alle Fahrten für "${r.name}" löschen?`)) return;
        await deleteDoc(doc(db,"rides_daily",dayKey(),"people", r.id));
      };
    }
    ridesList.appendChild(div);
  });
}

/* admins lists */
function renderAdmins_(rows){
  if(!adminUidList) return;
  adminUidList.innerHTML = rows.length ? "" : `<div class="muted">Keine Admins.</div>`;
  rows.forEach(r=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">ADMIN UID: ${esc(r.id)}</div>
        <div class="sub muted small">enabled: ${String(r.enabled !== false)}</div>
      </div>
      <div class="actions"><button class="btn danger">Entfernen</button></div>
    `;
    div.querySelector("button").onclick = async ()=>{
      if(!isSuperAdmin){ await alertSafe_("Nur Superadmin."); return; }
      if(!confirm("Admin entfernen?")) return;
      await deleteDoc(doc(db,"admins",r.id));
      await incCount_("adminCount", -1);
    };
    adminUidList.appendChild(div);
  });
}

function renderSuperAdmins_(rows){
  if(!superUidList) return;
  superUidList.innerHTML = rows.length ? "" : `<div class="muted">Keine Superadmins?</div>`;
  rows.forEach(r=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">SUPERADMIN UID: ${esc(r.id)}</div>
        <div class="sub muted small">enabled: ${String(r.enabled === true)}</div>
      </div>
      <div class="actions"><button class="btn danger">Entfernen</button></div>
    `;
    div.querySelector("button").onclick = async ()=>{
      if(!isSuperAdmin){ await alertSafe_("Nur Superadmin."); return; }
      const counts = await getCounts_();
      if((counts.superCount||0) <= 1){
        await alertSafe_("Mindestens 1 Superadmin muss bleiben.");
        return;
      }
      if(!confirm("Superadmin entfernen?")) return;
      await deleteDoc(doc(db,"superadmins",r.id));
      await incCount_("superCount", -1);
    };
    superUidList.appendChild(div);
  });
}

/* templates list */
function renderTemplates_(rows){
  if(!templatesList) return;
  templatesList.innerHTML = rows.length ? "" : `<div class="muted">Keine Wochen-Aufgaben.</div>`;

  rows.forEach(r=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">${["So","Mo","Di","Mi","Do","Fr","Sa"][r.weekday]} · ${esc(r.tagId)} · ${esc(r.task)}</div>
        <div class="sub muted small">${esc(r.id)}</div>
      </div>
      <div class="actions"><button class="btn danger">🗑️</button></div>
    `;
    div.querySelector("button").onclick = async ()=>{
      if(!confirm("Wochen-Aufgabe löschen?")) return;
      await deleteDoc(doc(db,"task_templates_weekly", r.id));
    };
    templatesList.appendChild(div);
  });
}

/* today extras list */
function renderTodayExtras_(rows){
  if(!todayExtraList) return;
  todayExtraList.innerHTML = rows.length ? "" : `<div class="muted">Keine Heute-Extras.</div>`;

  rows.forEach(r=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">${esc(r.tagId)} · ${esc(r.task)}</div>
        <div class="sub muted small">${esc(r.id)}</div>
      </div>
      <div class="actions"><button class="btn danger">🗑️</button></div>
    `;
    div.querySelector("button").onclick = async ()=>{
      if(!confirm("Heute-Aufgabe löschen?")) return;
      await deleteDoc(doc(db,"task_extras_today", r.id));
    };
    todayExtraList.appendChild(div);
  });
}

/* points list */
async function loadPointsOnce_(){
  if(!isAdmin){ return; }
  const snap = await getDocs(query(collection(db,"points"), orderBy("name")));
  const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  renderPoints_(rows);
}
function renderPoints_(rows){
  if(!pointsList) return;
  pointsList.innerHTML = rows.length ? "" : `<div class="muted">Noch keine Punkte gebucht.</div>`;
  rows.forEach(r=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">${esc(r.name||r.id)}</div>
        <div class="sub muted small">Aufgabenpunkte: <b>${Number(r.taskPoints||0)||0}</b></div>
      </div>
    `;
    pointsList.appendChild(div);
  });
}
refreshPointsBtn && (refreshPointsBtn.onclick = loadPointsOnce_);

/* search handlers */
tagSearch && (tagSearch.oninput = ()=>renderTags_());
godSearch && (godSearch.oninput = ()=>renderGod_());

toggleOnlyOpenBtn && (toggleOnlyOpenBtn.onclick = ()=>{
  onlyOpen = !onlyOpen;
  renderGod_();
});
collapseAllBtn && (collapseAllBtn.onclick = ()=>{
  if(!godList) return;
  godList.querySelectorAll("details").forEach(d=>d.open=false);
});

/* ---------------- admin dashboard (all tasks) ---------------- */
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
      map.set(tk, { tagKey:tk, tagId:t.tagId||tk, done:0, open:0, final:0, openTasks:[], doneTasks:[] });
    }
    const g = map.get(tk);

    if((t.status||"❌")==="✅"){ g.done++; g.doneTasks.push(t); }
    else { g.open++; g.openTasks.push(t); }

    if(t.finalOk) g.final++;
    if(t.tagId) g.tagId = t.tagId;
  }

  let groups = [...map.values()].sort((a,b)=>(a.tagId||"").localeCompare(b.tagId||""));
  if(onlyOpen) groups = groups.filter(g=>g.open>0);
  if(qtxt){
    groups = groups.filter(g=>{
      const inTag = (g.tagId||"").toLowerCase().includes(qtxt);
      const inTask = [...g.openTasks, ...g.doneTasks].some(t=>String(t.task||"").toLowerCase().includes(qtxt));
      return inTag || inTask;
    });
  }

  let open=0, done=0, fin=0;
  for(const g of map.values()){ open+=g.open; done+=g.done; fin+=g.final; }
  if(godSummary) godSummary.textContent = `Tags: ${map.size} · Aufgaben: ${allTasks.length} · Offen: ${open} · Erledigt: ${done} · Endkontrolle: ${fin}`;

  if(!godList) return;
  godList.innerHTML = groups.length ? "" : `<div class="muted">Keine Treffer.</div>`;

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

    det.querySelector('[data-open="1"]').onclick = ()=>{ setTab_("tasks"); openTag_(g.tagId); };
    det.querySelector('[data-reset="1"]').onclick = ()=>bulkResetTag_(g.tagKey, g.tagId);
    det.querySelector('[data-finalall="1"]').onclick = ()=>bulkFinalAll_(g.tagKey, g.tagId);
    det.querySelector('[data-delete="1"]').onclick = ()=>deleteTagWithTasks_(g.tagKey, g.tagId);

    const list = det.querySelector('[data-list="1"]');

    const preview = g.openTasks.length ? g.openTasks : g.doneTasks;
    if(!preview.length){
      list.innerHTML = `<div class="muted">Keine Aufgaben.</div>`;
    }else{
      preview.slice(0,25).forEach(t=>{
        const it = document.createElement("div");
        it.className="item";
        it.innerHTML = `
          <div class="main">
            <div class="title">${t.status==="✅"?"✅":"⏳"} ${esc(t.task||"")}</div>
            <div class="sub muted small">
              ${Array.isArray(t.doneBy)&&t.doneBy.length?`Erledigt von: ${esc(t.doneBy.join(", "))}`:""}
              ${t.finalOk?` · 🧾 ${esc(t.finalBy||"")}`:""}
            </div>
          </div>
          <div class="actions">
            <button class="btn ghost" data-final="1">🧾</button>
            <button class="btn ghost" data-reset="1">↩️</button>
          </div>
        `;
        it.querySelector('[data-final="1"]').onclick = async ()=>{ try{ await toggleFinalAndPoints_(t.id); }catch(e){ await alertSafe_(e?.message||String(e)); } };
        it.querySelector('[data-reset="1"]').onclick = async ()=>{ try{ await resetTask_(t.id); }catch(e){ await alertSafe_(e?.message||String(e)); } };
        list.appendChild(it);
      });
      if(preview.length > 25){
        const more = document.createElement("div");
        more.className="muted small";
        more.textContent = `… ${preview.length-25} weitere (Tag öffnen oder Suche nutzen).`;
        list.appendChild(more);
      }
    }

    godList.appendChild(det);
  }
}

async function bulkResetTag_(tagKeyStr, tagIdStr){
  if(!confirm(`Alle Aufgaben in "${tagIdStr}" zurücksetzen? (Punkte werden ggf. entbucht)`)) return;
  const snap = await getDocs(query(collection(db,"daily_tasks"), where("tagKey","==",tagKeyStr)));
  for(const d of snap.docs){
    await resetTask_(d.id);
  }
  await alertSafe_("Reset ✓");
}

async function bulkFinalAll_(tagKeyStr, tagIdStr){
  if(!confirm(`Endkontrolle für alle erledigten Aufgaben in "${tagIdStr}" toggeln (nur wenn noch nicht gebucht)?`)) return;
  const snap = await getDocs(query(collection(db,"daily_tasks"), where("tagKey","==",tagKeyStr)));
  for(const d of snap.docs){
    const t = d.data();
    if((t.status||"") === "✅" && !t.finalOk){
      await toggleFinalAndPoints_(d.id);
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

/* ---------------- Day change ----------------
  - Archive current daily_tasks and today rides
  - Clear daily_tasks and rides_daily(today)
  - Set meta/current_day = new day
  - Generate daily tasks for TODAY from:
      task_templates_weekly where weekday == todayWeekday
      + task_extras_today where day == todayKey
*/
async function ensureMetaDay_(){
  const snap = await getDoc(META_DAY_REF);
  if(!snap.exists()){
    await setDoc(META_DAY_REF, { day: dayKey(), updatedAt: serverTimestamp() }, { merge:true });
  }
}

async function runDayChange_({manual}){
  if(!isAdmin) return;

  const today = dayKey();
  const snapDay = await getDoc(META_DAY_REF);
  const oldDay = snapDay.exists() ? (snapDay.data()?.day || today) : today;

  // If same day and not manual, skip
  if(!manual && oldDay === today) return;

  // Archive tasks of oldDay (current daily_tasks)
  const tasks = await getDocs(query(collection(db,"daily_tasks")));
  for(const docu of tasks.docs){
    await setDoc(doc(db,"archives",oldDay,"tasks",docu.id), {
      ...docu.data(), day: oldDay, archivedAt: serverTimestamp()
    }, { merge:true });
  }
  await deleteDocsInBatches_(tasks.docs.map(x=>x.ref));

  // Archive rides of oldDay
  const rides = await getDocs(query(collection(db,"rides_daily",oldDay,"people")));
  for(const docu of rides.docs){
    await setDoc(doc(db,"rides_archives",oldDay,"people",docu.id), {
      ...docu.data(), day: oldDay, archivedAt: serverTimestamp()
    }, { merge:true });
  }
  await deleteDocsInBatches_(rides.docs.map(x=>x.ref));

  // Update meta day to today
  await setDoc(META_DAY_REF, { day: today, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid }, { merge:true });

  // Generate new daily tasks for today
  await generateDailyTasksForToday_();

  if(dayInfo) dayInfo.textContent = `Tageswechsel ✓ Archiv: ${oldDay} → Heute: ${today} (Tasks ${tasks.size}, Fahrten ${rides.size})`;
  await alertSafe_(`Tageswechsel ✓\nArchiv: ${oldDay}\nNeue Aufgaben erstellt für: ${today}`);
}

async function generateDailyTasksForToday_(){
  const today = dayKey();
  const wd = weekday();

  // weekly templates
  const wSnap = await getDocs(query(collection(db,"task_templates_weekly"), where("weekday","==",wd)));
  // today extras
  const eSnap = await getDocs(query(collection(db,"task_extras_today"), where("day","==",today)));

  const toCreate = [];
  wSnap.docs.forEach(d=>{
    const t = d.data() || {};
    toCreate.push({ tagId:t.tagId, tagKey:t.tagKey, task:t.task, source:"weekly", sourceId:d.id });
  });
  eSnap.docs.forEach(d=>{
    const t = d.data() || {};
    toCreate.push({ tagId:t.tagId, tagKey:t.tagKey, task:t.task, source:"today", sourceId:d.id });
  });

  // Create daily_tasks
  for(const x of toCreate){
    await addDoc(collection(db,"daily_tasks"), {
      day: today,
      tagId: n(x.tagId),
      tagKey: key(x.tagId),
      task: n(x.task),
      status:"❌",
      doneBy: [],
      doneAtLast:"",
      finalOk:false,
      finalBy:"",
      pointsBooked:false,
      bookedFor:[],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      source: x.source,
      sourceId: x.sourceId
    });

    // ensure tag exists
    await setDoc(doc(db,"tags", key(x.tagId)), { tagId:n(x.tagId), tagKey:key(x.tagId), updatedAt:serverTimestamp() }, { merge:true });
  }
}

async function deleteDocsInBatches_(refs){
  const chunk = 350;
  for(let i=0;i<refs.length;i+=chunk){
    const b = writeBatch(db);
    refs.slice(i,i+chunk).forEach(r=>b.delete(r));
    await b.commit();
  }
}

/* ---------------- streams ---------------- */
async function startStreams_(){

  // employees (public read)
  if(unsubEmployees) unsubEmployees();
  unsubEmployees = onSnapshot(query(collection(db,"employees_public"), orderBy("name")),
    (snap)=>{
      employees = snap.docs.map(d=>n(d.data().name)).filter(Boolean);
      renderEmployeeSelectors_();
      if(isAdmin) renderEmployeesAdmin_();
    }
  );

  // tags (public read)
  if(unsubTags) unsubTags();
  unsubTags = onSnapshot(query(collection(db,"tags"), orderBy("tagId")),
    (snap)=>{
      tags = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderTags_();
      if(isAdmin) renderAdminTags_();
    }
  );

  // rides for today
  if(unsubRides) unsubRides();
  unsubRides = onSnapshot(query(collection(db,"rides_daily",dayKey(),"people"), orderBy("name")),
    (snap)=>{
      const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderRides_(rows);
    }
  );

  // admin: all tasks dashboard
  if(unsubAllTasks) unsubAllTasks();
  unsubAllTasks = onSnapshot(query(collection(db,"daily_tasks"), orderBy("tagKey"), orderBy("task")),
    (snap)=>{
      allTasks = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderGod_();
    }
  );

  // admin: templates
  if(unsubTemplates) unsubTemplates();
  unsubTemplates = onSnapshot(query(collection(db,"task_templates_weekly"), orderBy("weekday"), orderBy("tagId")),
    (snap)=>{
      if(!isAdmin){ if(templatesList) templatesList.innerHTML=""; return; }
      const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderTemplates_(rows);
    }
  );

  // admin: today extras
  if(unsubTodayExtras) unsubTodayExtras();
  unsubTodayExtras = onSnapshot(query(collection(db,"task_extras_today"), where("day","==",dayKey()), orderBy("tagId")),
    (snap)=>{
      if(!isAdmin){ if(todayExtraList) todayExtraList.innerHTML=""; return; }
      const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      renderTodayExtras_(rows);
    }
  );

  // super/admin lists
  if(unsubAdmins) unsubAdmins();
  unsubAdmins = onSnapshot(query(collection(db,"admins"), orderBy("addedAt")),
    (snap)=>{
      if(!isAdmin){ if(adminUidList) adminUidList.innerHTML=""; return; }
      renderAdmins_(snap.docs.map(d=>({ id:d.id, ...d.data() })));
    }
  );

  if(unsubSupers) unsubSupers();
  unsubSupers = onSnapshot(query(collection(db,"superadmins"), orderBy("addedAt")),
    (snap)=>{
      if(!isAdmin){ if(superUidList) superUidList.innerHTML=""; return; }
      renderSuperAdmins_(snap.docs.map(d=>({ id:d.id, ...d.data() })));
    }
  );
}

/* ---------------- app view ---------------- */
function enterApp_(){
  show(loginView,false);
  show(appView,true);
  setTab_("tasks");
}

/* ---------------- init ---------------- */
onAuthStateChanged(auth, async ()=>{
  await ensureAnon_();

  if(dayKeyBadge) dayKeyBadge.textContent = dayKey();

  await ensureCountsDoc_();
  await bootstrapSuperAdminOnce_();
  await seedFirstEmployeeIfEmpty_();
  await ensureMetaDay_();

  const stored = n(localStorage.getItem("meName"));
  if(stored) meName = stored;

  await refreshRole_();
  await startStreams_();

  // AUTO DAY CHANGE: If admin and meta day != today -> run automatically once
  try{
    const dSnap = await getDoc(META_DAY_REF);
    const saved = dSnap.exists() ? (dSnap.data()?.day || dayKey()) : dayKey();
    if(isAdmin && saved !== dayKey()){
      await runDayChange_({manual:false});
    }
  }catch(e){}

  if(meName){
    enterApp_();
  } else {
    show(loginView,true);
    show(appView,false);
  }
});
