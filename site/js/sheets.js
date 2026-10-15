'use strict';
// شاشات الدخول، والنوافذ السفلية (تسجيل إجراء، تفاصيل القيد، الطلاب، الاستيراد، حسابات الطاقم)، والأحداث، والتشغيل.
/* ===== شاشات الدخول ===== */
const gateShell = inner => `<div class="gate"><svg class="seal" aria-hidden="true"><use href="#i-seal"/></svg>${inner}</div>`;
const roleButtons = (act, cur) => `<div class="roles" role="group" aria-label="الدور">${ROLE_KEYS.map(k => `<button type="button" data-act="${act}" data-r="${k}" aria-pressed="${cur === k}">${ROLES[k]}</button>`).join('')}</div>`;
const pwField = (id, label, auto) => `<div class="field"><label for="${id}">${label}</label><div class="pw"><input id="${id}" type="password" autocomplete="${auto}" dir="ltr"><button type="button" data-act="pw-toggle" data-for="${id}">إظهار</button></div></div>`;
const GATES = {
  loading(el){ el.innerHTML = '<div class="loading">جارٍ فتح السجل…</div>'; },
  config(el){ el.innerHTML = gateShell(`<h1>الموقع غير مربوط بعد</h1><p>لم تُضبط إعدادات قاعدة البيانات في الملف js/config.js. بعد ربطها تظهر هنا شاشة الدخول.</p>`); },
  fatal(el){ el.innerHTML = gateShell(`<h1>تعذر فتح السجل</h1><p>${esc(S.fatal)}</p><div class="btns"><button class="btn primary" data-act="reload">إعادة المحاولة</button><button class="btn ghost" data-act="signout">تسجيل الخروج</button></div>`); },
  inactive(el){ el.innerHTML = gateShell(`<h1>الحساب غير مفعّل</h1><p>حسابك موقوف أو غير مضاف إلى الطاقم. راجع مسؤول الموقع.</p><div class="btns"><button class="btn ghost" data-act="signout">تسجيل الخروج</button></div>`); },
  login(el){
    el.innerHTML = gateShell(`<h1>سجل الإشراف</h1><p>${esc(APP_CONFIG.SCHOOL)}. سجّل دخولك باسم المستخدم وكلمة السر اللي أعطاك إياها مسؤول الموقع.</p>
      ${S.fatal ? `<div class="banner bad">${icon('alert')}<div>${esc(S.fatal)}</div></div>` : ''}
      <form class="form" id="login-form" novalidate>
        <div class="field"><label for="li-user">اسم المستخدم</label><input id="li-user" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" dir="ltr"></div>
        ${pwField('li-pass', 'كلمة السر', 'current-password')}
        <p class="err" id="li-err" hidden></p>
        <button class="btn primary block" id="li-go" type="submit">دخول</button>
        <p class="meta">نسيت كلمة السر؟ اطلب من مسؤول الموقع تعيين كلمة جديدة لك.</p>
      </form>`);
  },
  setup(el){
    el.innerHTML = gateShell(`<h1>إعداد السجل لأول مرة</h1><p>أنشئ حساب مسؤول الموقع. بهذا الحساب تضيف حسابات الطاقم بعد ذلك.</p>
      <form class="form" id="setup-form" novalidate>
        <div class="field"><label for="su-name">اسمك كما يراه الزملاء</label><input id="su-name" autocomplete="name" placeholder="مثال: أ. خالد العنزي"></div>
        <div class="field"><label for="su-user">اسم المستخدم (بالإنجليزي)</label><input id="su-user" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" dir="ltr" placeholder="khaled"></div>
        ${pwField('su-pass', 'كلمة السر (6 أحرف على الأقل)', 'new-password')}
        <div class="field"><span class="lbl">دورك في المدرسة</span>${roleButtons('su-role', S.setupRole || '')}</div>
        <p class="err" id="su-err" hidden></p>
        <button class="btn primary block" id="su-go" type="submit">إنشاء الحساب والدخول</button>
      </form>`);
  }
};
async function doLogin(){
  const err = $('#li-err'), btn = $('#li-go'), fail = m => { err.textContent = m; err.hidden = false; };
  const u = $('#li-user').value.trim().toLowerCase(), p = $('#li-pass').value;
  err.hidden = true;
  if (!u || !p) return fail('اكتب اسم المستخدم وكلمة السر.');
  btn.disabled = true; btn.textContent = 'جارٍ الدخول…';
  try { await API.signIn(u, p); const s = await API.session(); S.fatal = ''; await enter(s.user.id); }
  catch(e) { fail(errText(e)); }
  finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = 'دخول'; } }
}
async function doSetup(){
  const err = $('#su-err'), btn = $('#su-go'), fail = m => { err.textContent = m; err.hidden = false; };
  const name = $('#su-name').value.trim().replace(/\s+/g, ' '), username = $('#su-user').value.trim().toLowerCase(), password = $('#su-pass').value, role = S.setupRole;
  err.hidden = true;
  if (name.length < 2) return fail('اكتب اسمك.');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail(ERR.bad_username);
  if (password.length < 6) return fail(ERR.weak_password);
  if (!role) return fail('اختر دورك في المدرسة.');
  btn.disabled = true; btn.textContent = 'جارٍ الإنشاء…';
  try { await API.setup({name, username, password, role}); await API.signIn(username, password); const s = await API.session(); await enter(s.user.id); }
  catch(e) { fail(errText(e)); }
  finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = 'إنشاء الحساب والدخول'; } }
}


