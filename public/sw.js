// El Ganso Turnos - Service Worker v7
// Cache for offline + push notifications
// Compatible with Safari/iOS PWA

var CACHE = "eg-turnos-v7";
var OFFLINE = "/offline.html";
var PRECACHE = ["/login", "/offline.html", "/logo.png", "/logo-white.png", "/logo-small.png", "/icons/icon-192.png"];

self.addEventListener("install", function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(PRECACHE);
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
  var url = e.request.url;
  var isNav = e.request.mode === "navigate";
  var isGet = e.request.method === "GET";
  var isSameOrigin = url.startsWith(self.location.origin);
  var isApi = url.indexOf("/api/") !== -1;

  // Skip non-GET, cross-origin, and API requests
  if (!isGet || !isSameOrigin || isApi) return;

  // Navigation: network first, fallback to cache, then offline page
  if (isNav) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        if (res && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      }).catch(function() {
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match(OFFLINE);
        });
      })
    );
    return;
  }

  // Static assets: cache first, fallback to network
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        if (res && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
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
