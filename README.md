# hh client

A browser build of [Incari Client](https://incariclient.org) — an open source Eaglercraft client that runs
Minecraft: Java Edition in a browser tab — mirrored here so it can be played from GitHub Pages:

**https://andy78gg.github.io/hh-client/**

## What is in here

| Path | What it is |
| --- | --- |
| `index.html`, `boot.js`, `loader.js`, `features.js`, `jspi.js`, `wakeups.js` | the loader page and the modules it imports |
| `sw.js`, `cache-policy.js` | the service worker that caches the build after the first load |
| `build.json` | the build manifest (sizes + SHA-256 of every file below) |
| `incari-fast.wasm` | the Fast runtime, game 26.3 |
| `incari.wasm-runtime.js`, `mesher.wasm`, `mesher.wasm-runtime.js` | the WebAssembly hosts and the chunk mesher |
| `client.jar` | the client resource pack the game mounts at start-up (21,491 resources) |
| `incari.pack` | textures and shaders |
| `.nojekyll` | tells Pages to serve the files raw instead of running them through Jekyll |

## Notes

- **Fast only.** The Compatible build (for older browsers) and the experimental Rust/WebGPU build are not
  included; the version picker lists them as unavailable and says why. Use a recent Chrome, Edge or Firefox.
- **No sound.** The sound objects live in Minecraft's asset index and are not mirrored here, so the client
  skips audio. Everything else — singleplayer, servers, skins, modules, world saves — works.
- **First load is slow.** The page downloads ~49 MB and compiles a 36 MB WebAssembly module; after that the
  service worker serves it from cache and start-up is quick.
- **Worlds are stored in your browser** for this origin (`andy78gg.github.io`), under OPFS/IndexedDB, so
  clearing site data deletes them.
- This is not an official Minecraft product and is not approved by or associated with Mojang or Microsoft.
  The upstream project says plainly that you need to own Minecraft to play it. `client.jar` and the game
  assets are Mojang's; the Incari client itself is GPL-3.0, from
  [incari-client/incari-client](https://github.com/incari-client/incari-client).
