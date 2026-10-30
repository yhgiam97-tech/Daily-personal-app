/* Daily Brief service worker.
   Shell (incl. icons): stale-while-revalidate. Data: network first, cached copy when offline. */

const VERSION = "1.3.0";
const SHELL_CACHE = `brief-shell-${VERSION}`;
const DATA_CACHE = "brief-data";
const SHELL = [
  "./",
  "index.html",
  "app.css",
  "app.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, DATA_CACHE]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req.url.split("?")[0], res.clone());
    return res;
  } catch {
    const hit = await cache.match(req.url.split("?")[0]);
    if (hit) return hit;
    throw new Error("offline and not cached");
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await update) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && url.pathname.includes("/data/") && url.pathname.endsWith(".json")) {
    event.respondWith(networkFirst(req));
    return;
  }
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") {
      event.respondWith(fetch(req).catch(async () =>
        (await caches.match("index.html", { ignoreSearch: true })) || Response.error()));
      return;
    }
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
  }
});
