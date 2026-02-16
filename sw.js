const CACHE = "ultra-god-v1";
const ASSETS = ["./","./index.html","./app.js","./styles.css","./manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k===CACHE ? null : caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  e.respondWith((async ()=>{
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const res = await fetch(e.request);
      const url = new URL(e.request.url);
      if (url.origin === location.origin) (await caches.open(CACHE)).put(e.request, res.clone());
      return res;
    } catch {
      return cached || new Response("Offline", { status: 200 });
    }
  })());
});
