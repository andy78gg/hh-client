/**
 * The page's service worker: keeps the build and the sounds the game has played, so a returning
 * player downloads nothing that hasn't changed and can start offline. Also adds COOP/COEP headers
 * so the page is cross-origin isolated (SharedArrayBuffer enabled) — GitHub Pages can't send
 * these headers itself, so the SW injects them on every response.
 */
import { CACHES, staleBuildEntries, strategyFor } from "./cache-policy.js";

const worker = self;
const scope = new URL(worker.registration.scope);

worker.addEventListener("install", (event) => {
  event.waitUntil(worker.skipWaiting());
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const known = new Set(Object.values(CACHES));
      for (const name of await caches.keys()) {
        if (name.startsWith("ruian-") && !known.has(name)) {
          await caches.delete(name);
        }
      }
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener("fetch", (event) => {
  const request = event.request;
  const strategy = strategyFor(new URL(request.url), scope, request.method);
  if (strategy !== "pass") {
    event.respondWith(respond(request, strategy));
  }
});

worker.addEventListener("message", (event) => {
  const data = event.data;
  if (data?.type !== "build" || !Array.isArray(data.keep)) return;
  const keep = data.keep.filter((path) => typeof path === "string");
  void (async () => {
    const cache = await caches.open(CACHES.build);
    const cached = (await cache.keys()).map((r) => r.url);
    for (const href of staleBuildEntries(cached, keep, scope)) {
      await cache.delete(href);
    }
  })();
});

/** Wrap a response with COOP/COEP (navigation) or CORP (subresource) headers. */
function isolate(response, isNavigation) {
  const headers = new Headers(response.headers);
  if (isNavigation) {
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  }
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
}

async function respond(request, strategy) {
  const isNavigation = request.mode === "navigate";
  if (strategy === "page") {
    const cache = await caches.open(CACHES.page);
    try {
      const response = await fetch(request, { cache: "no-cache" });
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return isolate(response, isNavigation);
    } catch (error) {
      const cached = await cache.match(request);
      if (cached !== undefined) {
        return isolate(cached, isNavigation);
      }
      throw error;
    }
  }
  const cache = await caches.open(strategy === "build" ? CACHES.build : CACHES.immutable);
  const cached = await cache.match(request);
  if (cached !== undefined) {
    return isolate(cached, isNavigation);
  }
  const response = await fetch(request);
  if (response.ok) {
    void cache.put(request, response.clone());
  }
  return isolate(response, isNavigation);
}