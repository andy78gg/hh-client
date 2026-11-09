/**
 * The page's service worker: keeps the build and the sounds the game has played, so a returning
 * player downloads nothing that hasn't changed and can start offline.
 * Also injects COOP/COEP headers on HTML navigation responses to enable crossOriginIsolated
 * and SharedArrayBuffer (multi-threaded wasm).
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

function withIsolationHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  });
}

async function respond(request, strategy) {
  if (strategy === "page") {
    const cache = await caches.open(CACHES.page);
    try {
      const response = await fetch(request, { cache: "no-cache" });
      if (response.ok) {
        const isolated = withIsolationHeaders(response);
        await cache.put(request, isolated.clone());
        return isolated;
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached !== undefined) {
        return cached;
      }
      throw error;
    }
  }
  const cache = await caches.open(strategy === "build" ? CACHES.build : CACHES.immutable);
  const cached = await cache.match(request);
  if (cached !== undefined) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    void cache.put(request, response.clone());
  }
  return response;
}