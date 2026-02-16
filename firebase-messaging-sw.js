/**
 * FCM Messaging SW (Web Push)
 * Notes:
 * - Must be served from root: /firebase-messaging-sw.js
 * - iOS/iPadOS: Web Push works only for installed PWA and requires visible notification. citeturn0search14
 */

// IMPORTANT: Fill with your firebase config values:
const firebaseConfig = {
  // apiKey: "...",
  // authDomain: "...",
  // projectId: "...",
  // messagingSenderId: "...",
  // appId: "..."
};

importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    // Safari requires presenting a notification; no silent pushes. citeturn0search14
    const title = (payload?.notification?.title) || "Benachrichtigung";
    const body = (payload?.notification?.body) || "";
    self.registration.showNotification(title, {
      body,
      data: payload?.data || {},
    });
  });
} catch (e) {
  // ignore
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async ()=>{
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    if (allClients.length > 0) {
      allClients[0].focus();
      allClients[0].postMessage({ type: "push_click", data: event.notification.data || {} });
    } else {
      clients.openWindow("/");
    }
  })());
});
