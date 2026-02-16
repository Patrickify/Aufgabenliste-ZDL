:root{
  --bg:#f6f7fb;
  --card:#ffffff;
  --text:#0f172a;
  --muted:#64748b;
  --blue:#2563eb;
  --border:#e5e7eb;
  --danger:#dc2626;
  --radius:16px;
}
*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;}
body{margin:0;background:var(--bg);color:var(--text);}
.topbar{
  position:sticky;top:0;z-index:10;
  display:flex;align-items:center;justify-content:space-between;
  padding:12px 16px;background:var(--card);border-bottom:1px solid var(--border);
}
.brand{font-weight:700;}
.container{max-width:900px;margin:0 auto;padding:16px;}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin:12px 0;box-shadow:0 6px 18px rgba(15,23,42,.06);}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.between{justify-content:space-between;}
.grid{display:grid;grid-template-columns:1fr;gap:10px;}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted);}
input{padding:10px 12px;border:1px solid var(--border);border-radius:12px;font-size:15px;background:#fff;}
.search{max-width:260px;}
.btn{
  padding:10px 12px;border-radius:12px;border:1px solid var(--blue);
  background:var(--blue);color:white;font-weight:600;
}
.btn.ghost{background:transparent;color:var(--blue);}
.btn:disabled{opacity:.6}
.hidden{display:none!important}
.muted{color:var(--muted);}
.small{font-size:12px}
.error{color:var(--danger);margin-top:10px;white-space:pre-wrap}
.list{display:flex;flex-direction:column;gap:8px;margin-top:10px;}
.item{
  border:1px solid var(--border);border-radius:14px;padding:10px 12px;background:#fff;
  display:flex;gap:10px;align-items:flex-start;justify-content:space-between;
}
.item .main{flex:1}
.item .title{font-weight:700}
.item .sub{color:var(--muted);font-size:13px;margin-top:4px}
.pill{border:1px solid var(--border);border-radius:999px;padding:6px 10px;color:var(--muted);font-size:12px;background:#fff;}
.divider{height:1px;background:var(--border);margin:12px 0;}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.chip{border:1px solid var(--border);border-radius:999px;padding:6px 10px;font-size:13px;background:#fff;display:flex;gap:8px;align-items:center}
.chip button{border:none;background:transparent;color:var(--danger);font-weight:700;cursor:pointer}
.who{color:var(--muted);font-size:13px;margin-right:8px}
.actions{display:flex;gap:8px;align-items:center}
.checkbox{transform:scale(1.2);margin-top:2px}

select.select{padding:10px 12px;border:1px solid var(--border);border-radius:12px;font-size:15px;background:#fff;}

details.cardlite{margin-top:12px;border:1px dashed var(--border);border-radius:14px;padding:10px 12px;background:#fff;}
summary{cursor:pointer;font-weight:600}

h3{margin:10px 0 6px 0;font-size:16px}

.detailsRow{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.smallbtn{padding:6px 10px;border-radius:10px}
.kpi{display:flex;gap:10px;flex-wrap:wrap}
.kpi .pill{font-size:12px}

textarea.input{width:100%;resize:vertical;}
const CACHE = "ultra-final-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./styles.css",
  "./manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k===CACHE)?null:caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith((async ()=>{
    const cached = await caches.match(req);
    if(cached) return cached;
    try{
      const res = await fetch(req);
      const url = new URL(req.url);
      if(url.origin === location.origin){
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    }catch(err){
      return cached || new Response("Offline", { status: 200 });
    }
  })());
});

