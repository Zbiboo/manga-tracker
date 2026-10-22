// Lets the app open without a connection. App files are fetched fresh when
// online (so updates show up straight away) and served from cache when offline.
// Requests to other sites (Supabase, book lookups, covers) are left alone,
// apart from the Supabase library, which the app needs to start.
const CACHE = "manga-tracker-v1";
const LIBS = ["https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"];
const FILES = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const ours = new URL(req.url).origin === location.origin || LIBS.includes(req.url);
  if (req.method !== "GET" || !ours) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
