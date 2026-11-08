(function () {
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