/* ===== النوافذ السفلية ===== */
function openSheet(kind, title, body, foot, data){
  const sh = $('#sheet');
  sh.innerHTML = `<div class="sheet-h"><h2 id="sheetTitle">${esc(title)}</h2><button class="iconbtn" data-act="close-sheet" aria-label="إغلاق">${icon('x')}</button></div>
    <div class="sheet-b" id="sheetBody">${body}</div>${foot ? `<div class="sheet-f" id="sheetFoot">${foot}</div>` : ''}`;
  sh.hidden = false; $('#scrim').hidden = false;
  document.body.style.overflow = 'hidden';
  S.sheet = Object.assign({kind}, data || {});
}
function closeSheet(){
  const sh = $('#sheet');
  if (sh.hidden) return;
  sh.hidden = true; sh.innerHTML = ''; $('#scrim').hidden = true;
  document.body.style.overflow = '';
  S.sheet = null;
}
function refreshSheet(){
  if (!S.sheet || S.sheet.kind !== 'action') return;
  const body = $('#sheetBody'), ae = document.activeElement;
  if (body && ae && body.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  renderActionBody();
}

/* --- record --- */
let R = null;
function openRecord(o){
  o = o || {};
  if (S.readOnly) return toast('صلاحيتك على هذه الصفحة للعرض فقط.', {bad:true});
  R = {studentId:o.studentId || '', q:'', isNew:false, type:o.type || 'pledge'};
  const body = `<div class="form">
    <div class="field"><span class="lbl">الطالب</span><div id="r-stu"></div></div>
    <div class="field"><span class="lbl" id="r-type-l">نوع الإجراء</span>
      <div class="tpick" role="group" aria-labelledby="r-type-l">${TYPE_KEYS.map(k => `<button type="button" class="ty-${k}" data-act="r-type" data-t="${k}" aria-pressed="${R.type===k}">${tico(k,true)}${TYPES[k].long}</button>`).join('')}</div></div>
    <div class="field"><label for="r-vio">المخالفة</label>
      <select id="r-vio"><option value="">اختر المخالفة</option>${VIOLATIONS.map(v => `<option>${esc(v)}</option>`).join('')}<option value="__other">أخرى…</option></select>
      <input id="r-other" placeholder="اكتب المخالفة" hidden></div>
    <div class="field"><label for="r-date">تاريخ الواقعة</label><input id="r-date" type="date" value="${today()}" max="${today()}"></div>
    <div id="r-extra" class="form"></div>
    <div class="field"><label for="r-det">التفاصيل <span class="opt">(اختياري)</span></label><textarea id="r-det" rows="3" placeholder="ماذا حدث، وأين، ومن شهد الواقعة"></textarea></div>
    <div id="r-hint"></div>
    <p class="err" id="r-err" hidden></p></div>`;
  openSheet('record', 'تسجيل إجراء', body, `<button class="btn primary block" id="r-save" data-act="r-save"></button>`);
  renderRStu(); renderRExtra();
}
function renderRStu(){
  const box = $('#r-stu'); if (!box) return;
  if (R.studentId) {
    const s = S.students[R.studentId] || {};
    box.innerHTML = `<div class="picked"><span class="avatar">${esc(initial(s.name))}</span><div class="main"><div class="t1">${esc(s.name||'')}</div><div class="t2">${esc(s.cls||'')}</div></div>
      <button class="btn sm ghost" data-act="r-clear">تغيير</button></div>`;
  } else {
    box.innerHTML = `<label class="search">${icon('search')}<input id="r-q" type="search" placeholder="اكتب اسم الطالب" autocomplete="off" data-in="r-q" value="${esc(R.q)}"></label>
      <div class="results list" id="r-res" hidden></div>
      <div id="r-new" class="two" hidden><input id="r-newname" placeholder="اسم الطالب" aria-label="اسم الطالب الجديد"><input id="r-newcls" placeholder="الفصل، مثال: 10/3" aria-label="فصل الطالب الجديد" list="r-cls-list"></div>
      <datalist id="r-cls-list">${M().classes.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;
    renderRRes();
  }
  renderRHint();
}
function renderRRes(){
  const res = $('#r-res'); if (!res) return;
  const q = norm(R.q);
  if (!q || R.isNew) { res.hidden = true; res.innerHTML = ''; return; }
  const hits = M().students.filter(s => norm(s.name).includes(q)).slice(0, 6);
  res.hidden = false;
  res.innerHTML = hits.map(s => `<button class="row" data-act="r-pick" data-id="${esc(s.id)}"><span class="avatar">${esc(initial(s.name))}</span>
      <span class="main"><span class="t1">${esc(s.name)}</span><span class="t2">${esc(s.cls||'')}${activeSusp(s.id) ? '<span class="flag">مفصول</span>' : ''}</span></span></button>`).join('') +
    `<button class="row" data-act="r-new"><span class="avatar">${icon('userplus','sm')}</span><span class="main"><span class="t1">إضافة «${esc(R.q.trim())}» طالباً جديداً</span><span class="t2">إذا لم يكن في القائمة</span></span></button>`;
}
function renderRHint(){
  const box = $('#r-hint'); if (!box) return;
  const acts = R.studentId ? (M().byStu[R.studentId] || []) : [];
  if (!acts.length) { box.innerHTML = ''; return; }
  const by = {}; acts.forEach(a => { by[a.type] = (by[a.type]||0) + 1; });
  const sus = activeSusp(R.studentId);
  box.innerHTML = `<div class="banner">${icon('info')}<div>سجله السابق: ${TYPE_KEYS.filter(k => by[k]).map(k => `${TYPES[k].label} ${by[k]}`).join(' · ')}${sus ? ` — مفصول حالياً حتى ${esc(fmtDay(sus.suspendTo))}` : ''}</div></div>`;
}
function renderRExtra(){
  const t = R.type, ex = $('#r-extra'); if (!ex) return;
  $$('#sheet [data-act="r-type"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
  let h = '';
  if (t === 'summon') h = `<div class="two"><div class="field"><label for="r-sd">موعد الحضور</label><input id="r-sd" type="date" value="${nextSchoolDay()}" min="${today()}"></div>
    <div class="field"><label for="r-st">الساعة</label><input id="r-st" type="time" value="08:00"></div></div>`;
  if (t === 'suspend') h = `<div class="two"><div class="field"><label for="r-days">مدة الفصل</label><select id="r-days">${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}">${daysTxt(n)}</option>`).join('')}</select></div>
    <div class="field"><label for="r-from">يبدأ من</label><input id="r-from" type="date" value="${nextSchoolDay()}" min="${today()}"></div></div><p class="note" id="r-range"></p>`;
  if (t === 'report') {
    const hasHead = Object.values(S.staff).some(s => s.role === 'head'), def = hasHead ? 'head' : 'vp';
    h = `<div class="field"><label for="r-to">يُرفع إلى</label><select id="r-to">${['head','vp','principal','affairs'].map(k => `<option value="${k}"${k === def ? ' selected' : ''}>${ROLES[k]}</option>`).join('')}</select></div>`;
  }
  if (t === 'pledge') h = `<p class="note">بعد أن يوقّع الطالب على التعهد، افتح القيد واضغط «تم توقيع التعهد».</p>`;
  ex.innerHTML = h;
  if (t === 'suspend') updRange();
  setSaveLabel(); renderRHint();
}
function setSaveLabel(){
  const b = $('#r-save'); if (!b) return;
  b.disabled = false;
  b.textContent = {pledge:'حفظ التعهد', report:'رفع التقرير', summon:'حفظ الاستدعاء', suspend: isApprover() ? 'حفظ الفصل معتمداً' : 'إرسال طلب الفصل للاعتماد'}[R.type];
}
function updRange(){
  const n = +($('#r-days') || {}).value || 1, f = ($('#r-from') || {}).value || nextSchoolDay(), out = $('#r-range');
  if (!out) return;
  out.textContent = `من ${fmtDay(firstSchoolDay(f))} حتى ${fmtDay(schoolEnd(f, n))}، والعدّ بالأيام الدراسية دون الجمعة والسبت.` + (isApprover() ? ' يُعتمد مباشرة لأنك ' + ROLES[myRole()] + '.' : ' يحتاج اعتماد المدير أو الوكيل أو المشرف العام.');
}
async function saveRecord(){
  const err = $('#r-err');
  const fail = m => { err.textContent = m; err.hidden = false; err.scrollIntoView({block:'nearest'}); };
  err.hidden = true;
  const a = {type:R.type, studentId:R.studentId || null};
  let sname = '';
  if (!a.studentId) {
    sname = R.isNew ? $('#r-newname').value.trim().replace(/\s+/g, ' ') : '';
    if (!sname) return fail('اختر الطالب من القائمة، أو أضفه طالباً جديداً.');
    a.newStudentName = sname;
    a.newStudentCls = normCls($('#r-newcls').value);
    if (!a.newStudentCls) return fail('اكتب فصل الطالب الجديد، مثال: 10/3');
  } else sname = (S.students[a.studentId] || {}).name || '';
  let vio = $('#r-vio').value;
  if (vio === '__other') vio = $('#r-other').value.trim();
  if (!vio) return fail('حدّد المخالفة.');
  a.violation = vio;
  a.date = $('#r-date').value;
  if (!a.date) return fail('حدّد تاريخ الواقعة.');
  a.details = $('#r-det').value.trim();
  if (R.type === 'summon') { a.summonDate = $('#r-sd').value; a.summonTime = $('#r-st').value; if (!a.summonDate) return fail('حدّد موعد حضور ولي الأمر.'); }
  if (R.type === 'suspend') { const f = $('#r-from').value; if (!f) return fail('حدّد بداية الفصل.'); a.suspendDays = +$('#r-days').value || 1; a.suspendFrom = firstSchoolDay(f); a.suspendTo = schoolEnd(f, a.suspendDays); }
  if (R.type === 'report') a.to = $('#r-to').value;
  const btn = $('#r-save'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
  const id = await save(() => API.createAction(a));
  if (!id) return setSaveLabel();
  const type = R.type;
  closeSheet();
  await refreshAction(id);
  const saved = S.actions[id];
  if (saved && saved.studentId && !S.students[saved.studentId]) {
    const st = await API.getStudent(saved.studentId).catch(() => null);
    if (st) { S.students[st.id] = st; bump(); }
  }
  const msg = {pledge:'حُفظ التعهد', report:'رُفع التقرير', summon:'حُفظ الاستدعاء', suspend: saved && saved.status === 'approved' ? 'حُفظ الفصل معتمداً' : 'أُرسل طلب الفصل للاعتماد'}[type];
  toast(`${msg}: ${sname}`, {btn:'فتح', onBtn:() => openAction(id)});
}


/* --- action detail --- */
function openAction(id){
  const a = S.actions[id];
  if (!a) return toast('هذا القيد لم يعد موجوداً.');
  openSheet('action', TYPES[a.type] ? TYPES[a.type].long : 'قيد', '', '', {id});
  renderActionBody();
}
function logItem(a, e){
  let what;
  if (e.ev === 'created') what = (a.type === 'suspend' && e.to === 'approved') ? 'سجّل الفصل واعتمده' : 'سجّل القيد';
  else if (e.ev === 'resched') what = 'غيّر موعد الحضور إلى ' + (e.note || '');
  else what = MOVE_PAST[e.to] || 'غيّر الحالة';
  return `<li><div class="what"><b>${esc(personName(e.by))}</b> ${esc(what)}</div>
    <div class="meta">${esc(dayLabel(ymd(new Date(e.t))))} ${esc(fmtTime(e.t))}${e.note && e.ev !== 'resched' ? ' · ' + esc(e.note) : ''}</div></li>`;
}
function renderActionBody(){
  const body = $('#sheetBody'); if (!body || !S.sheet) return;
  const a = S.actions[S.sheet.id];
  if (!a) { body.innerHTML = `<div class="empty"><h3>حُذف هذا القيد</h3></div>`; return; }
  const keep = {}; $$('input,textarea,select', body).forEach(i => { if (i.id) keep[i.id] = i.value; });
  const openD = $('#ad-rs', body) && $('#ad-rs', body).open, sc = body.scrollTop;
  const stamp = a.type === 'suspend'
    ? (a.status === 'approved' ? '<span class="stamp">معتمد</span>' : a.status === 'rejected' ? '<span class="stamp bad">مرفوض</span>' : '<span class="stamp pend">بانتظار الاعتماد</span>')
    : pill(a);
  const mv = ((MOVES[a.type] || {})[a.status]) || [];
  let moves = '';
  if (mv.length && !S.readOnly) {
    moves = (a.type === 'suspend' && !isApprover()) ? `<p class="note">يعتمد الفصل المدير أو الوكيل أو المشرف العام.</p>` :
      `<div class="field"><label for="ad-note">ملاحظة مع التحديث <span class="opt">(اختياري)</span></label><input id="ad-note" placeholder="${a.type === 'summon' ? 'مثال: حضر الأب ووقّع' : 'اكتب ملاحظة قصيرة'}">
        <div class="btns">${mv.map(m => `<button class="btn ${m[2]}" data-act="move" data-id="${esc(a.id)}" data-to="${m[0]}">${esc(m[1])}</button>`).join('')}</div></div>`;
  }
  body.innerHTML = `
    <div class="ad-top">${tchip(a.type)}<span class="code">${esc(code(a.id))}</span><span class="grow"></span>${stamp}</div>
    <button class="ad-stu" data-act="open-student" data-id="${esc(a.studentId)}">${esc(stuName(a))}<span>${esc(stuCls(a))}</span></button>
    <dl class="kv">
      <div><dt>المخالفة</dt><dd>${esc(a.violation || '—')}</dd></div>
      <div><dt>تاريخ الواقعة</dt><dd>${esc(fmtDay(a.date))}</dd></div>
      ${a.type === 'summon' ? `<div><dt>موعد الحضور</dt><dd>${esc(fmtDay(a.summonDate))}${a.summonTime ? ' · ' + esc(fmtHM(a.summonTime)) : ''}</dd></div>` : ''}
      ${a.type === 'suspend' ? `<div><dt>المدة</dt><dd>${esc(schoolDaysTxt(a.suspendDays || 1))}</dd></div><div><dt>الفترة</dt><dd>${esc(fmtDay(a.suspendFrom))} — ${esc(fmtDay(a.suspendTo))}</dd></div>` : ''}
      ${a.type === 'report' && a.to ? `<div><dt>مرفوع إلى</dt><dd>${esc(ROLES[a.to] || '')}</dd></div>` : ''}
      <div><dt>سجّله</dt><dd>${esc(personName(a.createdBy))}${personTitle(a.createdBy) ? ' · ' + esc(personTitle(a.createdBy)) : ''}<br><span class="meta">${esc(dayLabel(ymd(new Date(a.createdAt))))} ${esc(fmtTime(a.createdAt))}</span></dd></div>
    </dl>
    ${a.details ? `<div class="field"><span class="lbl">التفاصيل</span><p class="details">${esc(a.details)}</p></div>` : ''}
    ${moves}
    ${a.type === 'summon' && !S.readOnly ? `<details class="more-box" id="ad-rs"><summary>تغيير موعد الحضور</summary><div class="form">
      <div class="two"><input id="ad-sd" type="date" value="${esc(a.summonDate || '')}" aria-label="تاريخ الموعد"><input id="ad-st" type="time" value="${esc(a.summonTime || '08:00')}" aria-label="ساعة الموعد"></div>
      <button class="btn primary" data-act="resched" data-id="${esc(a.id)}">حفظ الموعد الجديد</button></div></details>` : ''}
    <section class="field"><span class="lbl">سير القيد</span><ol class="tl small">${(a.log || []).slice().reverse().map(e => logItem(a, e)).join('')}</ol></section>
    ${canDelete(a) ? `<div class="btns"><button class="btn ghost" data-act="act-del" data-id="${esc(a.id)}" data-confirm="اضغط مرة أخرى لحذف القيد">${icon('trash','sm')}حذف القيد</button></div>` : ''}`;
  for (const k in keep) { const i = document.getElementById(k); if (i && i.value !== keep[k] && keep[k]) i.value = keep[k]; }
  if (openD && $('#ad-rs', body)) $('#ad-rs', body).open = true;
  body.scrollTop = sc;
}
async function moveStatus(id, to, note){
  const a = S.actions[id]; if (!a) return;
  if (a.type === 'suspend' && !isApprover()) return toast(ERR.not_approver, {bad:true});
  const ok = await save(() => API.moveAction(id, to, note), DONE[to] + ': ' + stuName(a));
  if (!ok) return;
  if ($('#ad-note')) $('#ad-note').value = '';
  refreshAction(id);
}
async function resched(id){
  const d = $('#ad-sd').value, tm = $('#ad-st').value;
  if (!d) return toast('حدّد تاريخ الموعد.', {bad:true});
  const ok = await save(() => API.reschedAction(id, d, tm, fmtDay(d) + (tm ? ' ' + fmtHM(tm) : '')), 'حُفظ الموعد الجديد');
  if (ok) refreshAction(id);
}
async function delAction(id){
  if (!await save(() => API.deleteAction(id), 'حُذف القيد')) return;
  delete S.actions[id]; bump(); closeSheet();
}


/* --- students --- */
function openStudent(id, presetName){
  const s = id ? S.students[id] : null;
  const body = `<div class="form">
    <div class="field"><label for="st-name">اسم الطالب</label><input id="st-name" value="${esc(s ? s.name : (presetName || ''))}" placeholder="الاسم الثلاثي أو الرباعي"></div>
    <div class="field"><label for="st-cls">الفصل</label><input id="st-cls" list="st-cls-list" value="${esc(s ? s.cls : '')}" placeholder="مثال: 10/3"><datalist id="st-cls-list">${M().classes.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <div class="field"><label for="st-phone">هاتف ولي الأمر <span class="opt">(اختياري)</span></label><input id="st-phone" type="tel" inputmode="tel" dir="ltr" value="${esc(s ? s.phone : '')}" placeholder="8 أرقام"></div>
    <div class="field"><label for="st-notes">ملاحظات <span class="opt">(اختياري)</span></label><textarea id="st-notes" rows="2">${esc(s ? s.notes : '')}</textarea></div>
    <p class="err" id="st-err" hidden></p>
    ${s ? `<div class="btns"><button class="btn ghost" data-act="stu-del" data-id="${esc(id)}" data-confirm="اضغط مرة أخرى لحذف الطالب">${icon('trash','sm')}حذف الطالب</button></div><p class="meta">حذف الطالب لا يحذف قيوده من السجل.</p>` : ''}</div>`;
  openSheet('student', s ? 'تعديل بيانات الطالب' : 'إضافة طالب', body, `<button class="btn primary block" data-act="stu-save" data-id="${esc(id || '')}">${s ? 'حفظ التعديلات' : 'إضافة الطالب'}</button>`);
}
async function saveStudent(id){
  const s = {name:$('#st-name').value.trim().replace(/\s+/g, ' '), cls:normCls($('#st-cls').value), phone:phoneDigits($('#st-phone').value), notes:$('#st-notes').value.trim()};
  const err = $('#st-err'), fail = m => { err.textContent = m; err.hidden = false; };
  if (s.name.length < 2) return fail('اكتب اسم الطالب.');
  if (!s.cls) return fail('اكتب الفصل، مثال: 10/3');
  if (!id && M().students.some(x => norm(x.name) === norm(s.name) && x.cls === s.cls)) return fail('هذا الطالب مسجل في الفصل نفسه.');
  const r = await save(() => id ? API.updateStudent(id, s) : API.addStudent(s));
  if (!r) return;
  S.students[r.id] = r; bump(); closeSheet();
  if (id) toast('حُفظت بيانات الطالب');
  else toast('أُضيف الطالب: ' + s.name, {btn:'فتح الملف', onBtn:() => go('student', {id:r.id, from:'students'})});
}
async function delStudent(id){
  if (!await save(() => API.deleteStudent(id), 'حُذف الطالب')) return;
  delete S.students[id]; bump(); closeSheet();
  if (S.view === 'student') go('students');
}


/* --- import --- */
function openImport(){
  const body = `<div class="form">
    <p class="note">انسخ من ملف إكسل الأعمدة بالترتيب: اسم الطالب، الفصل، هاتف ولي الأمر (اختياري)، ثم الصقها هنا. كل طالب في سطر.</p>
    <div class="field"><label for="imp-text">قائمة الطلاب</label><textarea id="imp-text" rows="8" data-in="imp" placeholder="اسم الطالب	10/3	رقم الهاتف"></textarea></div>
    <div class="field"><label for="imp-cls">فصل لكل الأسماء <span class="opt">(إذا كانت القائمة لفصل واحد بلا عمود فصل)</span></label><input id="imp-cls" data-in="imp" placeholder="مثال: 10/3"></div>
    <div class="meta" id="imp-sum" aria-live="polite"></div>
    <div class="progress" id="imp-prog" hidden><i></i></div></div>`;
  openSheet('import', 'استيراد الطلاب', body, `<button class="btn primary block" id="imp-go" data-act="imp-run" disabled>استيراد</button>`);
}
function parseImport(text, defCls){
  const rows = [], have = new Set(M().students.map(s => norm(s.name) + '|' + s.cls)), seen = new Set();
  let dup = 0, bad = 0;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let c = (line.indexOf('\t') >= 0 ? line.split('\t') : line.split(/[,،;]/)).map(x => x.trim());
    if (c.length > 1 && /^\d{1,4}$/.test(latinDigits(c[0]))) c = c.slice(1);
    const name = (c[0] || '').replace(/\s+/g,' ');
    if (!name || /^(م|الاسم|اسم الطالب|name)$/i.test(name)) continue;
    const cls = normCls(c[1] || '') || normCls(defCls || '');
    if (!cls) { bad++; continue; }
    const k = norm(name) + '|' + cls;
    if (have.has(k) || seen.has(k)) { dup++; continue; }
    seen.add(k); rows.push({name, cls, phone:phoneDigits(c[2] || '')});
  }
  return {rows, dup, bad};
}
function impSummary(){
  const p = parseImport($('#imp-text').value, $('#imp-cls').value), btn = $('#imp-go');
  const parts = [];
  if (p.rows.length) parts.push('جاهز للإضافة: ' + p.rows.length);
  if (p.dup) parts.push('موجود مسبقاً: ' + p.dup);
  if (p.bad) parts.push('بلا فصل: ' + p.bad);
  $('#imp-sum').textContent = parts.join(' · ');
  btn.disabled = !p.rows.length;
  btn.textContent = p.rows.length ? `استيراد ${p.rows.length} من الطلاب` : 'استيراد';
}
async function runImport(){
  const rows = parseImport($('#imp-text').value, $('#imp-cls').value).rows;
  if (!rows.length) return;
  const btn = $('#imp-go'), bar = $('#imp-prog'), fill = bar.firstElementChild, total = rows.length;
  btn.disabled = true; bar.hidden = false;
  const ok = await save(() => API.importStudents(rows, done => {
    if (fill.isConnected) { fill.style.width = Math.round(done * 100 / total) + '%'; btn.textContent = `جارٍ الاستيراد… ${done} من ${total}`; }
  }));
  if (!ok) { if (btn.isConnected) impSummary(); reload(); return; }
  if (S.sheet && S.sheet.kind === 'import') closeSheet();
  toast('اكتمل الاستيراد. عدد الطلاب المضافين: ' + total);
  reload();
}


/* --- حسابات الطاقم (لمسؤول الموقع) --- */
function genPassword(){
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint32Array(8));
  let p = ''; for (const x of r) p += chars[x % chars.length]; return p;
}
function openStaffNew(){
  const body = `<div class="form">
    <div class="field"><label for="sf-name">الاسم كما يراه الزملاء</label><input id="sf-name" placeholder="مثال: أ. فهد الشمري"></div>
    <div class="field"><label for="sf-user">اسم المستخدم (بالإنجليزي)</label><input id="sf-user" autocapitalize="none" autocorrect="off" spellcheck="false" dir="ltr" placeholder="fahad"></div>
    <div class="field"><label for="sf-pass">كلمة السر</label><div class="gen"><input id="sf-pass" value="${genPassword()}" autocomplete="off" spellcheck="false"><button type="button" class="btn ghost sm" data-act="gen-pw">كلمة أخرى</button></div></div>
    <div class="field"><span class="lbl">الدور</span>${roleButtons('sf-role', 'supervisor')}</div>
    <div class="setrow flush"><div class="main"><div class="t1">مسؤول الموقع</div><div class="t2 wrap">يضيف الحسابات ويعدّلها. اتركه مطفأ لأغلب الطاقم.</div></div><button class="sw" role="switch" aria-checked="false" data-act="sf-admin" aria-label="مسؤول الموقع"></button></div>
    <p class="err" id="sf-err" hidden></p></div>`;
  openSheet('staff', 'إضافة عضو للطاقم', body, `<button class="btn primary block" id="sf-go" data-act="staff-create">إنشاء الحساب</button>`, {role:'supervisor', admin:false});
}
async function createStaff(){
  const err = $('#sf-err'), fail = m => { err.textContent = m; err.hidden = false; };
  const name = $('#sf-name').value.trim().replace(/\s+/g, ' '), username = $('#sf-user').value.trim().toLowerCase(), password = $('#sf-pass').value.trim();
  err.hidden = true;
  if (name.length < 2) return fail('اكتب الاسم.');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail(ERR.bad_username);
  if (password.length < 6) return fail(ERR.weak_password);
  const btn = $('#sf-go'); btn.disabled = true; btn.textContent = 'جارٍ الإنشاء…';
  try { await API.adminUsers({op:'create', name, username, password, role:S.sheet.role, is_admin:S.sheet.admin}); }
  catch(e) { btn.disabled = false; btn.textContent = 'إنشاء الحساب'; return fail(errText(e)); }
  showCredentials(name, username, password, 'أُنشئ الحساب');
  reload();
}
function showCredentials(name, username, password, title){
  const url = location.href.split('#')[0];
  const text = `${APP_CONFIG.SCHOOL} — سجل الإشراف\nالرابط: ${url}\nاسم المستخدم: ${username}\nكلمة السر: ${password}`;
  openSheet('cred', title, `<p>أرسل هذه البيانات إلى ${esc(name)}، بالواتساب مثلاً. يقدر يغيّر كلمة السر بنفسه بعد الدخول من «المزيد».</p>
    <div class="cred"><span class="meta">الرابط</span><b>${esc(url)}</b><span class="meta">اسم المستخدم</span><b>${esc(username)}</b><span class="meta">كلمة السر</span><b>${esc(password)}</b></div>`,
    `<button class="btn primary block" data-act="copy" data-text="${esc(text)}">${icon('copy','sm')}نسخ البيانات</button>
     <a class="btn ghost block" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${icon('chat','sm')}إرسال بالواتساب</a>`);
}
function openStaff(id){
  const st = S.staff[id]; if (!st) return;
  const self = id === S.uid;
  const body = `<div class="form">
    <div class="field"><label for="sf-name">الاسم كما يراه الزملاء</label><input id="sf-name" value="${esc(st.name)}"></div>
    <div class="field"><span class="lbl">اسم المستخدم</span><span class="code">${esc(st.username)}</span></div>
    <div class="field"><span class="lbl">الدور</span>${roleButtons('sf-role', st.role)}</div>
    <div class="setrow flush"><div class="main"><div class="t1">مسؤول الموقع</div><div class="t2 wrap">${self ? 'لا يمكنك إزالة الإدارة عن نفسك.' : 'يضيف الحسابات ويعدّلها.'}</div></div><button class="sw" role="switch" aria-checked="${st.isAdmin}" data-act="sf-admin" aria-label="مسؤول الموقع"${self ? ' disabled' : ''}></button></div>
    <p class="note">المدير والوكيل والمشرف العام يعتمدون الفصل، ويتابعون كل التقارير، ويصحّحون أي قيد. وهم وشؤون الطلبة يديرون قوائم الطلاب.</p>
    <div class="btns"><button class="btn ghost" data-act="staff-pw" data-id="${esc(id)}" data-confirm="اضغط مرة أخرى لتعيين كلمة جديدة">${icon('edit','sm')}تعيين كلمة سر جديدة</button>
    ${self ? '' : (st.active ? `<button class="btn ghost" data-act="staff-active" data-id="${esc(id)}" data-v="0" data-confirm="اضغط مرة أخرى لإيقاف الحساب">إيقاف الحساب</button>` : `<button class="btn ok" data-act="staff-active" data-id="${esc(id)}" data-v="1">إعادة تفعيل الحساب</button>`)}</div>
    ${st.active ? '' : '<p class="meta">الحساب موقوف: لا يقدر صاحبه يدخل، وقيوده السابقة باقية باسمه.</p>'}</div>`;
  openSheet('staff', st.name, body, `<button class="btn primary block" data-act="staff-save" data-id="${esc(id)}">حفظ</button>`, {role:st.role, admin:st.isAdmin});
}
async function saveStaff(id){
  const name = $('#sf-name').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return toast('اكتب الاسم.', {bad:true});
  if (await save(() => API.adminUsers({op:'update', id, name, role:S.sheet.role, is_admin:S.sheet.admin}), 'حُفظت بيانات العضو')) { closeSheet(); reload(); }
}
async function setStaffActive(id, active){
  if (await save(() => API.adminUsers({op:'update', id, active}), active ? 'أُعيد تفعيل الحساب' : 'أُوقف الحساب')) { closeSheet(); reload(); }
}
async function resetStaffPassword(id){
  const st = S.staff[id]; if (!st) return;
  const password = genPassword();
  if (await save(() => API.adminUsers({op:'password', id, password}))) showCredentials(st.name, st.username, password, 'كلمة سر جديدة');
}
function openPassword(){
  openSheet('pw', 'تغيير كلمة السر', `<div class="form">${pwField('pw-new', 'كلمة السر الجديدة (6 أحرف على الأقل)', 'new-password')}${pwField('pw-again', 'أعد كتابتها', 'new-password')}<p class="err" id="pw-err" hidden></p></div>`,
    `<button class="btn primary block" data-act="pw-save">حفظ كلمة السر</button>`);
}
async function savePassword(){
  const a = $('#pw-new').value, b = $('#pw-again').value, err = $('#pw-err'), fail = m => { err.textContent = m; err.hidden = false; };
  if (a.length < 6) return fail(ERR.weak_password);
  if (a !== b) return fail('كلمتا السر غير متطابقتين.');
  if (await save(() => API.changePassword(a), 'تغيّرت كلمة السر')) closeSheet();
}


/* ===== الأحداث ===== */
function copyText(text, el){
  const fallback = () => {
    const box = (el.closest('.contact') && el.closest('.contact').querySelector('.phone')) || $('#sheet .cred');
    if (box) { const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    toast('حدّدتُ النص، انسخه يدوياً');
  };
  try { navigator.clipboard.writeText(text).then(() => toast('تم النسخ'), fallback); } catch(e) { fallback(); }
}
function setFilter(k, v){
  const parts = k.split('.'), f = S.f[parts[0]];
  if (!f) return;
  f[parts[1]] = v;
  f.limit = parts[0] === 'log' ? 120 : 150;
  update();
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'A' || el.disabled) return;
  if (el.dataset.confirm && el.dataset.armed !== '1') {
    el.dataset.armed = '1'; const orig = el.innerHTML; el.textContent = el.dataset.confirm;
    setTimeout(() => { if (el.isConnected && el.dataset.armed === '1') { el.dataset.armed = ''; el.innerHTML = orig; } }, 4000);
    return;
  }
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'go': go(el.dataset.v); break;
    case 'go-log': S.f.log = {type:el.dataset.type || 'all', status:el.dataset.status || 'all', period:el.dataset.period || 'all', cls:'all', q:'', limit:120}; go('log'); break;
    case 'back': go(S.params.from || 'students'); break;
    case 'open-action': openAction(id); break;
    case 'open-student': { const from = S.view === 'student' ? (S.params.from || 'students') : S.view; go('student', {id, from}); break; }
    case 'record': openRecord({studentId: el.dataset.student || ''}); break;
    case 'close-sheet': closeSheet(); break;
    case 'quick': moveStatus(id, el.dataset.to); break;
    case 'move': moveStatus(id, el.dataset.to, ($('#ad-note') || {}).value); break;
    case 'resched': resched(id); break;
    case 'act-del': delAction(id); break;
    case 'r-type': R.type = el.dataset.t; renderRExtra(); break;
    case 'r-pick': R.studentId = id; R.isNew = false; renderRStu(); break;
    case 'r-clear': R.studentId = ''; R.q = ''; R.isNew = false; renderRStu(); setTimeout(() => { const q = $('#r-q'); if (q) q.focus(); }, 30); break;
    case 'r-new': R.isNew = true; renderRRes(); $('#r-new').hidden = false; $('#r-newname').value = R.q.trim(); $('#r-newcls').focus(); break;
    case 'r-save': saveRecord(); break;
    case 'stu-add': openStudent('', el.dataset.name || ''); break;
    case 'stu-edit': openStudent(id); break;
    case 'stu-save': saveStudent(id); break;
    case 'stu-del': delStudent(id); break;
    case 'stu-import': openImport(); break;
    case 'imp-run': runImport(); break;
    case 'f': setFilter(el.dataset.k, el.dataset.v); break;
    case 'pref': { const k = el.dataset.k; setPrefs({[k]: !prefs()[k]}); if (k === 'sound' && prefs().sound) chime(); break; }
    case 'pref-type': { const t = Object.assign({}, prefs().types); t[el.dataset.t] = !t[el.dataset.t]; setPrefs({types:t}); break; }
    case 'markread': S.seenMark = Date.now(); setPrefs({lastSeen:Date.now()}); break;
    case 'more-log': S.f.log.limit += 120; update(); break;
    case 'more-stu': S.f.stu.limit += 150; update(); break;
    case 'copy': copyText(el.dataset.text, el); break;
    case 'reload': S.fatal = ''; reload(); break;
    case 'signout': API.signOut().catch(() => {}).finally(() => { teardown(); S.authState = 'out'; setGate(); }); break;
    case 'pw-toggle': { const i = document.getElementById(el.dataset.for); if (i) { const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.textContent = show ? 'إخفاء' : 'إظهار'; } break; }
    case 'pw-open': openPassword(); break;
    case 'pw-save': savePassword(); break;
    case 'su-role': S.setupRole = el.dataset.r; $$('[data-act="su-role"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === S.setupRole))); break;
    case 'staff-new': openStaffNew(); break;
    case 'staff-create': createStaff(); break;
    case 'staff-open': openStaff(id); break;
    case 'staff-save': saveStaff(id); break;
    case 'staff-active': setStaffActive(id, el.dataset.v === '1'); break;
    case 'staff-pw': resetStaffPassword(id); break;
    case 'sf-role': S.sheet.role = el.dataset.r; $$('[data-act="sf-role"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === S.sheet.role))); break;
    case 'sf-admin': S.sheet.admin = !S.sheet.admin; el.setAttribute('aria-checked', String(S.sheet.admin)); break;
    case 'gen-pw': $('#sf-pass').value = genPassword(); break;
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'login-form') doLogin();
  else if (e.target.id === 'setup-form') doSetup();
});
let inputTimer = null;
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.in;
  if (!k) return;
  if (k === 'log-q' || k === 'stu-q') { S.f[k === 'log-q' ? 'log' : 'stu'].q = e.target.value; clearTimeout(inputTimer); inputTimer = setTimeout(update, 140); }
  else if (k === 'r-q') { R.q = e.target.value; R.isNew = false; const n = $('#r-new'); if (n) n.hidden = true; renderRRes(); }
  else if (k === 'imp') impSummary();
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'l-cls') { S.f.log.cls = el.value; S.f.log.limit = 120; update(); }
  else if (el.id === 'r-vio') { const o = $('#r-other'); o.hidden = el.value !== '__other'; if (!o.hidden) o.focus(); }
  else if (el.id === 'r-days' || el.id === 'r-from') updRange();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.sheet) closeSheet(); });


/* ===== التشغيل ===== */
function teardown(){
  if (S.unsub) { S.unsub(); S.unsub = null; }
  S.uid = null; S.loaded = false; S.staff = {}; S.students = {}; S.actions = {}; S.prefsDoc = null; S.orphan = {};
  S.fatal = ''; S.view = 'home'; S.params = {}; S.ver++;
}
async function enter(uid){
  S.uid = uid; S.authState = 'in'; S.loadAt = Date.now(); setGate();
  try { await loadData(); } catch(e) { S.fatal = errText(e); }
  if (!S.unsub && S.loaded) S.unsub = API.subscribe(RT);
  setGate();
}
async function boot(){
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  if (!API.configured) { setGate(); return; }
  setGate();
  API.onAuth(ev => { if (ev === 'SIGNED_OUT' && S.authState === 'in') { teardown(); S.authState = 'out'; setGate(); } });
  try {
    const s = await API.session();
    if (s && s.user) return enter(s.user.id);
    S.authState = (await API.setupNeeded()) ? 'setup' : 'out';
  } catch(e) { S.authState = 'out'; S.fatal = errText(e); }
  setGate();
}
boot();

