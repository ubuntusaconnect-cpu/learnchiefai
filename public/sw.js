// Learn Chief offline shell. Caches the app shell so learners can open the app
// and their downloaded videos with no connection. Video blobs live in IndexedDB.
const SHELL_CACHE = "learnchief-shell-v1";
const ASSET_CACHE = "learnchief-assets-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(["/", "/manifest.webmanifest"]).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API/auth traffic.
  if (url.pathname.startsWith("/_serverFn") || url.pathname.startsWith("/api/")) return;

  // Navigations: network first, fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("/", copy)).catch(() => undefined);
          return res;
        })
        .catch(async () => (await caches.match("/")) ?? new Response("Offline", { status: 503 })),
    );
    return;
  }

  // Static build assets: cache first (they are content-hashed).
  if (/\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico|json)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req)
            .then((res) => {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
              return res;
            })
            .catch(() => new Response("", { status: 504 })),
      ),
    );
  }
});
