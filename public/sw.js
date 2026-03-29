// El Ganso Turnos - Service Worker v11
// Network-first for everything, cache only for offline fallback
// Push notifications

var CACHE = "eg-turnos-v11";
var OFFLINE = "/offline.html";

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll([OFFLINE, "/icons/icon-192.png"]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE; }).map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(e) {
  // Only handle GET same-origin non-API requests
  if (e.request.method !== "GET") return;
  if (!e.request.url.startsWith(self.location.origin)) return;
  if (e.request.url.indexOf("/api/") !== -1) return;

  // ALWAYS network first, cache as fallback only when offline
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        if (e.request.mode === "navigate") return caches.match(OFFLINE);
        return new Response("", { status: 408 });
      });
    })
  );
});

// Push notifications
self.addEventListener("push", function(e) {
  var data;
  try { data = e.data ? e.data.json() : {}; } catch(err) { data = {}; }
  e.waitUntil(
    self.registration.showNotification(data.title || "El Ganso Turnos", {
      body: data.body || "Nueva notificación",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" }
    })
  );
});

self.addEventListener("notificationclick", function(e) {
  e.notification.close();
  var url = e.notification.data && e.notification.data.url ? e.notification.data.url : "/";
  e.waitUntil(clients.openWindow(url));
});
