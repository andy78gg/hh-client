/**
 * The page's service worker: caches the build for offline starts, and injects COOP/COEP headers
 * on the navigation response so the page is cross-origin isolated (SharedArrayBuffer enabled).
 * GitHub Pages can't send these headers, so the SW adds them on the main document response.
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

/** Add COOP/COEP headers to the navigation (HTML) response. Read the full body to avoid stream issues. */
async function isolateNavigation(response) {
  const body = await response.arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(body, {
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
      if (isNavigation) {
        return isolateNavigation(response);
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached !== undefined) {
        if (isNavigation) {
          return isolateNavigation(cached);
        }
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