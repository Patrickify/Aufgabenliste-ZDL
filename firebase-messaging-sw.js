importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

// NOTE: In client-only setup we can’t securely inject config here.
// This SW will still show notifications if Firebase is initialized by a compatible setup later.
// It won’t break the app if not used.
try {
  const firebaseConfig = {}; // optional
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || "Benachrichtigung";
    const body  = payload?.notification?.body  || "";
    self.registration.showNotification(title, { body, data: payload?.data || {} });
  });
} catch(e) {}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async ()=>{
    const cs = await clients.matchAll({ type:"window", includeUncontrolled:true });
    if (cs.length) cs[0].focus();
    else clients.openWindow("./");
  })());
});
