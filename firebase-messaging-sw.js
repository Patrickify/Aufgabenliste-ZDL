// ===============================
// ULTRA GOD MODE PUSH WORKER
// ===============================

importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

// Firebase Config wird später automatisch gesetzt
const firebaseConfig = self.firebaseConfig || {};

try {

  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {

    const title = payload?.notification?.title || "Neue Aufgabe";
    const body  = payload?.notification?.body  || "";

    self.registration.showNotification(title, {
      body: body,
      icon: "/icon-192.png",
      data: payload?.data || {}
    });

  });

} catch(e) {
  // ignore errors if config missing
}

self.addEventListener("notificationclick", (event) => {

  event.notification.close();

  event.waitUntil((async ()=>{

    const allClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    if(allClients.length){
      allClients[0].focus();
    } else {
      clients.openWindow("/");
    }

  })());

});
