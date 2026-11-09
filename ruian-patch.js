(function () {
  // --- One-time cleanup: unregister old SW and clear caches ---
  if (!sessionStorage.getItem('ruian-cleaned')) {
    sessionStorage.setItem('ruian-cleaned', '1');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        var unregs = regs.map(function (r) { return r.unregister(); });
        return Promise.all(unregs);
      }).then(function () {
        if (window.caches) {
          return caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          });
        }
      }).then(function () {
        location.reload();
      });
    }
  }

  // --- After SW updates and takes control, reload once so COOP/COEP headers apply ---
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!crossOriginIsolated && !sessionStorage.getItem('ruian-sw-reloaded')) {
        sessionStorage.setItem('ruian-sw-reloaded', '1');
        location.reload();
      }
    });
    // If SW is already controlling but we're not isolated (old SW), trigger update + reload
    if (navigator.serviceWorker.controller && !crossOriginIsolated &&
        !sessionStorage.getItem('ruian-sw-reloaded')) {
      sessionStorage.setItem('ruian-sw-reloaded', '1');
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(function () { location.reload(); }, 500);
    }
  }

  function patchWasm(bytes) {
    var off = 35150214;
    if (bytes.length > off + 6 &&
        bytes[off] === 0x49 && bytes[off+1] === 0x4e &&
        bytes[off+2] === 0x43 && bytes[off+3] === 0x41 &&
        bytes[off+4] === 0x52 && bytes[off+5] === 0x49) {
      bytes[off] = 0x52; bytes[off+1] = 0x55; bytes[off+2] = 0x49;
      bytes[off+3] = 0x41; bytes[off+4] = 0x4e; bytes[off+5] = 0x20;
    }
    return bytes;
  }
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    return origFetch.apply(this, arguments).then(function (resp) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.indexOf('.wasm') === -1 || resp.status !== 200) return resp;
      return resp.arrayBuffer().then(function (buf) {
        var bytes = patchWasm(new Uint8Array(buf));
        var headers = new Headers(resp.headers);
        headers.set('Content-Length', bytes.length);
        return new Response(bytes, { status: resp.status, statusText: resp.statusText, headers: headers });
      });
    });
  };
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._ruianUrl = url;
    return origOpen.apply(this, arguments);
  };
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    if (typeof xhr._ruianUrl === 'string' && xhr._ruianUrl.indexOf('.wasm') !== -1) {
      xhr.addEventListener('load', function () {
        try {
          if (xhr.status === 200 && xhr.response instanceof ArrayBuffer) {
            var patched = patchWasm(new Uint8Array(xhr.response));
            Object.defineProperty(xhr, 'response', { value: patched.buffer, configurable: true });
          }
        } catch (e) {}
      });
    }
    return origSend.apply(this, arguments);
  };
})();