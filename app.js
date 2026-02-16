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
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  arrayUnion,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------- Helpers ----------
const $ = (id)=>document.getElementById(id);
function n(v){ return String(v ?? "").replace(/\s+/g," ").trim(); }
function escapeHtml(s){
  s = String(s ?? "");
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function show(el, on){
  if(!el) return;
  el.classList.toggle("hidden", !on);
}
function todayKey(){
  const d = new Date();
  const pad = (x)=>String(x).padStart(2,"0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}
function stamp(){
  const d = new Date();
  const pad = (x)=>String(x).padStart(2,"0");
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

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

// ---------- Firebase init (Config comes from localStorage) ----------
const firebaseConfig = loadFirebaseConfig_();

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

// ---------- DOM ----------
const setupView = $("setupView");
const loginView = $("loginView");
const appView = $("appView");

const firebaseConfigInput = $("firebaseConfigInput");
const saveFirebaseConfigBtn = $("saveFirebaseConfigBtn");
const resetFirebaseConfigBtn = $("resetFirebaseConfigBtn");
const setupErr = $("setupErr");

// Login
const usernameSel = $("usernameSel");
const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");

// Admin setup (UID)
const showUidBtn = $("showUidBtn");
const uidBox = $("uidBox");

// App – Tag list
const tagSearch = $("tagSearch");
const tagList = $("tagList");
const openTagTitle = $("openTagTitle");
const closeTagBtn = $("closeTagBtn");

// Tasks
const taskList = $("taskList");
const markDoneBtn = $("markDoneBtn");
const doneAsName = $("doneAsName");

// Fahrten
const rideNameSel = $("rideNameSel");
const rideEinsatz = $("rideEinsatz");
const addRideBtn = $("addRideBtn");

// Admin Panel
const adminCard = $("adminCard");
const adminTagsList = $("adminTagsList");
const addTagInput = $("addTagInput");
const addTagBtn = $("addTagBtn");

const adminEmployeesList = $("adminEmployeesList");
const addEmployeeInput = $("addEmployeeInput");
const addEmployeeBtn = $("addEmployeeBtn");

const pointsCard = $("pointsCard");
const pointsList = $("pointsList");

// Ultra Admin Mode
const toggleOnlyOpenTagsBtn = $("toggleOnlyOpenTagsBtn");
const exportOpenCsvBtn = $("exportOpenCsvBtn");
const runDayChangeBtn = $("runDayChangeBtn");
const ultraSearch = $("ultraSearch");
const collapseAllBtn = $("collapseAllBtn");
const ultraSummary = $("ultraSummary");
const ultraTags = $("ultraTags");

// ---------- State ----------
let myDisplayName = "";
let isAdmin = false;

let currentTagId = "";
let currentTagKey = "";

let unsubTags = null;
let unsubTasks = null;
let unsubEmployees = null;
let unsubAdminTags = null;
let unsubPoints = null;
let unsubUltraTasks = null;

let ultraOnlyOpen = false;
let ultraData = { tags: [], tasks: [] };

// ---------- Auth helpers ----------
async function ensureAnonAuth(){
  if(auth.currentUser) return;
  await signInAnonymously(auth);
}

async function ensureUserProfile_(name){
  if(!auth.currentUser) return;
  const uid = auth.currentUser.uid;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, { name, createdAt: serverTimestamp() }, { merge:true });
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

// ---------- Data loading ----------
function loadEmployees(){
  if(unsubEmployees) unsubEmployees();
  unsubEmployees = onSnapshot(query(collection(db,"employees_public"), orderBy("name")), (snap)=>{
    const list = snap.docs.map(d=>d.data().name).filter(Boolean);
    renderEmployeeSelectors(list);
    if(isAdmin) renderAdminEmployees(list);
  });
}

function renderEmployeeSelectors(list){
  // Login selector
  usernameSel.innerHTML = `<option value="">Name wählen…</option>` + list.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  // Ride name selector
  rideNameSel.innerHTML = `<option value="">Name wählen…</option>` + list.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  // Done-as info
  doneAsName.textContent = myDisplayName ? `Angemeldet als: ${myDisplayName}` : "";
}

async function loadTags(){
  if(unsubTags) unsubTags();
  unsubTags = onSnapshot(query(collection(db,"tags"), orderBy("tagId")), (snap)=>{
    const tags = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderTags(tags);
  });
}

function renderTags(tags){
  const q = n(tagSearch.value).toLowerCase();
  const filtered = tags.filter(t=>{
    const id = (t.tagId||t.id||"").toLowerCase();
    return !q || id.includes(q);
  });

  tagList.innerHTML = "";
  if(!filtered.length){
    tagList.innerHTML = `<div class="muted">Keine Tags.</div>`;
    return;
  }

  filtered.forEach(t=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">🏷️ ${escapeHtml(t.tagId||t.id)}</div>
        <div class="sub muted small">${escapeHtml(t.tagKey||t.id)}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-open="1">Öffnen</button>
      </div>
    `;
    div.querySelector('[data-open="1"]').onclick = ()=> openTag(t.tagId||t.id);
    tagList.appendChild(div);
  });
}

async function openTag(tagId){
  const tid = n(tagId);
  if(!tid) return;
  currentTagId = tid;
  currentTagKey = canonKey_(tid);

  openTagTitle.textContent = `Tag: ${tid}`;
  show(loginView, false);
  show(appView, true);

  await startTasksStream();
}

function canonKey_(s){
  return n(s).toLowerCase().replace(/["'„“”]/g,"").replace(/[^a-z0-9äöüß]/g,"");
}

async function startTasksStream(){
  if(unsubTasks) unsubTasks();
  // Tasks by tagKey
  const qy = query(
    collection(db,"daily_tasks"),
    where("tagKey","==", currentTagKey),
    orderBy("task")
  );

  unsubTasks = onSnapshot(qy, (snap)=>{
    const tasks = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderTasks(tasks);
  });
}

function renderTasks(tasks){
  taskList.innerHTML = "";
  if(!tasks.length){
    taskList.innerHTML = `<div class="muted">Keine Aufgaben für diesen Tag.</div>`;
    return;
  }

  tasks.forEach(t=>{
    const doneBy = Array.isArray(t.doneBy) ? t.doneBy.join(", ") : "";
    const ok = (t.status === "✅");
    const finalOk = !!t.finalOk;

    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <label class="check">
        <input type="checkbox" data-id="${t.id}" ${ok?"checked":""} />
        <span class="title">${escapeHtml(t.task||"")}</span>
      </label>
      <div class="sub muted small">
        ${doneBy ? `Erledigt von: ${escapeHtml(doneBy)}` : ""}
        ${finalOk ? ` · 🧾 Endkontrolle: ${escapeHtml(t.finalBy||"")}` : ""}
      </div>
      ${isAdmin ? `
        <div class="actions">
          <button class="btn ghost" data-edit="1">✏️</button>
          <button class="btn ghost" data-reset="1">↩️</button>
          <button class="btn ghost" data-final="1">🧾</button>
          <button class="btn ghost" data-del="1">🗑️</button>
        </div>
      ` : ``}
    `;

    const cb = div.querySelector("input[type=checkbox]");
    cb.onchange = async ()=>{
      if(cb.checked){
        // mark done with my name
        const nm = myDisplayName || n(usernameSel.value);
        if(!nm){
          alert("Bitte zuerst Name auswählen und Start drücken.");
          cb.checked = false;
          return;
        }
        await updateDoc(doc(db,"daily_tasks",t.id), {
          status:"✅",
          doneBy: arrayUnion(nm),
          doneAtLast: stamp(),
          updatedAt: serverTimestamp()
        });
      }else{
        if(!isAdmin){
          alert("Nur Admin kann zurücksetzen.");
          cb.checked = true;
          return;
        }
        await updateDoc(doc(db,"daily_tasks",t.id), {
          status:"❌",
          doneBy: [],
          doneAtLast: "",
          finalOk:false,
          finalBy:"",
          pointsBooked:false,
          bookedFor: [],
          updatedAt: serverTimestamp()
        });
      }
    };

    if(isAdmin){
      div.querySelector('[data-edit="1"]').onclick = async ()=>{
        const nt = prompt("Aufgabe bearbeiten:", t.task||"");
        if(nt == null) return;
        await updateDoc(doc(db,"daily_tasks",t.id), { task:n(nt), updatedAt: serverTimestamp() });
      };
      div.querySelector('[data-reset="1"]').onclick = async ()=>{
        if(!confirm("Aufgabe zurücksetzen?")) return;
        await updateDoc(doc(db,"daily_tasks",t.id), {
          status:"❌", doneBy:[], doneAtLast:"", finalOk:false, finalBy:"",
          pointsBooked:false, bookedFor:[], updatedAt: serverTimestamp()
        });
      };
      div.querySelector('[data-final="1"]').onclick = async ()=>{
        if(t.status !== "✅"){
          alert("Endkontrolle nur bei ✅.");
          return;
        }
        await updateDoc(doc(db,"daily_tasks",t.id), { finalOk: !t.finalOk, finalBy: myDisplayName, updatedAt: serverTimestamp() });
      };
      div.querySelector('[data-del="1"]').onclick = async ()=>{
        if(!confirm("Aufgabe löschen?")) return;
        await deleteDoc(doc(db,"daily_tasks",t.id));
      };
    }

    taskList.appendChild(div);
  });
}

// ---------- Rides ----------
async function addRide(){
  const name = n(rideNameSel.value);
  const eins = n(rideEinsatz.value);
  if(!name){ alert("Name fehlt."); return; }
  if(!eins){ alert("Einsatznummer fehlt."); return; }

  const day = todayKey();
  const ref = doc(db, "rides_daily", day, "people", canonKey_(name));
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : { name, rides:[] };

  const rides = Array.isArray(data.rides) ? data.rides.slice(0) : [];
  rides.push({ einsatz:eins, at: stamp() });

  await setDoc(ref, { name, rides, updatedAt: serverTimestamp() }, { merge:true });

  rideEinsatz.value = "";
  alert("Fahrt gespeichert ✓");
}

// ---------- Admin: Employees list ----------
function renderAdminEmployees(list){
  adminEmployeesList.innerHTML = "";
  list.forEach(name=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main"><div class="title">${escapeHtml(name)}</div></div>
      <div class="actions"><button class="btn ghost" data-del="1">🗑️</button></div>
    `;
    div.querySelector('[data-del="1"]').onclick = async ()=>{
      if(!confirm(`"${name}" löschen?`)) return;
      // doc id = canonKey(name) in our schema
      await deleteDoc(doc(db,"employees_public", canonKey_(name)));
    };
    adminEmployeesList.appendChild(div);
  });
}

async function addEmployee(){
  const name = n(addEmployeeInput.value);
  if(!name){ alert("Name fehlt."); return; }
  await setDoc(doc(db,"employees_public", canonKey_(name)), { name, createdAt: serverTimestamp() }, { merge:true });
  addEmployeeInput.value="";
}

// ---------- Admin: Tags ----------
async function addTag(){
  const tid = n(addTagInput.value);
  if(!tid){ alert("Tag_ID fehlt."); return; }
  const key = canonKey_(tid);
  await setDoc(doc(db,"tags", key), { tagId: tid, tagKey:key, createdAt: serverTimestamp() }, { merge:true });
  addTagInput.value="";
}

function renderAdminTags(tags){
  adminTagsList.innerHTML = "";
  tags.forEach(t=>{
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="main">
        <div class="title">🏷️ ${escapeHtml(t.tagId||t.id)}</div>
        <div class="sub muted small">${escapeHtml(t.id)}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-open="1">Öffnen</button>
        <button class="btn ghost" data-del="1">🗑️</button>
      </div>
    `;
    div.querySelector('[data-open="1"]').onclick = ()=> openTag(t.tagId||t.id);
    div.querySelector('[data-del="1"]').onclick = async ()=>{
      if(!confirm("Tag + ALLE Tasks zu diesem Tag wirklich löschen?")) return;
      try{
        const res = await clientDeleteTagWithTasks_(t.id);
        alert(`Gelöscht ✓ (Tasks: ${res.deletedTasks})`);
      }catch(e){
        alert("Fehler: " + (e?.message || e));
      }
    };
    adminTagsList.appendChild(div);
  });
}

async function loadAdminTags(){
  if(unsubAdminTags) unsubAdminTags();
  unsubAdminTags = onSnapshot(query(collection(db,"tags"), orderBy("tagId")), (snap)=>{
    const tags = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderAdminTags(tags);
  });
}

// ---------- Points (admin only) ----------
async function loadPoints(){
  if(unsubPoints) unsubPoints();
  unsubPoints = onSnapshot(query(collection(db,"employees"), orderBy("name")), (snap)=>{
    const items = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderPoints(items);
  });
}

function renderPoints(items){
  pointsList.innerHTML = "";
  if(!items.length){
    pointsList.innerHTML = `<div class="muted">Keine Punkte-Daten.</div>`;
    return;
  }
  items.forEach(p=>{
    const div = document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main">
        <div class="title">${escapeHtml(p.name||p.id)}</div>
        <div class="sub muted small">Aufgaben: ${Number(p.taskPoints||0)} · Fahrten: ${Number(p.ridePoints||0)}</div>
      </div>
      <div class="actions"><button class="btn ghost" data-edit="1">✏️</button></div>
    `;
    div.querySelector('[data-edit="1"]').onclick = async ()=>{
      const tp = prompt("Aufgabenpunkte:", String(Number(p.taskPoints||0)));
      if(tp == null) return;
      const rp = prompt("Fahrtenpunkte:", String(Number(p.ridePoints||0)));
      if(rp == null) return;
      await setDoc(doc(db,"employees", p.id), {
        name: p.name || p.id,
        taskPoints: Number(tp||0),
        ridePoints: Number(rp||0),
        updatedAt: serverTimestamp()
      }, { merge:true });
    };
    pointsList.appendChild(div);
  });
}

// ---------- Ultra Admin Mode helpers ----------
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
    wrap.open = g.open > 0;
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
      const all = ultraData.tasks.filter(t => (t.tagKey||"") === g.tagKey);
      for(const t of all){
        await updateDoc(doc(db,"daily_tasks",t.id), {
          status:"❌", doneBy:[], doneAtLast:"", finalOk:false, finalBy:"",
          pointsBooked:false, bookedFor:[], updatedAt: serverTimestamp()
        });
      }
      alert("Tag zurückgesetzt ✓");
    };
    wrap.querySelector('[data-finalall="1"]').onclick = async ()=>{
      if(!confirm(`Endkontrolle für alle erledigten Aufgaben in "${g.tagId}" setzen?`)) return;
      const allDone = ultraData.tasks.filter(t => (t.tagKey||"") === g.tagKey && (t.status==="✅") && !t.finalOk);
      for(const t of allDone){
        await updateDoc(doc(db,"daily_tasks",t.id), { finalOk:true, finalBy: myDisplayName, updatedAt: serverTimestamp() });
      }
      alert("Endkontrolle gesetzt ✓");
    };
    wrap.querySelector('[data-deltag="1"]').onclick = async ()=>{
      if(!confirm(`Tag "${g.tagId}" + ALLE Tasks löschen?`)) return;
      try{
        const res = await clientDeleteTagWithTasks_(g.tagKey);
        alert(`Tag gelöscht ✓ (Tasks: ${res.deletedTasks})`);
      }catch(e){ alert("Fehler: " + (e?.message || e)); }
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
          await updateDoc(doc(db,"daily_tasks",t.id), { status:"✅", doneBy: arrayUnion(myDisplayName), doneAtLast: stamp(), updatedAt: serverTimestamp() });
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
  unsubUltraTasks = onSnapshot(query(collection(db,"daily_tasks"), orderBy("tagKey"), orderBy("task")), (snap)=>{
    ultraData.tasks = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderUltraDashboard();
  });
}

// ---------- Actions ----------
async function login(){
  const name = n(usernameSel.value);
  if(!name){ alert("Bitte Name auswählen."); return; }
  await ensureAnonAuth();
  await ensureUserProfile_(name);
  await refreshClaimsAndProfile();

  doneAsName.textContent = `Angemeldet als: ${myDisplayName || name}`;
  show(loginView, false);
  show(appView, true);
}

async function logout(){
  try{
    if(unsubTasks) unsubTasks();
    if(unsubTags) unsubTags();
    currentTagId = "";
    currentTagKey = "";
    await signOut(auth);
  }catch(e){}
  location.reload();
}

function closeTag(){
  currentTagId = "";
  currentTagKey = "";
  if(unsubTasks) unsubTasks();
  openTagTitle.textContent = "Kein Tag geöffnet";
  taskList.innerHTML = "";
  show(loginView, false);
  show(appView, true);
}

// ---------- Bind ----------
function bind(){
  tagSearch.oninput = ()=> loadTags(); // will re-render on snapshot anyway
  closeTagBtn.onclick = closeTag;

  loginBtn.onclick = login;
  logoutBtn.onclick = logout;

  addRideBtn.onclick = addRide;

  addEmployeeBtn.onclick = addEmployee;
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

  // UID button (works even before Start)
  if(showUidBtn){
    showUidBtn.onclick = async ()=>{
      try{
        await ensureAnonAuth();
        await refreshClaimsAndProfile();
        const uid = auth.currentUser?.uid || "";
        if(!uid){ alert("Keine UID."); return; }
        uidBox.textContent = "UID: " + uid + " (tippen zum Kopieren)";
        uidBox.onclick = async ()=>{
          try{
            await navigator.clipboard.writeText(uid);
            alert("UID kopiert ✓");
          }catch(e){
            alert(uid);
          }
        };
        alert("Deine UID:\n" + uid);
      }catch(e){
        alert("UID Fehler: " + (e?.message || e));
      }
    };
  }

  // Add task: double click title
  openTagTitle.ondblclick = async ()=>{
    if(!isAdmin) return;
    if(!currentTagKey){ alert("Bitte erst Tag öffnen."); return; }
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
      pointsBooked: false,
      bookedFor: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  };
}

// ---------- App start ----------
document.addEventListener("DOMContentLoaded", async ()=>{
  bind();

  // Setup view already handled above when firebaseConfig missing

  show(loginView, true);
  show(appView, false);

  onAuthStateChanged(auth, async (u)=>{
    if(!u){
      // Stay on login view until Start
      show(pointsCard, false);
      show(adminCard, false);
      doneAsName.textContent = "";
      loadEmployees();
      loadTags();
      return;
    }

    await refreshClaimsAndProfile();
    loadEmployees();
    loadTags();

    if(isAdmin){
      await loadAdminTags();
      await loadPoints();
      await startUltraTasksStream();
    }
  });
});
