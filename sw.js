/* Service worker do cryptos.json Studio.
   Objetivo: deixar o app instalável no celular e abrir rápido mesmo offline.
   Regras: /api/* nunca é cacheado, navegação é network-first e estáticos usam
   stale-while-revalidate. Trocar CACHE_VERSION invalida o cache antigo. */
const CACHE_VERSION = "cryptos-json-studio-v3";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/collection-policy.js",
  "/app.js",
  "/animations.js",
  "/vendor/gsap/gsap.min.js",
  "/vendor/gsap/ScrollTrigger.min.js",
  "/assets/logo.svg",
  "/assets/favicon.svg",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match("/index.html"));
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
