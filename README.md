# hh client — Ruian Client

A browser build of **Ruian Client**, playable from GitHub Pages:

**https://andy78gg.github.io/hh-client/**

It is Minecraft: Java Edition (game 26.3) running in a browser tab: singleplayer worlds, servers,
skins, the client's modules and the emote wheel all work, and worlds are saved in the browser.

## This is a renamed fork

Ruian Client is [Incari Client](https://incariclient.org) with the name changed — the upstream client is
GPL-3.0, so a modified copy like this has to keep its notices, and it does: the licence screen inside the
game still credits *The Incari Client contributors*, and `tools/rebrand.py` records exactly what was
changed. Nothing else about the client was altered.

* `index.html` and the loader modules (`boot.js`, `loader.js`, `sw.js`, …) say Ruian, including the
  window title, the loading screen and the console prefix.
* `ruian-fast.wasm` holds the game's own text in a table of `[length][characters]` records at fixed
  offsets, so the rename inside it is **length-preserving**: "Incari" becomes "Ruian " and the pad is
  moved past the punctuation ("Incari." → "Ruian. "). Java identifiers (`IncariPlayer`,
  `IncariLocalPosition`, …) and the GPL notice are untouched.
* Two names had to stay: the canvas element is still `id="incari-canvas"` and the page still exposes
  `window.incariLoader` / `incariFiles` / `incariBuild` / `__incariFrames`, because the compiled game
  looks them up by those exact strings. They are internal plumbing, not branding.
* The upstream logo and favicon were removed; the loading screen shows the backdrop photo and the word
  RUIAN.

## What is in the repository

| Path | What it is |
| --- | --- |
| `index.html`, `boot.js`, `loader.js`, `features.js`, `jspi.js`, `wakeups.js` | the loader page and the modules it imports |
| `sw.js`, `cache-policy.js` | the service worker that caches the build after the first load |
| `build.json` | the build manifest (sizes + SHA-256 of every file below) |
| `ruian-fast.wasm` | the Fast runtime, game 26.3 |
| `ruian.wasm-runtime.js`, `mesher.wasm`, `mesher.wasm-runtime.js` | the WebAssembly hosts and the chunk mesher |
| `client.jar` | the client resource pack mounted at start-up (21,491 resources) |
| `ruian.pack` | textures and shaders (its files keep their original `/incari/…` namespace) |
| `.nojekyll` | tells Pages to serve the files raw instead of running them through Jekyll |
| `tools/rebrand.py` | the script that did the rename, kept so the change can be reviewed or repeated |

## Notes

- **Fast only.** The Compatible build (older browsers) and the experimental Rust/WebGPU build are not
  included; the version picker lists them as unavailable and says why. Use a recent Chrome, Edge or
  Firefox.
- **No sound.** The sound objects live in Minecraft's asset index and are not mirrored here, so the
  client skips audio.
- **First load is slow.** The page downloads ~49 MB and compiles a 36 MB WebAssembly module; after that
  the service worker serves it from cache.
- **Worlds live in your browser** for this origin (`andy78gg.github.io`), in OPFS/IndexedDB, so clearing
  site data deletes them.
- Not an official Minecraft product and not approved by or associated with Mojang or Microsoft. The
  upstream project says plainly that you need to own Minecraft to play it. `client.jar` and the game
  assets are Mojang's; the client code is GPL-3.0, from
  [incari-client/incari-client](https://github.com/incari-client/incari-client).
