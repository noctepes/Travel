// Lưu app trên máy để mở được khi mất sóng.
// Trang chính: lấy bản mới từ mạng trước (đợi tối đa vài giây), không có mạng thì dùng bản đã lưu.
// Thư viện Firebase trên cdnjs: có số phiên bản cố định nên lưu một lần, dùng mãi.
var SHELL = 'cb-trip-shell-v1';
var LIB = 'cb-trip-lib-v1';
var SHELL_FILES = ['./', 'index.html', 'manifest.json', 'apple-touch-icon.png', 'icon-512.png'];
var NET_TIMEOUT = 4000;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL)
      .then(function (c) { return c.addAll(SHELL_FILES.map(function (u) { return new Request(u, { cache: 'reload' }); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('cb-trip-') === 0 && k !== SHELL && k !== LIB;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fromCache(req) {
  return caches.open(SHELL).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit || req.mode !== 'navigate') return hit;
      return c.match('index.html').then(function (h) { return h || c.match('./'); });
    });
  });
}

function networkFirst(req) {
  var fresh = fetch(req, { cache: 'no-cache' }).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(SHELL).then(function (c) { c.put(req, copy); });
    }
    return res;
  });
  var timeout = new Promise(function (resolve) {
    setTimeout(function () { resolve(null); }, NET_TIMEOUT);
  });
  // sóng yếu: quá thời gian chờ thì mở bản đã lưu, bản mới vẫn được lưu lại khi tải xong
  return Promise.race([fresh.catch(function () { return null; }), timeout]).then(function (res) {
    if (res) return res;
    return fromCache(req).then(function (hit) { return hit || fresh; });
  });
}

function cacheFirst(req) {
  return caches.open(LIB).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }
  if (url.hostname === 'cdnjs.cloudflare.com') { e.respondWith(cacheFirst(req)); return; }
  // thời tiết, Firestore, đăng nhập: luôn đi thẳng ra mạng, app tự xử lý khi mất sóng
});
