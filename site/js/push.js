'use strict';
// إشعارات الجهاز: تصل حتى والموقع مغلق أو الجوال مقفل (Web Push).
// يفعّلها كل شخص مرة واحدة على كل جهاز من شاشة الإشعارات (الجرس). يرسلها الخادم (وظيفة push في Supabase)
// بنفس قواعد الجرس، ويعرضها عامل الخدمة sw.js. نصها عام بلا أسماء الطلاب لأنه يظهر على شاشة القفل.
//
// حالة هذا الجهاز في PUSH.state:
//   checking: جارٍ التحقق · on: مفعّلة · off: يمكن تفعيلها · denied: محظورة في إعدادات المتصفح
//   ios: آيفون يلزمه تثبيت الموقع على الشاشة الرئيسية أولاً · unsupported: المتصفح لا يدعمها
const PUSH = {state:'checking', reg:null, key:'', busy:false};
const pushSupported = () => !!(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
const permission = () => (window.Notification && Notification.permission) || 'default';
const idleState = () => permission() === 'denied' ? 'denied' : 'off';
function keyBytes(s){
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/'), b = atob(t + '==='.slice((t.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
function sameKey(buf, key){
  if (!buf || !key) return true;
  const a = new Uint8Array(buf), b = keyBytes(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
const swReady = ms => Promise.race([navigator.serviceWorker.ready, wait(ms || 8000).then(() => null)]).catch(() => null);
const subOpts = () => ({userVisibleOnly:true, applicationServerKey:keyBytes(PUSH.key)});

// بعد الدخول: هل هذا الجهاز مشترك؟ ويُربط اشتراكه بمن سجّل الدخول الآن
async function pushInit(){
  if (!pushSupported()) { PUSH.state = isIOS() && !isStandalone() ? 'ios' : 'unsupported'; schedule(); return; }
  try {
    PUSH.reg = PUSH.reg || await swReady(10000);
    if (!PUSH.reg) { PUSH.state = 'unsupported'; schedule(); return; }
    PUSH.key = PUSH.key || (await API.pushKey()) || '';
    let sub = await PUSH.reg.pushManager.getSubscription();
    // اشتراك بمفتاح قديم لا يصله شيء: يُلغى ويُفعَّل من جديد
    if (sub && sub.options && !sameKey(sub.options.applicationServerKey, PUSH.key)) { await sub.unsubscribe().catch(() => {}); sub = null; }
    if (sub && permission() === 'granted') { await API.savePush(sub.toJSON()); PUSH.state = 'on'; }
    else PUSH.state = idleState();
  } catch(e) { console.error(e); PUSH.state = idleState(); }
  schedule();
}

// التفعيل: يُستدعى من لمسة المستخدم مباشرة، لأن سفاري في الآيفون لا يطلب الإذن إلا داخلها
function pushEnable(){
  if (PUSH.busy || !pushSupported()) return;
  PUSH.busy = true; schedule();
  const direct = PUSH.reg && PUSH.key ? PUSH.reg.pushManager.subscribe(subOpts()) : null;
  (direct || (async () => {
    PUSH.reg = PUSH.reg || await swReady(10000);
    PUSH.key = PUSH.key || (await API.pushKey()) || '';
    if (!PUSH.reg || !PUSH.key) throw new Error('push_not_ready');
    return PUSH.reg.pushManager.subscribe(subOpts());
  })())
    .catch(async e => {
      // اشتراك سابق بمفتاح آخر: يُلغى ثم يُعاد
      const old = e && e.name === 'InvalidStateError' && PUSH.reg && await PUSH.reg.pushManager.getSubscription();
      if (!old) throw e;
      await old.unsubscribe();
      return PUSH.reg.pushManager.subscribe(subOpts());
    })
    .then(async sub => {
      await API.savePush(sub.toJSON());
      PUSH.state = 'on';
      if (!prefs().notify) setPrefs({notify:true});
      let n = 0;
      try { n = await API.testPush(); } catch(e) {}
      toast('تم تفعيل الإشعارات على هذا الجهاز', {sub: n ? 'أرسلنا إشعاراً تجريبياً، ويظهر خلال ثوانٍ.' : ''});
    })
    .catch(e => {
      console.error(e);
      PUSH.state = idleState();
      if (permission() === 'denied') toast('الإشعارات محظورة لهذا الموقع في المتصفح', {bad:true, sub:'اسمح بها من إعدادات الموقع في المتصفح، ثم أعد المحاولة.'});
      else if (permission() === 'default') toast('لم تُفعَّل الإشعارات', {sub:'اضغط «سماح» عندما يسألك الجهاز.'});
      else toast(e && e.message === 'push_not_ready' ? 'تعذر تجهيز الإشعارات. حدّث الصفحة ثم أعد المحاولة.' : errText(e), {bad:true});
    })
    .finally(() => { PUSH.busy = false; schedule(); });
}

// الإيقاف على هذا الجهاز فقط (وعند تسجيل الخروج، حتى لا تصل إشعاراتك لمن يستخدم الجهاز بعدك)
async function pushDisable(silent){
  try {
    const reg = PUSH.reg || (pushSupported() ? await swReady(3000) : null);
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) {
      await Promise.race([API.dropPush(sub.endpoint).catch(() => {}), wait(4000)]);
      await sub.unsubscribe().catch(() => {});
    }
  } catch(e) {}
  if (pushSupported()) PUSH.state = idleState();
  if (!silent) { pushHintLater(); toast('أُوقفت الإشعارات على هذا الجهاز'); schedule(); }
}

async function pushTest(){
  const n = await save(() => API.testPush());
  if (n === false) return;
  if (!n) return toast('لا يوجد جهاز مفعّل', {sub:'فعّل الإشعارات على هذا الجهاز أولاً.'});
  toast('أُرسل إشعار تجريبي', {sub: n === 1 ? 'يظهر على جهازك خلال ثوانٍ.' : `يظهر على أجهزتك المفعّلة (${n}) خلال ثوانٍ.`});
}

// تذكير الرئيسية بتفعيل الإشعارات على الجهاز: «لاحقاً» يخفيه أسبوعين
const HINT_PAUSE = 14 * 864e5;
const pushHintPaused = () => { try { return Date.now() - (Number(localStorage.getItem('ishraf.pushHint')) || 0) < HINT_PAUSE; } catch(e) { return false; } };
const pushHintLater = () => { try { localStorage.setItem('ishraf.pushHint', String(Date.now())); } catch(e) {} };

// عند فتح شاشة الإشعارات تُزال إشعارات الجهاز، فقد رآها
function pushClearShown(){
  try { if (PUSH.reg && PUSH.reg.getNotifications) PUSH.reg.getNotifications().then(ns => ns.forEach(n => n.close())).catch(() => {}); } catch(e) {}
}

/* ===== فتح ما يخص الإشعار ===== */
// عند الضغط على الإشعار: يُفتح الموقع برابط فيه ?open=…، أو تصل رسالة من عامل الخدمة إذا كان الموقع مفتوحاً
const OPEN_RE = /^(a:[0-9a-f-]{36}|abs:\d{4}-\d{2}-\d{2}|viol:\d{4}-\d{2}-\d{2}|inbox)$/i;
S.openNext = (() => {
  try {
    const u = new URL(location.href), t = u.searchParams.get('open');
    if (t === null) return '';
    u.searchParams.delete('open');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    return OPEN_RE.test(t) ? t : '';
  } catch(e) { return ''; }
})();
function openTarget(t){
  if (!t || !OPEN_RE.test(t)) return;
  if (S.gate !== 'in') { S.openNext = t; return; }
  if (t === 'inbox') return go('inbox');
  if (t.startsWith('abs:')) return openAbsenceView(t.slice(4));
  if (t.startsWith('viol:')) return openViolView(t.slice(5));
  const id = t.slice(2);
  if (S.actions[id]) return openAction(id);
  refreshAction(id).then(() => { if (S.actions[id] && S.gate === 'in') openAction(id); });
}
function takeOpen(){ const t = S.openNext; S.openNext = ''; if (t) openTarget(t); }
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
  const d = e.data;
  if (d && d.type === 'open' && typeof d.open === 'string') openTarget(d.open);
});
