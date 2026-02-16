importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyCPTt1ZZ-lj5qZ1Rrn-N7e5QZnhtXB-Pu8",
  authDomain: "aufgabenliste-zdl-ra-93.firebaseapp.com",
  projectId: "aufgabenliste-zdl-ra-93",
  storageBucket: "aufgabenliste-zdl-ra-93.firebasestorage.app",
  messagingSenderId: "857214150388",
  appId: "1:857214150388:web:8bc019911092be0cffe0a1",
  measurementId: "G-6MC0G2V2YY"
};

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = (payload?.notification?.title) || "Benachrichtigung";
    const body  = (payload?.notification?.body)  || "";
    self.registration.showNotification(title, { body, data: payload?.data || {} });
  });
} catch(e){}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async ()=>{
    const allClients = await clients.matchAll({ type:"window", includeUncontrolled:true });
    if(allClients.length) allClients[0].focus();
    else clients.openWindow("./");
  })());
});
