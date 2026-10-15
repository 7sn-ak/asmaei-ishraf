// عامل الخدمة: يجعل الموقع يفتح بسرعة ويعمل كتطبيق على الجوال.
// يجلب أحدث نسخة من الملفات عند توفر الإنترنت، ويستخدم النسخة المحفوظة عند انقطاعه.
// قاعدة البيانات لا تمر من هنا إطلاقاً.
const CACHE = 'ishraf-__BUILD__';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/vendor/supabase-2.117.2.js', 'js/api.js', 'js/core.js', 'js/views.js', 'js/sheets.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/logo.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : null)).then(r => r || Response.error()))
  );
});
