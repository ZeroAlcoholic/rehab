const VERSION = "rehab-shell-v27-auth-session";
const scope = new URL(self.registration.scope).pathname;
const cacheName = VERSION + ":" + scope;
const files = [
  "./",
  "./index.html",
  "./styles.css",
  "./docs/start.html",
  "./src/ui/theme.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./src/main.js",
  "./src/domain/training-day.js",
  "./src/ui/training-day.js",
  "./src/ui/exercise-illustration.js",
  "./src/ui/training-sets.js",
  "./src/domain/catalog.js",
  "./src/domain/records.js",
  "./src/domain/journal.js",
  "./src/domain/analytics.js",
  "./src/domain/rehab.js",
  "./src/domain/rehab-analysis.js",
  "./src/domain/inbody-series.js",
  "./src/domain/training-template.js",
  "./src/domain/muscles.js",
  "./src/domain/body-insights.js",
  "./src/domain/comparison.js",
  "./src/domain/training-streams.js",
  "./src/domain/equipment-shortcuts.js",
  "./src/storage/state.js",
  "./src/storage/repository.js",
  "./src/app/service.js",
  "./src/google/auth.js",
  "./src/google/config.js",
  "./src/google/sheets.js",
  "./src/google/rehab-sheet.js",
  "./src/sync/engine.js",
  "./src/ui/dom.js",
  "./src/ui/shell-ready.js",
  "./src/ui/training.js",
  "./src/ui/inbody.js",
  "./src/ui/history.js",
  "./src/ui/rehab-form.js",
  "./src/ui/rehab-panel.js",
  "./src/ui/rehab-visuals.js",
  "./src/ui/dashboard.js",
  "./src/ui/body-map.js",
  "./src/ui/body-drawing.js",
  "./src/ui/body-detail.js",
  "./src/ui/training-evidence.js",
  "./src/ui/record-quality.js",
  "./src/ui/body-composition.js",
  "./src/ui/body-controls.js",
  "./src/ui/body-regions.js",
  "./src/ui/body-geometry.js",
  "./src/ui/body-map.css",
  "./src/ui/settings.js",
  "./src/ui/equipment-shortcuts.js",
];
self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  if (event.data?.type === 'SHELL_INFO') {
    port.postMessage({version:VERSION, rehabRecords:true});
    return;
  }
  if (event.data?.type !== 'ACTIVATE_FROM_STARTER') return;
  event.waitUntil((async () => {
    const source = event.source;
    const starter = new URL('private/rehab-start.html', self.registration.scope);
    if (!source?.url || new URL(source.url).origin !== starter.origin || new URL(source.url).pathname !== starter.pathname) {
      port.postMessage({ready:false});
      return;
    }
    const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    // Never replace another editor's shell or discard an unsaved form.
    if (clients.some(client => client.id !== source.id && client.url.startsWith(self.registration.scope))) {
      port.postMessage({ready:false});
      return;
    }
    await self.skipWaiting();
    port.postMessage({ready:true});
  })());
});
self.addEventListener("install", (event) =>
  // A new shell must fetch current assets, even when HTTP cache entries are fresh.
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(
    files.map(file => new Request(new URL(file, self.registration.scope), {cache:'reload'})),
  ))),
);
// A new shell waits until all old tabs close; avoid mixing old UI and new modules.
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (
          key.startsWith("rehab-shell-") &&
          key.endsWith(":" + scope) &&
          key !== cacheName
        )
          await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(scope)
  )
    return;
  const allowed = new Set(
    files.map((file) => new URL(file, self.registration.scope).pathname),
  );
  if (!allowed.has(url.pathname)) return;
  event.respondWith(
    caches
      .open(cacheName)
      .then(
        async (cache) =>
          (await cache.match(url.pathname)) ?? fetch(event.request),
      ),
  );
});
