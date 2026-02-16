import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, serverTimestamp, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* ========= small helpers ========= */
const $ = (id)=>document.getElementById(id);
const n = (v)=>String(v ?? "").replace(/\s+/g," ").trim();
const key = (s)=>n(s).toLowerCase().replace(/["'„“”]/g,"").replace(/[^a-z0-9äöüß]/g,"");
const todayKey = ()=>{
  const d=new Date(); const p=(x)=>String(x).padStart(2,"0");
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
};
const stamp = ()=>{
  const d=new Date(); const p=(x)=>String(x).padStart(2,"0");
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
function show(el, on){ el.hidden = !on; }
function esc(s){
  return String(s??"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

/* ========= config bootstrap (iPad) ========= */
function loadCfg(){
  try{ return JSON.parse(localStorage.getItem("firebaseConfig")||""); }catch(e){ return null; }
}
function saveCfg(obj){
  localStorage.setItem("firebaseConfig", JSON.stringify(obj));
}
function parseCfg(txt){
  const t=String(txt||"").trim();
  const m=t.match(/\{[\s\S]*\}/);
  if(!m) throw new Error("Kein JSON-Objekt gefunden.");
  const obj=JSON.parse(m[0]);
  if(!obj.projectId || !obj.apiKey) throw new Error("projectId/apiKey fehlen.");
  return obj;
}

/* ========= DOM ========= */
const setupView=$("setupView"), loginView=$("loginView"), appView=$("appView");
const firebaseCfg=$("firebaseCfg"), saveCfgBtn=$("saveCfgBtn"), resetCfgBtn=$("resetCfgBtn"), setupErr=$("setupErr");

const whoami=$("whoami");
const reloadBtn=$("reloadBtn");
const logoutBtn=$("logoutBtn");

const nameSel=$("nameSel"), loginBtn=$("loginBtn");
const showUidBtn=$("showUidBtn"), copyUidBtn=$("copyUidBtn"), uidBox=$("uidBox");

const tagSearch=$("tagSearch"), tagList=$("tagList");

const tabs=[...document.querySelectorAll(".tab")];
const panes={
  tasks:$("tab_tasks"),
  rides:$("tab_rides"),
  admin:$("tab_admin"),
  god:$("tab_god")
};

const openTagTitle=$("openTagTitle"), tagMeta=$("tagMeta");
const closeTagBtn=$("closeTagBtn");
const newTaskBtn=$("newTaskBtn");
const taskList=$("taskList");

const rideNameSel=$("rideNameSel"), rideEinsatz=$("rideEinsatz"), addRideBtn=$("addRideBtn"), rideInfo=$("rideInfo");

const adminLock=$("adminLock"), adminArea=$("adminArea");
const empAdd=$("empAdd"), empAddBtn=$("empAddBtn"), empList=$("empList");
const tagAdd=$("tagAdd"), tagAddBtn=$("tagAddBtn"), adminTagList=$("adminTagList");

const godLock=$("godLock"), godArea=$("godArea");
const godSummary=$("godSummary"), godSearch=$("godSearch"), godList=$("godList");
const toggleOnlyOpenBtn=$("toggleOnlyOpenBtn"), collapseAllBtn=$("collapseAllBtn"), dayChangeBtn=$("dayChangeBtn");

/* ========= state ========= */
let app=null, auth=null, db=null;
let meName="";
let isAdmin=false;
let currentTagId="", currentTagKey="";
let unsubEmployees=null, unsubTags=null, unsubTasks=null, unsubAllTasks=null;

/* ========= init ========= */
const cfg = loadCfg();
if(!cfg){
  show(setupView,true); show(loginView,false); show(appView,false);
  saveCfgBtn.onclick=()=>{
    setupErr.textContent="";
    try{
      const obj=parseCfg(firebaseCfg.value);
      saveCfg(obj);
      location.reload();
    }catch(e){ setupErr.textContent = e.message || String(e); }
  };
  resetCfgBtn.onclick=()=>{ localStorage.removeItem("firebaseConfig"); location.reload(); };
}else{
  boot(cfg);
}

async function boot(cfg){
  app=initializeApp(cfg);
  auth=getAuth(app);
  db=getFirestore(app);

  show(setupView,false); show(loginView,true); show(appView,false);

  reloadBtn.onclick=()=>location.reload();
  logoutBtn.onclick=async ()=>{
    try{ await signOut(auth); }catch(e){}
    localStorage.removeItem("meName");
    location.reload();
  };

  tabs.forEach(t=>{
    t.onclick=()=>{
      tabs.forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      const tab=t.dataset.tab;
      Object.values(panes).forEach(p=>show(p,false));
      show(panes[tab],true);
    };
  });

  closeTagBtn.onclick=()=>{ currentTagId=""; currentTagKey=""; openTagTitle.textContent="Kein Tag geöffnet"; tagMeta.textContent=""; taskList.innerHTML=""; if(unsubTasks) unsubTasks(); };
  newTaskBtn.onclick=async ()=>{
    if(!isAdmin){ alert("Nur Admin."); return; }
    if(!currentTagKey){ alert("Erst Tag öffnen."); return; }
    const txt = prompt("Neue Aufgabe:");
    if(!txt) return;
    await addDoc(collection(db,"daily_tasks"), {
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
  };

  addRideBtn.onclick = addRide;
  empAddBtn.onclick = addEmployee;
  tagAddBtn.onclick = addTag;

  toggleOnlyOpenBtn.onclick=()=>{ ultraOnlyOpen = !ultraOnlyOpen; renderGod(); };
  collapseAllBtn.onclick=()=>{ godList.querySelectorAll("details").forEach(d=>d.open=false); };
  dayChangeBtn.onclick=runDayChange;

  tagSearch.oninput=()=>renderTags(lastTags);
  godSearch.oninput=()=>renderGod();

  showUidBtn.onclick = showUid;
  copyUidBtn.onclick = async ()=>{
    const uid = auth?.currentUser?.uid || "";
    if(!uid) return;
    try{ await navigator.clipboard.writeText(uid); alert("UID kopiert ✓"); }catch(e){ alert(uid); }
  };

  loginBtn.onclick = async ()=>{
    const nm = n(nameSel.value);
    if(!nm){ alert("Bitte Name wählen."); return; }
    await ensureAnon();
    await setDoc(doc(db,"users",auth.currentUser.uid), { name:nm, updatedAt:serverTimestamp() }, { merge:true });
    localStorage.setItem("meName", nm);
    await refreshMe();
    show(loginView,false); show(appView,true);
    tabs[0].click(); // tasks tab
  };

  onAuthStateChanged(auth, async (u)=>{
    if(!u){
      // keep login view; load employees/tags for browsing
      await loadEmployees();
      await loadTags();
      return;
    }
    await refreshMe();
    await loadEmployees();
    await loadTags();
    // auto-login if name stored
    const stored = n(localStorage.getItem("meName"));
    if(stored){
      meName = stored;
      whoami.textContent = `${meName}${isAdmin?" · ADMIN":""}`;
      show(loginView,false); show(appView,true);
      tabs[0].click();
      startGodStreamIfAdmin();
    }else{
      show(loginView,true); show(appView,false);
    }
  });

  // auto sign-in for UID button reliability
  await ensureAnon();
}

/* ========= auth/admin ========= */
async function ensureAnon(){
  if(auth.currentUser) return;
  await signInAnonymously(auth);
}
async function refreshMe(){
  await ensureAnon();
  const uid = auth.currentUser.uid;
  const us = await getDoc(doc(db,"users",uid));
  meName = us.exists() ? (us.data().name || "") : "";
  // AUTO ADMIN via admins/{uid}
  const ad = await getDoc(doc(db,"admins",uid));
  isAdmin = ad.exists();
  whoami.textContent = `${meName || "—"}${isAdmin?" · ADMIN":""}`;

  show(adminLock, !isAdmin); show(adminArea, isAdmin);
  show(godLock, !isAdmin); show(godArea, isAdmin);

  if(isAdmin) startGodStreamIfAdmin();
}
async function showUid(){
  try{
    await ensureAnon();
    const uid = auth.currentUser.uid;
    uidBox.textContent = uid;
    copyUidBtn.disabled = false;
    alert("Deine UID:\n" + uid);
  }catch(e){
    alert("UID Fehler: " + (e.message || e));
  }
}

/* ========= employees ========= */
let lastEmployees=[];
async function loadEmployees(){
  if(unsubEmployees) unsubEmployees();
  unsubEmployees = onSnapshot(query(collection(db,"employees_public"), orderBy("name")), (snap)=>{
    lastEmployees = snap.docs.map(d=>n(d.data().name)).filter(Boolean);
    renderEmployeeSelectors();
    if(isAdmin) renderEmployeeAdmin();
  });
}
function renderEmployeeSelectors(){
  const opts = [`<option value="">Name wählen…</option>`]
    .concat(lastEmployees.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`));
  nameSel.innerHTML = opts.join("");
  rideNameSel.innerHTML = opts.join("");
  // preselect stored
  const stored=n(localStorage.getItem("meName"));
  if(stored){
    nameSel.value = stored;
    rideNameSel.value = stored;
  }
}
function renderEmployeeAdmin(){
  empList.innerHTML = "";
  lastEmployees.forEach(name=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML = `
      <div class="main"><div class="title">${esc(name)}</div></div>
      <div class="actions"><button class="btn ghost" data-del="1">🗑️</button></div>
    `;
    div.querySelector('[data-del="1"]').onclick = async ()=>{
      if(!confirm(`"${name}" löschen?`)) return;
      await deleteDoc(doc(db,"employees_public", key(name)));
    };
    empList.appendChild(div);
  });
}
async function addEmployee(){
  if(!isAdmin){ alert("Nur Admin."); return; }
  const nm=n(empAdd.value);
  if(!nm){ alert("Name fehlt."); return; }
  await setDoc(doc(db,"employees_public", key(nm)), { name:nm, updatedAt:serverTimestamp() }, { merge:true });
  empAdd.value="";
}

/* ========= tags ========= */
let lastTags=[];
async function loadTags(){
  if(unsubTags) unsubTags();
  unsubTags = onSnapshot(query(collection(db,"tags"), orderBy("tagId")), (snap)=>{
    lastTags = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    renderTags(lastTags);
    if(isAdmin) renderAdminTags(lastTags);
  });
}
function renderTags(tags){
  const q=n(tagSearch.value).toLowerCase();
  const list = tags.filter(t=>{
    const id=(t.tagId||t.id||"").toLowerCase();
    return !q || id.includes(q);
  });

  tagList.innerHTML="";
  list.forEach(t=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`
      <div class="main">
        <div class="title">🏷️ ${esc(t.tagId||t.id)}</div>
        <div class="sub muted small">${esc(t.tagKey||t.id)}</div>
      </div>
      <div class="actions"><button class="btn ghost">Öffnen</button></div>
    `;
    div.querySelector("button").onclick=()=>openTag(t.tagId||t.id);
    tagList.appendChild(div);
  });
  if(!list.length) tagList.innerHTML = `<div class="muted">Keine Tags.</div>`;
}
async function addTag(){
  if(!isAdmin){ alert("Nur Admin."); return; }
  const tid=n(tagAdd.value);
  if(!tid){ alert("Tag_ID fehlt."); return; }
  const k=key(tid);
  await setDoc(doc(db,"tags",k), { tagId:tid, tagKey:k, updatedAt:serverTimestamp() }, { merge:true });
  tagAdd.value="";
}
function renderAdminTags(tags){
  adminTagList.innerHTML="";
  tags.forEach(t=>{
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`
      <div class="main">
        <div class="title">🏷️ ${esc(t.tagId||t.id)}</div>
        <div class="sub muted small">${esc(t.id)}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-open="1">Öffnen</button>
        <button class="btn ghost" data-del="1">🗑️</button>
      </div>
    `;
    div.querySelector('[data-open="1"]').onclick=()=>openTag(t.tagId||t.id);
    div.querySelector('[data-del="1"]').onclick=()=>deleteTagWithTasks(t.id, t.tagId||t.id);
    adminTagList.appendChild(div);
  });
}

/* ========= tag open + tasks ========= */
async function openTag(tagId){
  const tid=n(tagId); if(!tid) return;
  currentTagId=tid; currentTagKey=key(tid);
  openTagTitle.textContent = `Tag: ${tid}`;
  tagMeta.textContent = `tagKey: ${currentTagKey}`;
  if(unsubTasks) unsubTasks();
  unsubTasks = onSnapshot(
    query(collection(db,"daily_tasks"), where("tagKey","==", currentTagKey), orderBy("task")),
    (snap)=> renderTasks(snap.docs.map(d=>({ id:d.id, ...d.data() })))
  );
  // switch to tasks tab
  tabs.find(x=>x.dataset.tab==="tasks")?.click();
}

function renderTasks(tasks){
  taskList.innerHTML="";
  if(!tasks.length){
    taskList.innerHTML = `<div class="muted">Keine Aufgaben.</div>`;
    return;
  }
  tasks.forEach(t=>{
    const doneBy = Array.isArray(t.doneBy) ? t.doneBy.join(", ") : "";
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`
      <div class="main">
        <div class="title">${t.status==="✅"?"✅":"⏳"} ${esc(t.task||"")}</div>
        <div class="sub muted small">
          ${doneBy?`Erledigt von: ${esc(doneBy)}`:""}
          ${t.finalOk?` · 🧾 Endkontrolle: ${esc(t.finalBy||"")}`:""}
        </div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-done="1">${t.status==="✅"?"↩️":"✅"}</button>
        ${isAdmin?`<button class="btn ghost" data-final="1">🧾</button>
        <button class="btn ghost" data-edit="1">✏️</button>
        <button class="btn ghost" data-del="1">🗑️</button>`:""}
      </div>
    `;

    div.querySelector('[data-done="1"]').onclick = async ()=>{
      if(t.status!=="✅"){
        if(!meName){ alert("Bitte einloggen."); return; }
        await updateDoc(doc(db,"daily_tasks",t.id), {
          status:"✅",
          doneBy: Array.from(new Set([...(Array.isArray(t.doneBy)?t.doneBy:[]), meName])),
          doneAtLast: stamp(),
          updatedAt: serverTimestamp()
        });
      }else{
        if(!isAdmin){ alert("Nur Admin kann zurücksetzen."); return; }
        await updateDoc(doc(db,"daily_tasks",t.id), {
          status:"❌",
          doneBy: [],
          doneAtLast: "",
          finalOk:false,
          finalBy:"",
          updatedAt: serverTimestamp()
        });
      }
    };

    if(isAdmin){
      div.querySelector('[data-final="1"]').onclick = async ()=>{
        if(t.status!=="✅"){ alert("Endkontrolle nur bei ✅."); return; }
        await updateDoc(doc(db,"daily_tasks",t.id), { finalOk: !t.finalOk, finalBy: meName || "Admin", updatedAt: serverTimestamp() });
      };
      div.querySelector('[data-edit="1"]').onclick = async ()=>{
        const nt=prompt("Aufgabe:", t.task||"");
        if(nt==null) return;
        await updateDoc(doc(db,"daily_tasks",t.id), { task:n(nt), updatedAt: serverTimestamp() });
      };
      div.querySelector('[data-del="1"]').onclick = async ()=>{
        if(!confirm("Aufgabe löschen?")) return;
        await deleteDoc(doc(db,"daily_tasks",t.id));
      };
    }

    taskList.appendChild(div);
  });
}

/* ========= rides ========= */
async function addRide(){
  if(!meName){ alert("Bitte einloggen."); return; }
  const name=n(rideNameSel.value || meName);
  const eins=n(rideEinsatz.value);
  if(!name){ alert("Name fehlt."); return; }
  if(!eins){ alert("Einsatznummer fehlt."); return; }
  const day=todayKey();
  const ref=doc(db,"rides_daily",day,"people",key(name));
  const snap=await getDoc(ref);
  const data=snap.exists()?snap.data():{ name, rides:[] };
  const rides=Array.isArray(data.rides)?data.rides.slice(0):[];
  rides.push({ einsatz:eins, at:stamp() });
  await setDoc(ref,{ name, rides, updatedAt:serverTimestamp() },{ merge:true });
  rideEinsatz.value="";
  rideInfo.textContent = "Gespeichert ✓";
}

/* ========= GOD MODE ========= */
let ultraOnlyOpen=false;
let allTasks=[];

function startGodStreamIfAdmin(){
  if(!isAdmin) return;
  if(unsubAllTasks) return;
  unsubAllTasks = onSnapshot(
    query(collection(db,"daily_tasks"), orderBy("tagKey"), orderBy("task")),
    (snap)=>{ allTasks=snap.docs.map(d=>({ id:d.id, ...d.data() })); renderGod(); }
  );
}

function renderGod(){
  if(!isAdmin){ godSummary.textContent=""; godList.innerHTML=""; return; }
  const q = n(godSearch.value).toLowerCase();

  // group by tagKey
  const map=new Map();
  for(const t of allTasks){
    const tk=t.tagKey||""; if(!tk) continue;
    if(!map.has(tk)) map.set(tk,{ tagKey:tk, tagId:t.tagId||tk, open:0, done:0, final:0, openTasks:[] });
    const g=map.get(tk);
    if((t.status||"❌")==="✅") g.done++; else { g.open++; g.openTasks.push(t); }
    if(t.finalOk) g.final++;
    if(t.tagId) g.tagId=t.tagId;
  }
  let groups=[...map.values()].sort((a,b)=>(a.tagId||"").localeCompare(b.tagId||""));

  if(ultraOnlyOpen) groups=groups.filter(g=>g.open>0);
  if(q){
    groups=groups.filter(g=>{
      const inTag=(g.tagId||"").toLowerCase().includes(q);
      const inTasks=g.openTasks.some(t=>String(t.task||"").toLowerCase().includes(q));
      return inTag || inTasks;
    });
  }

  // summary
  const totalTags=groups.length;
  let totalTasks=allTasks.length, open=0, done=0, fin=0;
  for(const g of [...map.values()]){ open+=g.open; done+=g.done; fin+=g.final; }
  godSummary.textContent = `Tags: ${totalTags} · Aufgaben: ${totalTasks} · Offen: ${open} · Erledigt: ${done} · Endkontrolle: ${fin}`;

  godList.innerHTML="";
  if(!groups.length){
    godList.innerHTML = `<div class="muted">Keine Treffer.</div>`;
    return;
  }

  for(const g of groups){
    const det=document.createElement("details");
    det.className="detailsCard";
    det.open = g.open>0;
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

    det.querySelector('[data-open="1"]').onclick=()=>openTag(g.tagId);
    det.querySelector('[data-reset="1"]').onclick=()=>bulkResetTag(g.tagKey, g.tagId);
    det.querySelector('[data-finalall="1"]').onclick=()=>bulkFinalAll(g.tagKey, g.tagId);
    det.querySelector('[data-delete="1"]').onclick=()=>deleteTagWithTasks(g.tagKey, g.tagId);

    const list=det.querySelector('[data-list="1"]');
    if(!g.openTasks.length){
      list.innerHTML = `<div class="muted">Keine offenen Aufgaben.</div>`;
    }else{
      g.openTasks.slice(0,30).forEach(t=>{
        const it=document.createElement("div");
        it.className="item";
        it.innerHTML=`
          <div class="main">
            <div class="title">⏳ ${esc(t.task||"")}</div>
            <div class="sub muted small">${Array.isArray(t.doneBy)&&t.doneBy.length?`Erledigt von: ${esc(t.doneBy.join(", "))}`:""}</div>
          </div>
          <div class="actions">
            <button class="btn ghost" data-done="1">✅</button>
            <button class="btn ghost" data-edit="1">✏️</button>
            <button class="btn ghost" data-del="1">🗑️</button>
          </div>
        `;
        it.querySelector('[data-done="1"]').onclick=async ()=>{
          await updateDoc(doc(db,"daily_tasks",t.id), {
            status:"✅",
            doneBy: Array.from(new Set([...(Array.isArray(t.doneBy)?t.doneBy:[]), meName])),
            doneAtLast: stamp(),
            updatedAt: serverTimestamp()
          });
        };
        it.querySelector('[data-edit="1"]').onclick=async ()=>{
          const nt=prompt("Aufgabe:", t.task||"");
          if(nt==null) return;
          await updateDoc(doc(db,"daily_tasks",t.id), { task:n(nt), updatedAt: serverTimestamp() });
        };
        it.querySelector('[data-del="1"]').onclick=async ()=>{
          if(!confirm("Aufgabe löschen?")) return;
          await deleteDoc(doc(db,"daily_tasks",t.id));
        };
        list.appendChild(it);
      });
      if(g.openTasks.length>30){
        const more=document.createElement("div");
        more.className="muted small";
        more.textContent=`… ${g.openTasks.length-30} weitere offene Aufgaben (Suche nutzen oder Tag öffnen).`;
        list.appendChild(more);
      }
    }

    godList.appendChild(det);
  }
}

async function bulkResetTag(tagKey, tagId){
  if(!confirm(`Alle Aufgaben in "${tagId}" zurücksetzen?`)) return;
  const snap = await getDocs(query(collection(db,"daily_tasks"), where("tagKey","==", tagKey)));
  for(const d of snap.docs){
    await updateDoc(d.ref, { status:"❌", doneBy:[], doneAtLast:"", finalOk:false, finalBy:"", updatedAt:serverTimestamp() });
  }
  alert("Reset ✓");
}
async function bulkFinalAll(tagKey, tagId){
  if(!confirm(`Endkontrolle für alle ✅ in "${tagId}" setzen?`)) return;
  const snap = await getDocs(query(collection(db,"daily_tasks"), where("tagKey","==", tagKey)));
  for(const d of snap.docs){
    const t=d.data();
    if((t.status||"") === "✅" && !t.finalOk){
      await updateDoc(d.ref, { finalOk:true, finalBy: meName||"Admin", updatedAt:serverTimestamp() });
    }
  }
  alert("Endkontrolle ✓");
}
async function deleteTagWithTasks(tagKey, tagId){
  if(!confirm(`Tag "${tagId}" + ALLE Tasks löschen?`)) return;
  const batch = writeBatch(db);
  const tasks = await getDocs(query(collection(db,"daily_tasks"), where("tagKey","==", tagKey)));
  tasks.docs.forEach(d=>batch.delete(d.ref));
  batch.delete(doc(db,"tags", tagKey));
  await batch.commit();
  alert(`Gelöscht ✓ (Tasks: ${tasks.size})`);
}

async function runDayChange(){
  if(!isAdmin){ alert("Nur Admin."); return; }
  if(!confirm("Tageswechsel starten?\nArchiviert alle Tasks & Fahrten von HEUTE und leert die Listen.")) return;

  const day=todayKey();

  // archive tasks
  const tasks = await getDocs(query(collection(db,"daily_tasks")));
  for(const d of tasks.docs){
    await setDoc(doc(db,"archives",day,"tasks",d.id), { ...d.data(), dayKey:day, archivedAt:serverTimestamp() }, { merge:true });
  }
  // delete tasks in batches
  await deleteDocsInBatches(tasks.docs.map(d=>d.ref));

  // archive rides (today)
  const rides = await getDocs(query(collection(db,"rides_daily",day,"people")));
  for(const d of rides.docs){
    await setDoc(doc(db,"rides_archives",day,"people",d.id), { ...d.data(), dayKey:day, archivedAt:serverTimestamp() }, { merge:true });
  }
  await deleteDocsInBatches(rides.docs.map(d=>d.ref));

  alert(`Tageswechsel ✓\nArchiv Tasks: ${tasks.size}\nArchiv Fahrten: ${rides.size}`);
}

async function deleteDocsInBatches(refs){
  const chunk=350;
  for(let i=0;i<refs.length;i+=chunk){
    const b=writeBatch(db);
    refs.slice(i,i+chunk).forEach(r=>b.delete(r));
    await b.commit();
  }
}
