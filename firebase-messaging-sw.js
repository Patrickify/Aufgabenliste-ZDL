import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


import {
  getMessaging,
  getToken,
  isSupported as messagingIsSupported
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

/**
 * TODO: Firebase Web Config hier eintragen (Firebase Console -> Project settings -> Web app)
 */
const firebaseConfig = loadFirebaseConfig_();

function loadFirebaseConfig_(){
  try{
    const raw = localStorage.getItem("firebaseConfig");
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(obj && obj.projectId && obj.apiKey) return obj;
  }catch(e){}
  return null;
}

function parseFirebaseConfigInput_(text){
  const t = String(text||"").trim();
  if(!t) throw new Error("Config ist leer.");
  // Allow pasting "const firebaseConfig = {...};"
  const m = t.match(/\{[\s\S]*\}/);
  if(!m) throw new Error("Kein JSON-Objekt gefunden.");
  const obj = JSON.parse(m[0]);
  if(!obj.projectId || !obj.apiKey) throw new Error("projectId/apiKey fehlen.");
  return obj;
}

if(!firebaseConfig){
  // Setup required (iPad no-edit mode)
  document.addEventListener('DOMContentLoaded', ()=>{
    const setupView = document.getElementById('setupView');
    const loginView = document.getElementById('loginView');
    const appView = document.getElementById('appView');
    const err = document.getElementById('setupErr');
    const inp = document.getElementById('firebaseConfigInput');
    const saveBtn = document.getElementById('saveFirebaseConfigBtn');
    const resetBtn = document.getElementById('resetFirebaseConfigBtn');
    setupView?.classList.remove('hidden');
    loginView?.classList.add('hidden');
    appView?.classList.add('hidden');

    saveBtn.onclick = ()=>{
      err.textContent = '';
      try{
        const obj = parseFirebaseConfigInput_(inp.value);
        localStorage.setItem('firebaseConfig', JSON.stringify(obj));
        location.reload();
      }catch(e){
        err.textContent = e?.message || String(e);
      }
    };
    resetBtn.onclick = ()=>{
      localStorage.removeItem('firebaseConfig');
      location.reload();
    };
  });
  throw new Error('FirebaseConfig fehlt – SetupView aktiv.');
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

const loginView = $("loginView");
const appView = $("appView");
const logoutBtn = $("logoutBtn");
const who = $("who");
const loginErr = $("loginErr");

const userSelect = $("userSelect");
const userLoginBtn = $("userLoginBtn");
const enablePushBtn = $("enablePushBtn");
const showUidBtn = $("showUidBtn");
const uidBox = $("uidBox");


const tagsList = $("tagsList");
const tagSearch = $("tagSearch");
const tagDetail = $("tagDetail");
const tagTitle = $("tagTitle");
const closeTagBtn = $("closeTagBtn");

const employeeName = $("employeeName");
const addEmployeeBtn = $("addEmployeeBtn");
const employeeChips = $("employeeChips");
const markDoneBtn = $("markDoneBtn");
const selectedCount = $("selectedCount");
const tasksList = $("tasksList");

// Fahrten
const rideName = $("rideName");
const rideEinsatz = $("rideEinsatz");
const addRideBtn = $("addRideBtn");
const ridesList = $("ridesList");
const dayKeyEl = $("dayKey");

// Admin Panel
const adminCard = $("adminCard");
const newEmployeeName = $("newEmployeeName");
const addEmployeePublicBtn = $("addEmployeePublicBtn");
const employeesPublicList = $("employeesPublicList");
const newTagId = $("newTagId");
const addTagBtn = $("addTagBtn");
const adminTagsList = $("adminTagsList");

// Ultra Admin Mode
const toggleOnlyOpenTagsBtn = $("toggleOnlyOpenTagsBtn");
const exportOpenCsvBtn = $("exportOpenCsvBtn");
const runDayChangeBtn = $("runDayChangeBtn");
const ultraSearch = $("ultraSearch");
const collapseAllBtn = $("collapseAllBtn");
const ultraSummary = $("ultraSummary");
const ultraTags = $("ultraTags");

// Punkte
const pointsCard = $("pointsCard");
const pointsList = $("pointsList");
const refreshPointsBtn = $("refreshPointsBtn");

let isAdmin = false;
let myDisplayName = "";
let selectedEmployees = []; // optional extra names
let selectedTaskIds = new Set();
let currentTagId = null;

let unsubTasks = null;
let unsubTags = null;
let unsubRides = null;
let unsubEmployeesPublic = null;
let unsubAdminTags = null;
let unsubUltraTasks = null;
let ultraOnlyOpen = false;
let ultraData = { tags: [], tasks: [] };

function n(s){ return String(s ?? "").trim().replace(/\s+/g," "); }
function tagKey(s){
  let x = n(s).toLowerCase();
  x = x.replace(/["'„“”]/g,"");
  x = x.replace(/[^a-z0-9äöüß]/g,"");
  return x;
}
function escapeHtml(s){
  return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function show(el, yes){ el.classList.toggle("hidden", !yes); }

function todayKey(){
  const d = new Date();
  const pad = (x)=>String(x).padStart(2,"0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}

async function ensureAnonAuth(){
  if(!auth.currentUser){
    await signInAnonymously(auth);
  }
}

async function refreshClaimsAndProfile(){
  if(!auth.currentUser){ isAdmin=false; myDisplayName=""; return; }

  try{
    const asnap = await getDoc(doc(db, "admins", auth.currentUser.uid));
    isAdmin = asnap.exists();
  }catch(e){
    isAdmin = false;
  }

  const usnap = await getDoc(doc(db, "users", auth.currentUser.uid));
  myDisplayName = usnap.exists() ? (usnap.data().name || "") : "";

  show(pointsCard, isAdmin);
  show(adminCard, isAdmin);
}

function renderChips(){
  employeeChips.innerHTML = "";
  selectedEmployees.forEach((name)=>{
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `<span>${escapeHtml(name)}</span><button title="Entfernen">×</button>`;
    chip.querySelector("button").onclick = () => {
      selectedEmployees = selectedEmployees.filter(x => x.toLowerCase() !== name.toLowerCase());
      renderChips();
    };
    employeeChips.appendChild(chip);
  });
}

function updateSelectedCount(){
  selectedCount.textContent = String(selectedTaskIds.size);
}

async function upsertTag(tagId){
  const key = tagKey(tagId);
  if(!key) return;
  // tags write is admin-only; non-admin can still open existing tags
  if(isAdmin){
    await setDoc(doc(db, "tags", key), { tagId: n(tagId), tagKey: key, updatedAt: serverTimestamp() }, { merge: true });
  }
}

function renderTags(docs){
  const q = n(tagSearch.value).toLowerCase();
  tagsList.innerHTML = "";
  const filtered = docs.filter(d=>{
    const tid = (d.tagId||"").toLowerCase();
    return !q || tid.includes(q);
  });
  if(!filtered.length){
    tagsList.innerHTML = `<div class="muted">Keine Tags gefunden.</div>`;
    return;
  }
  filtered.forEach((d)=>{
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<div class="main">
      <div class="title">🏷️ ${escapeHtml(d.tagId || "")}</div>
      <div class="sub">Öffnen</div>
    </div>
    <div class="actions">
      <button class="btn ghost">Öffnen</button>
    </div>`;
    item.querySelector("button").onclick = ()=> openTag(d.tagId);
    item.onclick = ()=> openTag(d.tagId);
    tagsList.appendChild(item);
  });
}

function renderTasks(taskDocs){
  tasksList.innerHTML = "";
  if(!taskDocs.length){
    tasksList.innerHTML = `<div class="muted">Keine Aufgaben für diesen Tag.</div>`;
    return;
  }
  taskDocs.forEach((t)=>{
    const id = t.id;
    const selected = selectedTaskIds.has(id);
    const doneBy = Array.isArray(t.doneBy) ? t.doneBy.join(", ") : "";
    const finalInfo = t.finalOk ? `🧾 ✅ ${escapeHtml(t.finalBy||"")}` : "🧾 —";
    const sub = [
      doneBy ? `Erledigt von: ${escapeHtml(doneBy)}` : "",
      finalInfo
    ].filter(Boolean).join(" • ");

    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<div class="main">
      <div class="title">${escapeHtml(t.status||"❌")} ${escapeHtml(t.task||"")}</div>
      <div class="sub">${sub}</div>
    </div>
    <div class="actions">
      <input class="checkbox" type="checkbox" ${selected ? "checked":""} />
      <button class="btn ghost">⋯</button>
    </div>`;

    item.querySelector("input").onchange = (e)=>{
      if(e.target.checked) selectedTaskIds.add(id); else selectedTaskIds.delete(id);
      updateSelectedCount();
    };

    item.querySelector(".main").onclick = ()=>{
      if(selectedTaskIds.has(id)) selectedTaskIds.delete(id); else selectedTaskIds.add(id);
      updateSelectedCount();
      item.querySelector("input").checked = selectedTaskIds.has(id);
    };

    item.querySelector("button").onclick = async (e)=>{
      e.stopPropagation();
      if(!isAdmin){
        alert("Nur Admins können Aufgaben bearbeiten.");
        return;
      }
      const choice = prompt(
`Aktion:
final = Endkontrolle togglen
reset = Task reset
edit = Task Text ändern
delete = Task löschen`
      );
      if(!choice) return;
      const c = choice.trim().toLowerCase();
      if(c === "final"){
        await updateDoc(doc(db,"daily_tasks",id), { finalOk: !t.finalOk, finalBy: (!t.finalOk) ? myDisplayName : "", updatedAt: serverTimestamp() });
      } else if(c === "reset"){
        await updateDoc(doc(db,"daily_tasks",id), {
          status:"❌", doneBy:[], doneAtLast:"", finalOk:false, finalBy:"",
          pointsBooked:false, bookedFor:[], updatedAt: serverTimestamp()
        });
      } else if(c === "edit"){
        const nt = prompt("Neuer Task Text:", t.task||"");
        if(nt != null){
          await updateDoc(doc(db,"daily_tasks",id), { task: n(nt), updatedAt: serverTimestamp() });
        }
      } else if(c === "delete"){
        if(confirm("Task wirklich löschen?")){
          await deleteDoc(doc(db,"daily_tasks",id));
        }
      }
    };

    tasksList.appendChild(item);
  });
}

async function openTag(tagId){
  currentTagId = n(tagId);
  await upsertTag(currentTagId);
  tagTitle.textContent = `Tag: ${currentTagId}`;
  show(tagDetail, true);

  selectedTaskIds = new Set();
  updateSelectedCount();

  if(unsubTasks) unsubTasks();
  const key = tagKey(currentTagId);
  const qy = query(collection(db,"daily_tasks"), where("tagKey","==", key), orderBy("task"));
  unsubTasks = onSnapshot(qy, (snap)=>{
    const tasks = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderTasks(tasks);
  });
}

function closeTag(){
  currentTagId = null;
  show(tagDetail, false);
  if(unsubTasks){ unsubTasks(); unsubTasks=null; }
}

async function adminAddTask(){
  if(!isAdmin) return;
  if(!currentTagId){ alert("Öffne zuerst einen Tag."); return; }
  const txt = prompt("Neuer Task Text:");
  if(!txt) return;
  const tagId = currentTagId;
  const key = tagKey(tagId);
  const id = `${key}_${Date.now()}`;
  await setDoc(doc(db,"daily_tasks",id), {
    tagId,
    tagKey: key,
    task: n(txt),
    status: "❌",
    doneBy: [],
    doneAtLast: "",
    finalOk: false,
    finalBy: "",
    pointsBooked: false,
    bookedFor: [],
    updatedAt: serverTimestamp()
  });
}

async function markDone(){
  if(!selectedTaskIds.size){
    alert("Keine Aufgaben ausgewählt.");
    return;
  }
  if(!myDisplayName){
    alert("Kein Benutzername gesetzt. Bitte neu anmelden.");
    return;
  }

  const now = new Date();
  const pad = (x)=>String(x).padStart(2,"0");
  const stamp = `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const doneNames = [myDisplayName, ...selectedEmployees].filter(Boolean);

  const ids = Array.from(selectedTaskIds);
  for(const id of ids){
    await updateDoc(doc(db,"daily_tasks",id), {
      status:"✅",
      doneBy: arrayUnion(...doneNames),
      doneAtLast: stamp,
      updatedAt: serverTimestamp()
    });
  }
  selectedTaskIds = new Set();
  updateSelectedCount();
}

function renderRides(docs){
  ridesList.innerHTML = "";
  if(!docs.length){
    ridesList.innerHTML = `<div class="muted">Noch keine Fahrten heute.</div>`;
    return;
  }
  docs.forEach((d)=>{
    const name = d.name || "";
    const einsaetze = Array.isArray(d.einsaetze) ? d.einsaetze : [];
    const wrap = document.createElement("div");
    wrap.className = "item";
    wrap.innerHTML = `<div class="main">
      <div class="title">👤 ${escapeHtml(name)}</div>
      <div class="sub">${einsaetze.length} Einsatz(e)</div>
      <div class="sub" style="margin-top:8px" id="einsaetze"></div>
    </div>
    <div class="actions">
      ${isAdmin ? '<button class="btn ghost" data-delperson="1">Person löschen</button>' : ''}
    </div>`;
    const list = wrap.querySelector("#einsaetze");
    einsaetze.forEach((e)=>{
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="pill">${escapeHtml(e)}</span><button class="btn ghost">Löschen</button>`;
      row.querySelector("button").onclick = async ()=>{
        const day = todayKey();
        await updateDoc(doc(db,"rides_daily",day,"people", d.id), {
          einsaetze: arrayRemove(e),
          updatedAt: serverTimestamp()
        });
      };
      list.appendChild(row);
    });

    const delBtn = wrap.querySelector('[data-delperson="1"]');
    if(delBtn){
      delBtn.onclick = async ()=>{
        if(confirm("Person für heute komplett löschen?")){
          const day = todayKey();
          await deleteDoc(doc(db,"rides_daily",day,"people", d.id));
        }
      };
    }

    ridesList.appendChild(wrap);
  });
}

async function addRide(){
  const name = n(rideName.value);
  const einsatz = n(rideEinsatz.value);
  if(!name || !einsatz){ alert("Name und Einsatznummer nötig."); return; }
  const day = todayKey();
  const id = tagKey(name);
  await setDoc(doc(db,"rides_daily",day,"people",id), {
    name,
    einsaetze: arrayUnion(einsatz),
    updatedAt: serverTimestamp()
  }, { merge:true });
  rideEinsatz.value = "";
}

async function loadPoints(){
  if(!isAdmin) return;
  pointsList.innerHTML = `<div class="muted">Lade…</div>`;
  const qy = query(collection(db,"employees"), orderBy("name"));
  const snap = await getDocs(qy);
  const items = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  pointsList.innerHTML = "";
  if(!items.length){
    pointsList.innerHTML = `<div class="muted">Keine Daten in employees/.</div>`;
    return;
  }
  items.forEach((e)=>{
    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `<div class="main">
      <div class="title">⭐ ${escapeHtml(e.name||"")}</div>
      <div class="sub">Aufgabenpunkte: ${e.taskPoints ?? 0} • Fahrtenpunkte: ${e.ridePoints ?? 0}</div>
    </div>
    <div class="actions">
      <button class="btn ghost">Bearbeiten</button>
    </div>`;
    it.querySelector("button").onclick = async ()=>{
      const tp = prompt("Aufgabenpunkte:", String(e.taskPoints ?? 0));
      if(tp === null) return;
      const rp = prompt("Fahrtenpunkte:", String(e.ridePoints ?? 0));
      if(rp === null) return;
      await setDoc(doc(db,"employees", e.id), {
        name: e.name || e.id,
        taskPoints: Number(tp)||0,
        ridePoints: Number(rp)||0,
        updatedAt: serverTimestamp()
      }, { merge:true });
      await loadPoints();
    };
    pointsList.appendChild(it);
  });
}

async function loadEmployeesPublic(){
  if(unsubEmployeesPublic) unsubEmployeesPublic();
  unsubEmployeesPublic = onSnapshot(query(collection(db,"employees_public"), orderBy("name")), (snap)=>{
    const list = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    // login dropdown
    const names = list.map(x=>x.name).filter(Boolean);
    renderUserSelect(names);

    // admin list
    renderEmployeesPublicAdmin(list);
  });
}

function renderUserSelect(list){
  userSelect.innerHTML = "";
  if(!list.length){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Keine Mitarbeiter – Admin muss Liste anlegen";
    userSelect.appendChild(opt);
    userSelect.disabled = true;
    userLoginBtn.disabled = true;
    return;
  }
  userSelect.disabled = false;
  userLoginBtn.disabled = false;

  list.forEach((name)=>{
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    userSelect.appendChild(opt);
  });
}

function renderEmployeesPublicAdmin(list){
  employeesPublicList.innerHTML = "";
  if(!isAdmin){
    employeesPublicList.innerHTML = `<div class="muted">Nur Admins.</div>`;
    return;
  }
  if(!list.length){
    employeesPublicList.innerHTML = `<div class="muted">Noch keine Mitarbeiter.</div>`;
    return;
  }
  list.forEach((e)=>{
    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `<div class="main">
      <div class="title">👤 ${escapeHtml(e.name||"")}</div>
      <div class="sub">${escapeHtml(e.id)}</div>
    </div>
    <div class="actions">
      <button class="btn ghost">Löschen</button>
    </div>`;
    it.querySelector("button").onclick = async ()=>{
      if(confirm("Mitarbeiter löschen?")){
        await deleteDoc(doc(db,"employees_public", e.id));
      }
    };
    employeesPublicList.appendChild(it);
  });
}

async function addEmployeePublic(){
  if(!isAdmin){ alert("Nur Admins."); return; }
  const name = n(newEmployeeName.value);
  if(!name) return;
  const id = tagKey(name);
  await setDoc(doc(db,"employees_public",id), { name, updatedAt: serverTimestamp() }, { merge:true });
  newEmployeeName.value = "";
}

async function loadAdminTags(){
  if(unsubAdminTags) unsubAdminTags();
  unsubAdminTags = onSnapshot(query(collection(db,"tags"), orderBy("tagId")), (snap)=>{
    const list = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderAdminTags(list);
  });
}

function renderAdminTags(list){
  adminTagsList.innerHTML = "";
  if(!isAdmin){
    adminTagsList.innerHTML = `<div class="muted">Nur Admins.</div>`;
    return;
  }
  if(!list.length){
    adminTagsList.innerHTML = `<div class="muted">Keine Tags.</div>`;
    return;
  }
  list.forEach((t)=>{
    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `<div class="main">
      <div class="title">🏷️ ${escapeHtml(t.tagId||"")}</div>
      <div class="sub">${escapeHtml(t.tagKey||t.id)}</div>
    </div>
    <div class="actions">
      <button class="btn ghost" data-open="1">Öffnen</button>
      <button class="btn ghost" data-del="1">Löschen</button>
    </div>`;
    it.querySelector('[data-open="1"]').onclick = ()=> openTag(t.tagId);
    it.querySelector('[data-del="1"]').onclick = async ()=>{
  if(!confirm("Tag + ALLE Tasks zu diesem Tag wirklich löschen?")) return;
  try{
    const res = await clientDeleteTagWithTasks_(t.id);
    alert(`Gelöscht ✓ (Tasks: ${res.deletedTasks})`);
  }catch(e){
    alert("Fehler: " + (e?.message || e));
  }
};
    adminTagsList.appendChild(it);
  });
}

async function addTag(){
  if(!isAdmin){ alert("Nur Admins."); return; }
  const tagId = n(newTagId.value);
  if(!tagId) return;
  const key = tagKey(tagId);
  await setDoc(doc(db,"tags", key), { tagId, tagKey:key, updatedAt: serverTimestamp() }, { merge:true });
  newTagId.value = "";
}

async function userLoginFlow(){
  loginErr.textContent = "";
  try{
    await ensureAnonAuth();
    const name = n(userSelect.value);
    if(!name){
      alert("Bitte Benutzername auswählen.");
      return;
    }
    await setDoc(doc(db,"users",auth.currentUser.uid), { name, updatedAt: serverTimestamp() }, { merge:true });
    await refreshClaimsAndProfile();
  }catch(e){
    loginErr.textContent = String(e);
  }
}


async function initPush(){
  if("serviceWorker" in navigator){
    await navigator.serviceWorker.register("/sw.js");
  }

  const supported = await messagingIsSupported().catch(()=>false);
  if(!supported){
    alert("Push/Messaging wird in diesem Browser nicht unterstützt. Auf iPad: PWA installieren (Home-Bildschirm).");
    return;
  }

  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

  const vapidKey = prompt("VAPID Public Key einfügen (Firebase Console -> Cloud Messaging -> Web Push certificates):");
  if(!vapidKey) return;

  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
  if(!token){
    alert("Kein Token erhalten. Prüfe HTTPS + PWA Installation + Permission.");
    return;
  }

  await setDoc(doc(db,"device_tokens",token), {
    token,
    uid: auth.currentUser?.uid || "",
    isAdmin,
    updatedAt: serverTimestamp()
  }, { merge:true });

  alert("Push aktiviert ✓");
}

async function clientDeleteTagWithTasks_(tagKeyStr){
  if(!isAdmin) throw new Error("Nur Admins.");
  const key = String(tagKeyStr||"").trim();
  if(!key) throw new Error("tagKey fehlt.");

  const fb = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

  // Get tasks for tag
  const snap = await getDocs(query(collection(db,"daily_tasks"), where("tagKey","==", key)));
  const docs = snap.docs;

  const chunkSize = 400;
  for(let i=0;i<docs.length;i+=chunkSize){
    const batch = fb.writeBatch(db);
    docs.slice(i,i+chunkSize).forEach(d=> batch.delete(d.ref));
    if(i+chunkSize >= docs.length){
      batch.delete(doc(db,"tags", key));
    }
    await batch.commit();
  }
  if(docs.length === 0){
    await deleteDoc(doc(db,"tags", key));
  }
  return { deletedTasks: docs.length };
}

async function clientRunDayChange_(){
  if(!isAdmin) throw new Error("Nur Admins.");
  const now = new Date();
  const pad = (x)=>String(x).padStart(2,"0");
  const dayKey = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;

  const fb = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

  // Archive + delete tasks
  const taskSnap = await getDocs(query(collection(db,"daily_tasks")));
  const tasks = taskSnap.docs;

  const chunkSize = 350;
  for(let i=0;i<tasks.length;i+=chunkSize){
    const batch = fb.writeBatch(db);
    tasks.slice(i,i+chunkSize).forEach(d=>{
      batch.set(doc(db,"archives",dayKey,"tasks",d.id), { ...d.data(), dayKey, archivedAt: serverTimestamp() }, { merge:true });
      batch.delete(d.ref);
    });
    await batch.commit();
  }

  // Archive + delete rides for today
  const ridesSnap = await getDocs(query(collection(db,"rides_daily",dayKey,"people")));
  const rides = ridesSnap.docs;

  for(let i=0;i<rides.length;i+=chunkSize){
    const batch = fb.writeBatch(db);
    rides.slice(i,i+chunkSize).forEach(d=>{
      batch.set(doc(db,"rides_archives",dayKey,"people",d.id), { ...d.data(), dayKey, archivedAt: serverTimestamp() }, { merge:true });
      batch.delete(d.ref);
    });
    await batch.commit();
  }

  return { dayKey, archivedTasks: tasks.length, archivedRides: rides.length };
}

function csvEscape(v){
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
  return s;
}

function downloadText(filename, text){
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

function groupUltra(tasks){
  const byTag = new Map(); // tagKey -> {tagId, open, done, final, tasks:[]}
  tasks.forEach(t=>{
    const key = t.tagKey || "";
    if(!key) return;
    if(!byTag.has(key)){
      byTag.set(key, { tagKey:key, tagId:t.tagId || key, open:0, done:0, final:0, tasks:[] });
    }
    const g = byTag.get(key);
    const status = t.status || "❌";
    if(status === "✅") g.done++; else g.open++;
    if(t.finalOk) g.final++;
    if(status !== "✅"){
      g.tasks.push(t);
    }
    // prefer nicer tagId if present
    if(t.tagId && t.tagId.length > (g.tagId||"").length) g.tagId = t.tagId;
  });
  const arr = Array.from(byTag.values()).sort((a,b)=> (a.tagId||"").localeCompare(b.tagId||""));
  return arr;
}

function renderUltraDashboard(){
  if(!isAdmin){
    ultraSummary.textContent = "";
    ultraTags.innerHTML = `<div class="muted">Nur Admins.</div>`;
    return;
  }

  const q = n(ultraSearch.value).toLowerCase();
  const groups = groupUltra(ultraData.tasks);

  let total = { tags:0, tasks: ultraData.tasks.length, open:0, done:0, final:0 };
  groups.forEach(g=>{ total.tags++; total.open += g.open; total.done += g.done; total.final += g.final; });

  ultraSummary.innerHTML = `
    <div class="kpi">
      <span class="pill">Tags: ${total.tags}</span>
      <span class="pill">Aufgaben: ${total.tasks}</span>
      <span class="pill">Offen: ${total.open}</span>
      <span class="pill">Erledigt: ${total.done}</span>
      <span class="pill">Endkontrolle: ${total.final}</span>
    </div>
  `;

  ultraTags.innerHTML = "";
  const filtered = groups.filter(g=>{
    if(ultraOnlyOpen && g.open <= 0) return false;
    if(!q) return true;
    const inTag = (g.tagId||"").toLowerCase().includes(q);
    const inTasks = g.tasks.some(t => String(t.task||"").toLowerCase().includes(q));
    return inTag || inTasks;
  });

  if(!filtered.length){
    ultraTags.innerHTML = `<div class="muted">Keine Treffer.</div>`;
    return;
  }

  filtered.forEach(g=>{
    const wrap = document.createElement("details");
    wrap.className = "cardlite";
    wrap.open = g.open > 0; // auto-open if open tasks
    wrap.innerHTML = `
      <summary>
        <div class="detailsRow">
          <b>🏷️ ${escapeHtml(g.tagId||"")}</b>
          <span class="pill">✅ ${g.done}</span>
          <span class="pill">⏳ ${g.open}</span>
          <span class="pill">🧾 ${g.final}</span>
        </div>
      </summary>
      <div class="row" style="margin-top:10px">
        <button class="btn ghost smallbtn" data-open="1">Öffnen</button>
        <button class="btn ghost smallbtn" data-reset="1">Reset Tag (alle Aufgaben)</button>
        <button class="btn ghost smallbtn" data-finalall="1">Endkontrolle für alle ✅</button>
        <button class="btn ghost smallbtn" data-deltag="1">Tag löschen (inkl. Tasks)</button>
      </div>
      <div class="list" data-list="1"></div>
    `;

    wrap.querySelector('[data-open="1"]').onclick = ()=> openTag(g.tagId);
    wrap.querySelector('[data-reset="1"]').onclick = async ()=>{
      if(!confirm(`Wirklich ALLE Aufgaben für "${g.tagId}" zurücksetzen?`)) return;
      // reset all tasks (both done and open)
      const all = ultraData.tasks.filter(t => (t.tagKey||"") === g.tagKey);
      for(const t of all){
        await updateDoc(doc(db,"daily_tasks",t.id), {
          status:"❌", doneBy:[], doneAtLast:"", finalOk:false, finalBy:"",
          pointsBooked:false, bookedFor:[], updatedAt: serverTimestamp()
        });
      }
      alert("Tag zurückgesetzt ✓");
    };
    wrap.querySelector('[data-deltag="1"]').onclick = async ()=>{
      if(!confirm(`Tag "${g.tagId}" + ALLE Tasks löschen?`)) return;
      try{
        
        const res = await clientDeleteTagWithTasks_(g.tagKey);
        alert(`Tag gelöscht ✓ (Tasks: ${res.deletedTasks})`);
      }catch(e){ alert("Fehler: " + (e?.message || e)); }
    };

    wrap.querySelector('[data-finalall="1"]').onclick = async ()=>{
      if(!confirm(`Endkontrolle für alle erledigten Aufgaben in "${g.tagId}" setzen?`)) return;
      const allDone = ultraData.tasks.filter(t => (t.tagKey||"") === g.tagKey && (t.status==="✅") && !t.finalOk);
      for(const t of allDone){
        await updateDoc(doc(db,"daily_tasks",t.id), { finalOk:true, finalBy: myDisplayName, updatedAt: serverTimestamp() });
      }
      alert("Endkontrolle gesetzt ✓");
    };

    const list = wrap.querySelector('[data-list="1"]');
    if(!g.tasks.length){
      list.innerHTML = `<div class="muted">Keine offenen Aufgaben.</div>`;
    } else {
      g.tasks.slice(0, 50).forEach(t=>{
        const it = document.createElement("div");
        it.className = "item";
        const doneBy = Array.isArray(t.doneBy) ? t.doneBy.join(", ") : "";
        it.innerHTML = `
          <div class="main">
            <div class="title">⏳ ${escapeHtml(t.task||"")}</div>
            <div class="sub">${doneBy ? "Erledigt von: "+escapeHtml(doneBy) : ""}</div>
          </div>
          <div class="actions">
            <button class="btn ghost smallbtn" data-done="1">✅</button>
            <button class="btn ghost smallbtn" data-edit="1">✏️</button>
            <button class="btn ghost smallbtn" data-del="1">🗑️</button>
          </div>
        `;
        it.querySelector('[data-done="1"]').onclick = async ()=>{
          const now = new Date();
          const pad = (x)=>String(x).padStart(2,"0");
          const stamp = `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
          await updateDoc(doc(db,"daily_tasks",t.id), { status:"✅", doneBy: arrayUnion(myDisplayName), doneAtLast: stamp, updatedAt: serverTimestamp() });
        };
        it.querySelector('[data-edit="1"]').onclick = async ()=>{
          const nt = prompt("Task Text:", t.task||"");
          if(nt == null) return;
          await updateDoc(doc(db,"daily_tasks",t.id), { task: n(nt), updatedAt: serverTimestamp() });
        };
        it.querySelector('[data-del="1"]').onclick = async ()=>{
          if(!confirm("Task löschen?")) return;
          await deleteDoc(doc(db,"daily_tasks",t.id));
        };
        list.appendChild(it);
      });
      if(g.tasks.length > 50){
        const more = document.createElement("div");
        more.className = "muted small";
        more.textContent = `… ${g.tasks.length-50} weitere offene Aufgaben (Suche verwenden oder Tag öffnen).`;
        list.appendChild(more);
      }
    }

    ultraTags.appendChild(wrap);
  });
}

async function startUltraTasksStream(){
  if(unsubUltraTasks) unsubUltraTasks();
  // Keep it simple: all tasks snapshot (admin only)
  unsubUltraTasks = onSnapshot(query(collection(db,"daily_tasks"), orderBy("tagKey"), orderBy("task")), (snap)=>{
    ultraData.tasks = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderUltraDashboard();
  });
}

function bind(){
  userLoginBtn.onclick = userLoginFlow;
  adminPinBtn.onclick = adminPinFlow;
  logoutBtn.onclick = ()=> signOut(auth);

  closeTagBtn.onclick = closeTag;

  addEmployeeBtn.onclick = ()=>{
    const name = n(employeeName.value);
    if(!name) return;
    if(!selectedEmployees.some(x=>x.toLowerCase()===name.toLowerCase())){
      selectedEmployees.push(name);
      renderChips();
    }
    employeeName.value = "";
  };

  markDoneBtn.onclick = markDone;
  addRideBtn.onclick = addRide;
  refreshPointsBtn.onclick = loadPoints;
  enablePushBtn.onclick = initPush;
  if(showUidBtn){
    showUidBtn.onclick = async ()=>{
      try{
        await ensureAnonAuth();
        const uid = auth.currentUser?.uid || "";
        if(!uid){ alert("Keine UID."); return; }
        uidBox.textContent = "UID: " + uid + " (tippen zum Kopieren)";
        uidBox.onclick = async ()=>{
          try{ await navigator.clipboard.writeText(uid); alert("UID kopiert ✓"); }catch(e){ alert(uid); }
        };
      }catch(e){ alert(String(e?.message||e)); }
    };
  }

  addEmployeePublicBtn.onclick = addEmployeePublic;
  addTagBtn.onclick = addTag;

  // Ultra Admin Mode
  toggleOnlyOpenTagsBtn.onclick = ()=>{ ultraOnlyOpen = !ultraOnlyOpen; renderUltraDashboard(); };
  exportOpenCsvBtn.onclick = ()=>{
    if(!isAdmin) return;
    const open = ultraData.tasks.filter(t => (t.status||"❌") !== "✅");
    const lines = ["tagId,task,status,doneBy,finalOk,finalBy"].concat(open.map(t=>[
      csvEscape(t.tagId||""),
      csvEscape(t.task||""),
      csvEscape(t.status||""),
      csvEscape((Array.isArray(t.doneBy)?t.doneBy.join("; "):(t.doneBy||""))),
      csvEscape(String(!!t.finalOk)),
      csvEscape(t.finalBy||"")
    ].join(",")));
    downloadText(`offene_aufgaben_${todayKey()}.csv`, lines.join("\n"));
  };
  ultraSearch.oninput = ()=> renderUltraDashboard();
  collapseAllBtn.onclick = ()=>{
    ultraTags.querySelectorAll('details').forEach(d=> d.open = false);
  };
  runDayChangeBtn.onclick = async ()=>{
    if(!isAdmin) return;
    if(!confirm("Tageswechsel starten?\n\nDas archiviert ALLE heutigen Aufgaben + Fahrten und leert die aktuellen Listen.")) return;
    try{
      
      const res = await clientRunDayChange_();
      alert(`Tageswechsel OK ✓\nTag: ${res.dayKey}\nArchivierte Aufgaben: ${res.archivedTasks}\nArchivierte Fahrten: ${res.archivedRides}`);
    }catch(e){
      alert("Fehler: " + (e?.message || e));
    }
  };

  // Admin: add task via long-press? add button by double click on title
  tagTitle.ondblclick = ()=> adminAddTask();

  navigator.serviceWorker?.addEventListener?.("message", (event)=>{
    const msg = event.data || {};
    if(msg.type === "push_click"){
      alert("Push geöffnet: " + JSON.stringify(msg.data || {}, null, 2));
    }
  });
}

async function startStreams(){
  // tags list for everyone (read-only)
  let lastTagDocs = [];
  if(unsubTags) unsubTags();
  unsubTags = onSnapshot(query(collection(db,"tags"), orderBy("tagId")), (snap)=>{
    lastTagDocs = snap.docs.map(d=>d.data());
    const q = n(tagSearch.value).toLowerCase();
    const filtered = lastTagDocs.filter(d => !q || String(d.tagId||"").toLowerCase().includes(q));
    renderTags(filtered);
  });
  tagSearch.oninput = ()=>{
    // handled by snapshot store above; keep simple: no-op (it rerenders on next snapshot).
    // quick rerender:
    const q = n(tagSearch.value).toLowerCase();
    renderTags(lastTagDocs.filter(d => !q || String(d.tagId||"").toLowerCase().includes(q)));
  };

  // rides for today
  const day = todayKey();
  dayKeyEl.textContent = day;
  if(unsubRides) unsubRides();
  unsubRides = onSnapshot(query(collection(db,"rides_daily",day,"people"), orderBy("name")), (snap)=>{
    const docs = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderRides(docs);
  });
}

bind();

// Load employees list (requires auth; we sign in anonymously once)
ensureAnonAuth().then(loadEmployeesPublic).catch(()=>{});

onAuthStateChanged(auth, async (user)=>{
  if(!user){
    show(loginView, true);
    show(appView, false);
    show(logoutBtn, false);
    who.textContent = "";
    show(enablePushBtn, false);
    return;
  }

  await refreshClaimsAndProfile();

  if(!myDisplayName){
    show(loginView, true);
    show(appView, false);
    show(logoutBtn, true);
    who.textContent = "Gast (Name wählen)";
    show(enablePushBtn, false);
    // still load employees list
    await loadEmployeesPublic();
    return;
  }

  show(loginView, false);
  show(appView, true);
  show(logoutBtn, true);
  who.textContent = myDisplayName + (isAdmin ? " (Admin)" : "");
  show(enablePushBtn, true);

  if("serviceWorker" in navigator){
    try { await navigator.serviceWorker.register("/sw.js"); } catch(e){}
  }

  await startStreams();

  if(isAdmin){
    await loadAdminTags();
    await loadPoints();
  }
});
