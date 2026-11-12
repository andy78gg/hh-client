#!/usr/bin/env python3
"""Rename the Incari branding to Ruian in this copy of the client.

Two very different jobs live in here:

* The page and its modules are plain text, so every `incari` becomes `ruian`.
  The one exception is the handshake with the game: the WebAssembly module calls
  `window.incariLoader`, reads `window.incariFiles` / `window.incariBuild` and
  `window.__incariFrames`, so those names stay.
* Both wasm modules (Fast and Compatible) are compiled TeaVM output. Its strings live in a table of
  `[length byte][characters]` records laid out at fixed offsets in the data
  section, so a shorter word cannot be written: every record after it would move
  and the code that points at them would read the wrong bytes. The patch therefore
  rewrites each display string to the same number of characters, moving the pad
  past the punctuation ("Incari." -> "Ruian. ") so the text still reads correctly.

Java identifiers ("IncariPlayer", "IncariLocalPosition", ...) and the GPL notice
("Incari Client" next to "The Incari Client contributors" / "GPL-3.0-or-later")
are left alone: they are code and a licence, not branding.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WASM = ROOT / "incari-fast.wasm"
MANIFEST = ROOT / "build.json"

TEXT_FILES = [
    "index.html",
    "boot.js",
    "loader.js",
    "features.js",
    "jspi.js",
    "wakeups.js",
    "sw.js",
    "cache-policy.js",
    "README.md",
    "build.json",
]

RENAMES = {
    "incari-fast.wasm": "ruian-fast.wasm",
    "incari.wasm": "ruian.wasm",
    "incari.wasm-runtime.js": "ruian.wasm-runtime.js",
    "incari.pack": "ruian.pack",
}

# Names the WebAssembly module looks up on the page. Renaming them on one side only
# would cut the loading screen's progress updates, so they keep their old spelling.
KEEP = {
    "ruianLoader": "incariLoader",
    "ruianFiles": "incariFiles",
    "ruianBuild": "incariBuild",
    "ruianTimer": "incariTimer",
    "__ruianFrames": "__incariFrames",
}


def rebrand_text(text: str) -> str:
    out = text.replace("Incari Client", "Ruian Client").replace("INCARI", "RUIAN").replace("Incari", "Ruian")
    out = out.replace("incari", "ruian")
    for wrong, right in KEEP.items():
        out = out.replace(wrong, right)
    return out


def patch_wasm() -> None:
    data = bytearray(WASM.read_bytes())
    patched = skipped_code = skipped_licence = 0
    pos = 0
    ident = re.compile(rb"[A-Za-z0-9_$]")

    while True:
        pos = data.find(b"Incari", pos)
        if pos < 0:
            break

        before = data[pos - 1:pos]
        after = data[pos + 6:pos + 7]

        # Part of a Java identifier, e.g. "IncariPlayer", or of a dotted package path.
        if after and ident.match(after) or before and ident.match(before):
            skipped_code += 1
            pos += 6
            continue

        # The GPL notice names the copyright holders; that is a licence, not branding.
        window = bytes(data[max(0, pos - 200):pos + 200])
        if b"GPL-3.0" in window or b"contributors" in window or b"LICENSE" in window:
            skipped_licence += 1
            pos += 6
            continue

        if data[pos + 6:pos + 8] == b"'s":  # Incari's -> Ruian's (8 chars either way)
            data[pos:pos + 8] = b"Ruian's "
            pos += 8
        elif after and after in b".:,]":  # keep the punctuation tight: "Incari." -> "Ruian. "
            data[pos:pos + 7] = b"Ruian" + after + b" "
            pos += 7
        else:  # "Incari Client" -> "Ruian  Client": the pad sits where the old sixth letter was
            data[pos:pos + 6] = b"Ruian "
            pos += 6
        patched += 1

    # Standalone uppercase INCARI (not an INCARI_IDENT token) -> RUIAN space.
    pos = 0
    upper = 0
    while True:
        pos = data.find(b"INCARI", pos)
        if pos < 0:
            break
        before = data[pos - 1:pos]
        after = data[pos + 6:pos + 7]
        if (after and ident.match(after)) or (before and ident.match(before)):
            pos += 6
            continue
        window = bytes(data[max(0, pos - 200):pos + 200])
        if b"GPL-3.0" in window or b"contributors" in window or b"LICENSE" in window:
            pos += 6
            continue
        data[pos:pos + 6] = b"RUIAN "
        upper += 1
        pos += 6

    WASM.write_bytes(bytes(data))
    print(f"wasm: {patched} display strings renamed, {upper} uppercase tokens, "
          f"{skipped_code} identifiers left, {skipped_licence} licence notices left")


def rewrite_manifest() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    files = []
    for entry in manifest["files"]:
        path = ROOT / entry["path"]
        blob = path.read_bytes()
        files.append({
            "path": entry["path"],
            "size": len(blob),
            "sha256": hashlib.sha256(blob).hexdigest(),
        })
    manifest["files"] = files
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"manifest: {len(files)} entries re-hashed")


def main() -> int:
    for name in TEXT_FILES:
        path = ROOT / name
        original = path.read_text(encoding="utf-8")
        updated = rebrand_text(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8", newline="\n")
            print(f"text: {name}")

    patch_wasm()

    for old, new in RENAMES.items():
        source = ROOT / old
        if source.exists():
            source.rename(ROOT / new)
            print(f"file: {old} -> {new}")

    rewrite_manifest()
    return 0


if __name__ == "__main__":
    sys.exit(main())
