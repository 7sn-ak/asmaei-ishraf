// عامل الخدمة: يجعل الموقع يفتح بسرعة ويعمل كتطبيق على الجوال، ويعرض الإشعارات والموقع مغلق.
// يجلب أحدث نسخة من الملفات عند توفر الإنترنت، ويستخدم النسخة المحفوظة عند انقطاعه.
// قاعدة البيانات لا تمر من هنا إطلاقاً.
const CACHE = 'ishraf-__BUILD__';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/vendor/supabase-2.117.2.js', 'js/api.js', 'js/core.js', 'js/views.js', 'js/laiha.js', 'js/push.js', 'js/sheets.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/badge-96.png', 'icons/logo.png'];

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

// ===== الإشعارات (Web Push) =====
// تصل من وظيفة الخادم push مشفّرة، والمتصفح يفك تشفيرها. نصها عام بلا أسماء الطلاب.
self.addEventListener('push', e => {
  let d = {};
  try { d = (e.data && e.data.json()) || {}; } catch (_) { d = {}; }
  const title = String(d.title || 'سجل الإشراف').slice(0, 120);
  const opts = {
    body: String(d.body || '').slice(0, 400),
    tag: String(d.tag || 'ishraf').slice(0, 80),
    renotify: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    lang: 'ar',
    dir: 'rtl',
    data: {open: String(d.open || '')},
    timestamp: Number(d.t) || Date.now()
  };
  // يُعرض الإشعار دائماً (الآيفون يوقف الاشتراك إذا لم يُعرض)، لكن بلا صوت إذا كان الموقع أمامك الآن
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    if (list.some(c => c.visibilityState === 'visible' && c.focused)) opts.silent = true;
    return self.registration.showNotification(title, opts);
  }));
});

// الضغط على الإشعار: يفتح الموقع على ما يخصه (القيد، أو الغياب، أو شاشة الإشعارات)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const open = String((e.notification.data && e.notification.data.open) || '');
  const url = new URL('./', self.registration.scope);
  if (open) url.searchParams.set('open', open);
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    const win = list.find(c => c.url.startsWith(self.registration.scope));
    if (!win) return self.clients.openWindow(url.href);
    return win.focus().catch(() => win).then(w => (w || win).postMessage({type: 'open', open}));
  }));
});
