'use strict';
// شاشات الدخول، والنوافذ السفلية (تسجيل إجراء، تفاصيل القيد، الطلاب، الاستيراد، حسابات الطاقم)، والأحداث، والتشغيل.
/* ===== شاشات الدخول ===== */
const gateShell = inner => `<div class="gate"><img class="logo" src="icons/logo.png" alt="شعار مدرسة الأصمعي الثانوية بنين" width="96" height="96">${inner}</div>`;
// أزرار الأدوار، وتحتها وصف صلاحيات الدور المختار
const roleButtons = (act, cur) => `<div class="roles" role="group" aria-label="الدور">${ROLE_KEYS.map(k => `<button type="button" data-act="${act}" data-r="${k}" aria-pressed="${cur === k}">${ROLES[k]}</button>`).join('')}</div>
  <p class="note" id="${act}-note" aria-live="polite"${cur ? '' : ' hidden'}>${esc(ROLE_DESC[cur] || '')}</p>`;
function pickRole(act, r){
  $$(`[data-act="${act}"]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === r)));
  const n = document.getElementById(act + '-note');
  if (n) { n.textContent = ROLE_DESC[r] || ''; n.hidden = !r; }
}
const pwField = (id, label, auto) => `<div class="field"><label for="${id}">${label}</label><div class="pw"><input id="${id}" type="password" autocomplete="${auto}" dir="ltr"><button type="button" data-act="pw-toggle" data-for="${id}">إظهار</button></div></div>`;
const GATES = {
  loading(el){ el.innerHTML = '<div class="loading">جارٍ فتح السجل…</div>'; },
  config(el){ el.innerHTML = gateShell(`<h1>الموقع غير مربوط بعد</h1><p>لم تُضبط إعدادات قاعدة البيانات في الملف js/config.js. بعد ربطها تظهر هنا شاشة الدخول.</p>`); },
  fatal(el){ el.innerHTML = gateShell(`<h1>تعذر فتح السجل</h1><p>${esc(S.fatal)}</p><div class="btns"><button class="btn primary" data-act="reload">إعادة المحاولة</button><button class="btn ghost" data-act="signout">تسجيل الخروج</button></div>`); },
  offline(el){ el.innerHTML = gateShell(`<h1>لا يوجد اتصال بالإنترنت</h1><p>دخولك محفوظ على هذا الجهاز، ما تحتاج تسجل دخول من جديد. يفتح السجل تلقائياً أول ما يرجع الاتصال.</p><div class="btns"><button class="btn primary" data-act="retry-boot">إعادة المحاولة</button></div>`); },
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
    el.innerHTML = gateShell(`<h1>إعداد السجل لأول مرة</h1><p>أنشئ حساب مسؤول الموقع. بهذا الحساب تضيف حسابات الطاقم بعد ذلك. رمز الإعداد يستخدم مرة واحدة، فما يقدر أحد غيرك ينشئ هذا الحساب.</p>
      <form class="form" id="setup-form" novalidate>
        <div class="field"><label for="su-name">اسمك كما يراه الزملاء</label><input id="su-name" autocomplete="name" placeholder="مثال: أ. خالد العنزي"></div>
        <div class="field"><label for="su-user">اسم المستخدم (بالإنجليزي)</label><input id="su-user" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" dir="ltr" placeholder="khaled"></div>
        ${pwField('su-pass', 'كلمة السر (8 أحرف على الأقل)', 'new-password')}
        <div class="field"><label for="su-code">رمز الإعداد</label><input id="su-code" autocomplete="one-time-code" autocapitalize="none" autocorrect="off" spellcheck="false" dir="ltr" placeholder="يصلك من Claude"></div>
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
  const name = $('#su-name').value.trim().replace(/\s+/g, ' '), username = $('#su-user').value.trim().toLowerCase(), password = $('#su-pass').value, role = S.setupRole, code = $('#su-code').value.trim();
  err.hidden = true;
  if (name.length < 2) return fail('اكتب اسمك.');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail(ERR.bad_username);
  if (password.length < 8) return fail(ERR.weak_password);
  if (!role) return fail('اختر دورك في المدرسة.');
  if (!code) return fail('اكتب رمز الإعداد.');
  btn.disabled = true; btn.textContent = 'جارٍ الإنشاء…';
  try { await API.setup({name, username, password, role, code}); await API.signIn(username, password); const s = await API.session(); await enter(s.user.id); }
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
  if (!S.sheet) return;
  if (S.sheet.kind === 'absence') return renderAbsence();
  const body = $('#sheetBody'), ae = document.activeElement;
  if (body && ae && body.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  if (S.sheet.kind === 'absview') return renderAbsView();
  if (S.sheet.kind === 'action') renderActionBody();
}

/* --- record --- */
let R = null;
function openRecord(o){
  o = o || {};
  if (!canRecord()) return toast('تسجيل الإجراءات للمشرفين والإدارة.', {bad:true});
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
  if (t === 'report') h = `<p class="note">يُحفظ التقرير في سجل الطالب، ولا يُرسل لأحد. يراه الطاقم عند فتح ملف الطالب.</p>`;
  if (t === 'pledge') h = `<p class="note">بعد أن يوقّع الطالب على التعهد، افتح القيد واضغط «تم توقيع التعهد».</p>`;
  ex.innerHTML = h;
  if (t === 'suspend') updRange();
  setSaveLabel(); renderRHint();
}
function setSaveLabel(){
  const b = $('#r-save'); if (!b) return;
  b.disabled = false;
  b.textContent = {pledge:'حفظ التعهد', report:'حفظ التقرير', summon:'حفظ الاستدعاء', suspend: isApprover() ? 'حفظ الفصل معتمداً' : 'إرسال طلب الفصل للاعتماد'}[R.type];
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
  const msg = {pledge:'حُفظ التعهد', report:'حُفظ التقرير في سجل الطالب', summon:'حُفظ الاستدعاء', suspend: saved && saved.status === 'approved' ? 'حُفظ الفصل معتمداً' : 'أُرسل طلب الفصل للاعتماد'}[type];
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
    : a.type === 'report' ? '<span class="pill tone-mute">في سجل الطالب</span>' : pill(a);
  const mv = ((MOVES[a.type] || {})[a.status]) || [];
  let moves = '';
  if (mv.length && canRecord()) {
    moves = (a.type === 'suspend' && !isApprover()) ? `<p class="note">يعتمد الفصل المدير أو الوكيل أو المشرف العام.</p>` :
      `<div class="field"><label for="ad-note">ملاحظة مع التحديث <span class="opt">(اختياري)</span></label><input id="ad-note" placeholder="${a.type === 'summon' ? 'مثال: حضر الأب ووقّع' : 'اكتب ملاحظة قصيرة'}">
        <div class="btns">${mv.map(m => `<button class="btn ${m[2]}" data-act="move" data-id="${esc(a.id)}" data-to="${m[0]}">${esc(m[1])}</button>`).join('')}</div></div>`;
  }
  body.innerHTML = `
    <div class="ad-top">${tchip(a.type)}<span class="code">${esc(code(a.id))}</span><span class="grow"></span>${stamp}</div>
    <button class="ad-stu" data-act="open-student" data-id="${esc(a.studentId)}">${esc(stuName(a))}<span>${esc(stuCls(a))}</span></button>
    ${timeBanner(a)}
    <dl class="kv">
      <div><dt>المخالفة</dt><dd>${esc(a.violation || '—')}</dd></div>
      <div><dt>تاريخ الواقعة</dt><dd>${esc(fmtDay(a.date))}</dd></div>
      ${a.type === 'summon' ? `<div><dt>موعد الحضور</dt><dd>${esc(fmtDay(a.summonDate))}${a.summonTime ? ' · ' + esc(fmtHM(a.summonTime)) : ''}</dd></div>` : ''}
      ${a.type === 'suspend' ? `<div><dt>المدة</dt><dd>${esc(schoolDaysTxt(a.suspendDays || 1))}</dd></div><div><dt>الفترة</dt><dd>${a.suspendFrom === a.suspendTo ? esc(fmtDay(a.suspendFrom)) : esc(fmtDay(a.suspendFrom)) + ' — ' + esc(fmtDay(a.suspendTo))}</dd></div>` : ''}
      <div><dt>سجّله</dt><dd>${esc(personName(a.createdBy))}${personTitle(a.createdBy) ? ' · ' + esc(personTitle(a.createdBy)) : ''}<br><span class="meta">${esc(dayLabel(ymd(new Date(a.createdAt))))} ${esc(fmtTime(a.createdAt))}</span></dd></div>
    </dl>
    ${a.details ? `<div class="field"><span class="lbl">التفاصيل</span><p class="details">${esc(a.details)}</p></div>` : ''}
    ${contactBox(a)}
    ${moves}
    ${a.type === 'summon' && canRecord() ? `<details class="more-box" id="ad-rs"><summary>تغيير موعد الحضور</summary><div class="form">
      <div class="two"><input id="ad-sd" type="date" value="${esc(a.summonDate || '')}" aria-label="تاريخ الموعد"><input id="ad-st" type="time" value="${esc(a.summonTime || '08:00')}" aria-label="ساعة الموعد"></div>
      <button class="btn primary" data-act="resched" data-id="${esc(a.id)}">حفظ الموعد الجديد</button></div></details>` : ''}
    <section class="field"><span class="lbl">سير القيد</span><ol class="tl small">${(a.log || []).slice().reverse().map(e => logItem(a, e)).join('')}</ol></section>
    ${canDelete(a) ? `<div class="btns"><button class="btn ghost" data-act="act-del" data-id="${esc(a.id)}" data-confirm="اضغط مرة أخرى لحذف القيد">${icon('trash','sm')}حذف القيد</button></div>` : ''}`;
  for (const k in keep) { const i = document.getElementById(k); if (i && i.value !== keep[k] && keep[k]) i.value = keep[k]; }
  if (openD && $('#ad-rs', body)) $('#ad-rs', body).open = true;
  body.scrollTop = sc;
}
// التواصل مع ولي الأمر في الاستدعاء والفصل: من تواصل ومتى، أو رقم ولي الأمر وزر «تم التواصل»
function contactBox(a){
  if (!CONTACT_TYPES.includes(a.type)) return '';
  const s = stuOf(a), phone = s && s.phone, can = canContact();
  let inner;
  if (a.contactedAt) {
    inner = `<div class="banner ok">${icon('check')}<div><b>تم التواصل مع ولي الأمر</b>
        <div class="meta">${esc(personName(a.contactedBy))} · ${esc(dayLabel(ymd(new Date(a.contactedAt))))} ${esc(fmtTime(a.contactedAt))}</div>
        ${a.contactNote ? `<div>${esc(a.contactNote)}</div>` : ''}</div></div>` +
      (can ? `<div class="btns"><button class="btn ghost sm" data-act="uncontact" data-id="${esc(a.id)}" data-confirm="اضغط مرة أخرى لإلغاء تسجيل التواصل">إلغاء تسجيل التواصل</button></div>` : '');
  } else if (contactOpen(a)) {
    const ph = phone
      ? `<div class="contact"><span class="meta">هاتف ولي الأمر</span><span class="phone">${esc(phone)}</span><span class="grow"></span>
          <a class="btn sm ghost" href="tel:${esc(phoneDigits(phone))}">${icon('summon','sm')}اتصال</a>
          <a class="btn sm ghost" href="https://wa.me/${esc(waNum(phone))}" target="_blank" rel="noopener">${icon('chat','sm')}واتساب</a></div>`
      : `<p class="note">لا يوجد رقم لولي الأمر في ملف الطالب.${s && isManager() ? ` <button class="link" data-act="stu-edit" data-id="${esc(s.id)}">إضافة الرقم</button>` : ''}</p>`;
    inner = ph + (can
      ? `<input id="ad-cnote" placeholder="ملاحظة (اختياري)، مثال: أُبلغ الأب بالموعد" aria-label="ملاحظة عن التواصل">
         <button class="btn ok block" data-act="contact" data-id="${esc(a.id)}">${icon('check','sm')}تم التواصل مع ولي الأمر</button>`
      : `<p class="note">لم يُسجَّل التواصل مع ولي الأمر بعد. تسجّله شؤون الطلبة بعد الاتصال.</p>`);
  } else if (a.type === 'suspend' && a.status === 'pending') {
    inner = `<p class="note">يُتواصل مع ولي الأمر بعد اعتماد الفصل.</p>`;
  } else return '';
  return `<section class="field"><span class="lbl">التواصل مع ولي الأمر</span>${inner}</section>`;
}
async function markContact(id, done, quick){
  const a = S.actions[id]; if (!a) return;
  if (!canContact()) return toast(ERR.not_allowed, {bad:true});
  const note = done && !quick ? (($('#ad-cnote') || {}).value || '').trim() : '';
  const ok = await save(() => API.markContact(id, done, note));
  if (!ok) return;
  if ($('#ad-cnote')) $('#ad-cnote').value = '';
  toast(DONE[done ? 'contacted' : 'uncontacted'] + ': ' + stuName(a), done ? {btn:'تراجع', onBtn:() => markContact(id, false, true)} : {});
  refreshAction(id);
}
async function moveStatus(id, to, note){
  const a = S.actions[id]; if (!a) return;
  if (!canRecord()) return toast(ERR.not_allowed, {bad:true});
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
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint32Array(10));
  let p = ''; for (const x of r) p += chars[x % chars.length]; return p;
}
// جناح المشرف في نافذة العضو (للمشرف فقط)
function wingPicker(sel, role){
  return `<div class="field" id="sf-wing-field"${role === 'supervisor' ? '' : ' hidden'}><span class="lbl">الجناح</span>
    <div class="chips multi" id="sf-wing">${wingList().map(w => `<button type="button" class="chip" data-act="sf-wing" data-w="${w.id}" aria-pressed="${sel === w.id}">${esc(w.name)}</button>`).join('')}
      <button type="button" class="chip" data-act="sf-wing" data-w="" aria-pressed="${!sel}">بدون جناح</button></div>
    <p class="meta">يرى المشرف في الرئيسية إجراءات فصول جناحه فقط، وتصله إشعاراتها، ويسجل غيابها اليومي. فصول كل جناح من «المزيد» ← الأجنحة.</p></div>`;
}
function openStaffNew(){
  const body = `<div class="form">
    <div class="field"><label for="sf-name">الاسم كما يراه الزملاء</label><input id="sf-name" placeholder="مثال: أ. فهد الشمري"></div>
    <div class="field"><label for="sf-user">اسم المستخدم (بالإنجليزي)</label><input id="sf-user" autocapitalize="none" autocorrect="off" spellcheck="false" dir="ltr" placeholder="fahad"></div>
    <div class="field"><label for="sf-pass">كلمة السر</label><div class="gen"><input id="sf-pass" value="${genPassword()}" autocomplete="off" spellcheck="false"><button type="button" class="btn ghost sm" data-act="gen-pw">كلمة أخرى</button></div></div>
    <div class="field"><span class="lbl">الدور</span>${roleButtons('sf-role', 'supervisor')}</div>
    ${wingPicker(null, 'supervisor')}
    <div class="setrow flush"><div class="main"><div class="t1">مسؤول الموقع</div><div class="t2 wrap">يضيف الحسابات ويعدّلها. اتركه مطفأ لأغلب الطاقم.</div></div><button class="sw" role="switch" aria-checked="false" data-act="sf-admin" aria-label="مسؤول الموقع"></button></div>
    <p class="err" id="sf-err" hidden></p></div>`;
  openSheet('staff', 'إضافة عضو للطاقم', body, `<button class="btn primary block" id="sf-go" data-act="staff-create">إنشاء الحساب</button>`, {role:'supervisor', admin:false, wing:null});
}
async function createStaff(){
  const err = $('#sf-err'), fail = m => { err.textContent = m; err.hidden = false; };
  const name = $('#sf-name').value.trim().replace(/\s+/g, ' '), username = $('#sf-user').value.trim().toLowerCase(), password = $('#sf-pass').value.trim();
  err.hidden = true;
  if (name.length < 2) return fail('اكتب الاسم.');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail(ERR.bad_username);
  if (password.length < 8) return fail(ERR.weak_password);
  const btn = $('#sf-go'); btn.disabled = true; btn.textContent = 'جارٍ الإنشاء…';
  const wing = S.sheet.role === 'supervisor' ? S.sheet.wing : null;
  try { await API.adminUsers({op:'create', name, username, password, role:S.sheet.role, is_admin:S.sheet.admin}); }
  catch(e) { btn.disabled = false; btn.textContent = 'إنشاء الحساب'; return fail(errText(e)); }
  showCredentials(name, username, password, 'أُنشئ الحساب');
  await reload();
  const st = Object.values(S.staff).find(x => x.username === username);
  if (st && wing) await save(() => API.setStaffWing(st.id, wing));
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
    ${wingPicker(st.wingId, st.role)}
    <div class="setrow flush"><div class="main"><div class="t1">مسؤول الموقع</div><div class="t2 wrap">${self ? 'لا يمكنك إزالة الإدارة عن نفسك.' : 'يضيف الحسابات ويعدّلها.'}</div></div><button class="sw" role="switch" aria-checked="${st.isAdmin}" data-act="sf-admin" aria-label="مسؤول الموقع"${self ? ' disabled' : ''}></button></div>
    <div class="btns"><button class="btn ghost" data-act="staff-pw" data-id="${esc(id)}" data-confirm="اضغط مرة أخرى لتعيين كلمة جديدة">${icon('edit','sm')}تعيين كلمة سر جديدة</button>
    ${self ? '' : (st.active ? `<button class="btn ghost" data-act="staff-active" data-id="${esc(id)}" data-v="0" data-confirm="اضغط مرة أخرى لإيقاف الحساب">إيقاف الحساب</button>` : `<button class="btn ok" data-act="staff-active" data-id="${esc(id)}" data-v="1">إعادة تفعيل الحساب</button>`)}</div>
    ${st.active ? '' : '<p class="meta">الحساب موقوف: لا يقدر صاحبه يدخل، وقيوده السابقة باقية باسمه.</p>'}</div>`;
  openSheet('staff', st.name, body, `<button class="btn primary block" data-act="staff-save" data-id="${esc(id)}">حفظ</button>`, {role:st.role, admin:st.isAdmin, wing:st.wingId || null});
}
async function saveStaff(id){
  const name = $('#sf-name').value.trim().replace(/\s+/g, ' ');
  if (name.length < 2) return toast('اكتب الاسم.', {bad:true});
  const sh = S.sheet, st = S.staff[id] || {};
  if (!await save(() => API.adminUsers({op:'update', id, name, role:sh.role, is_admin:sh.admin}))) return;
  // المشرف في جناح واحد؛ ومن لم يعد مشرفاً يخرج من جناحه
  const wing = sh.role === 'supervisor' ? sh.wing : null;
  if ((st.wingId || null) !== (wing || null) && !await save(() => API.setStaffWing(id, wing))) return;
  toast('حُفظت بيانات العضو'); closeSheet(); reload();
}
/* --- الأجنحة: اسم الجناح ومشرفوه وفصوله --- */
// المشرف في جناح واحد والفصل في جناح واحد: اختيار ما في جناح آخر ينقله إلى هذا الجناح عند الحفظ
function openWing(id){
  const w = S.wings[id]; if (!w) return;
  if (!canWings()) return toast(ERR.not_allowed, {bad:true});
  const body = `<div class="form">
    <div class="field"><label for="wg-name">اسم الجناح</label><input id="wg-name" value="${esc(w.name)}" maxlength="40"></div>
    <div class="field"><span class="lbl">المشرفون</span><div class="chips multi" id="wg-sups"></div>
      <p class="meta">المشرف في جناح واحد: اختيار مشرف من جناح آخر ينقله إلى هذا الجناح.</p></div>
    <div class="field"><span class="lbl">الفصول</span><div class="chips multi" id="wg-cls"></div>
      <div class="addrow"><input id="wg-cls-new" placeholder="فصل آخر، مثال: 10/4" aria-label="فصل آخر"><button type="button" class="btn ghost sm" data-act="wg-cls-add">إضافة</button></div>
      <p class="meta">القائمة من فصول الطلاب المضافين. الفصل في جناح واحد: اختيار فصل من جناح آخر ينقله إلى هذا الجناح.</p></div>
    <p class="err" id="wg-err" hidden></p></div>`;
  openSheet('wing', w.name, body, `<button class="btn primary block" data-act="wing-save" data-id="${w.id}">حفظ الجناح</button>`,
    {wing:w.id, sups:new Set(supsOf(w.id).map(s => s.id)), classes:w.classes.slice(), extra:new Set()});
  renderWingChips();
}
function renderWingChips(){
  const sh = S.sheet; if (!sh || sh.kind !== 'wing') return;
  const other = wid => wid && wid !== sh.wing && S.wings[wid] ? `<span class="n">${esc(shortWing(S.wings[wid]))}</span>` : '';
  const sups = Object.values(S.staff).filter(s => s.role === 'supervisor' && (s.active || sh.sups.has(s.id)))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  $('#wg-sups').innerHTML = sups.map(s => `<button type="button" class="chip" data-act="wg-sup" data-id="${esc(s.id)}" aria-pressed="${sh.sups.has(s.id)}">${esc(s.name)}${sh.sups.has(s.id) ? '' : other(s.wingId)}</button>`).join('')
    || '<span class="meta">لا يوجد مشرفون بعد. أضف حساباتهم من «الطاقم» بدور «مشرف».</span>';
  const all = Array.from(new Set(M().classes.concat(sh.classes, Array.from(sh.extra)))).sort(clsCmp);
  $('#wg-cls').innerHTML = all.map(c => { const on = sh.classes.includes(c), cw = wingOfClass(c);
    return `<button type="button" class="chip" data-act="wg-cls" data-c="${esc(c)}" aria-pressed="${on}">${esc(c)}${on ? '' : other(cw && cw.id)}</button>`; }).join('')
    || '<span class="meta">لا توجد فصول بعد. أضف الطلاب أولاً، أو اكتب الفصل.</span>';
}
async function saveWing(id){
  const sh = S.sheet; if (!sh || sh.kind !== 'wing') return;
  const name = $('#wg-name').value.trim().replace(/\s+/g, ' '), err = $('#wg-err');
  if (name.length < 2) { err.textContent = 'اكتب اسم الجناح.'; err.hidden = false; return; }
  if (await save(() => API.setWing(id, name, sh.classes.slice(), Array.from(sh.sups)), 'حُفظ ' + name)) { closeSheet(); reload(); }
}
async function setStaffActive(id, active){
  if (await save(() => API.adminUsers({op:'update', id, active}), active ? 'أُعيد تفعيل الحساب' : 'أُوقف الحساب')) { closeSheet(); reload(); }
}
async function resetStaffPassword(id){
  const st = S.staff[id]; if (!st) return;
  const password = genPassword();
  if (await save(() => API.adminUsers({op:'password', id, password}))) showCredentials(st.name, st.username, password, 'كلمة سر جديدة');
}
async function openDeleted(){
  openSheet('deleted', 'سجل المحذوفات', '<p class="loading">جارٍ التحميل…</p>', '');
  let rows;
  try { rows = await API.loadDeleted(); } catch(e) { if ($('#sheetBody')) $('#sheetBody').innerHTML = `<p class="err">${esc(errText(e))}</p>`; return; }
  if (!S.sheet || S.sheet.kind !== 'deleted') return;
  $('#sheetBody').innerHTML = rows.length ? `<p class="meta">آخر ما حُذف من القيود والطلاب. يراه مسؤول الموقع فقط.</p><div class="list">${rows.map(r => {
    const d = r.row_data || {};
    const what = r.table_name === 'actions' ? `${(TYPES[d.type] || {}).label || 'قيد'}: ${d.student_name || ''} — ${d.violation || ''}`
      : r.table_name === 'demo' ? `البيانات التجريبية كلها (طلاب: ${d.students || 0} · إجراءات: ${d.actions || 0}${d.absence ? ' · أوراق غياب: ' + d.absence : ''})`
      : `طالب: ${d.name || ''}${d.cls ? ' (' + d.cls + ')' : ''}`;
    return `<div class="row"><span class="main"><span class="t1 wrap">${esc(what)}</span><span class="t2">حذفه ${esc(personName(r.deleted_by))} · ${esc(rel(Date.parse(r.deleted_at)))}</span></span></div>`;
  }).join('')}</div>` : '<p class="calm">لم يُحذف أي شيء.</p>';
}
/* --- الغياب اليومي --- */
// حالة الغياب المفتوح للتعديل: تبقى بعد إغلاق النافذة حتى يكتمل الحفظ التلقائي
let ABS = null;
function openAbsence(day){
  const cl = myClasses();
  if (!canRecord()) return toast(ERR.not_allowed, {bad:true});
  if (!cl) return toast(myWing() ? 'لم تُضف فصول جناحك بعد.' : 'لم يُحدَّد جناحك بعد.', {bad:true});
  day = day || today();
  if (isWeekend(day)) return toast(ERR.weekend);
  if (!ABS || ABS.day !== day || ABS.classes.join('|') !== cl.join('|')) {
    const picks = {}, marks = {};
    cl.forEach(c => { const x = absSheet(day, c); picks[c] = new Set(x ? x.absent.map(a => a.id) : []);
      marks[c] = {}; MARK_KEYS.forEach(k => { marks[c][k] = new Set(marksOf(x, k).map(a => a.id)); }); });
    ABS = {day, classes:cl, picks, marks, mode:(ABS && ABS.mode) || 'absent', open:cl.find(c => !absSheet(day, c)) || null, timers:{}, pending:{}, saving:{}};
  }
  openSheet('absence', 'الغياب اليومي', '', '<div id="abs-foot" class="stack-s"></div>', {day});
  renderAbsence();
}
function absBlock(c){
  const x = absSheet(ABS.day, c), set = ABS.picks[c], mk = ABS.marks[c], roster = rosterOf(c), open = ABS.open === c, sent = x && x.status === 'sent';
  const st = ABS.saving[c] ? 'يُحفظ…' : ABS.pending[c] ? 'لم يُحفظ بعد' : sent ? 'أُرسل' : x ? 'محفوظ' : 'لم يُسجَّل';
  const tone = sent ? 'ok' : (x && !ABS.pending[c]) ? 'info' : 'mute';
  const late = mk.late.size, viol = VIOL_KEYS.reduce((n, k) => n + mk[k].size, 0);
  const count = [set.size ? `${set.size} غائب من ${roster.length}` : x ? 'لا غياب' : `${roster.length} طالب`, late ? late + ' متأخر' : '', viol ? violTxt(viol) : ''].filter(Boolean).join(' · ');
  const m = ABS.mode, has = (id, k) => k === 'absent' ? set.has(id) : mk[k].has(id);
  let inner = '';
  if (open) inner = sent ? `<p class="abs-names">${peopleLines(x, 'لا غياب')}</p>`
    : roster.length ? `<div class="abs-list">${roster.map(s => `<button class="abs-stu" data-act="abs-stu" data-cls="${esc(c)}" data-id="${esc(s.id)}" data-m="${m}" aria-pressed="${has(s.id, m)}">
        <span>${esc(s.name)}</span><span class="abs-tags">${['absent'].concat(MARK_KEYS).filter(k => has(s.id, k)).map(mkTag).join('')}</span></button>`).join('')}</div>
        ${m === 'absent' && !set.size ? `<div class="abs-none"><button class="btn ok sm" data-act="abs-none" data-cls="${esc(c)}">${icon('check','sm')}لا غياب في ${esc(c)}</button></div>` : ''}`
    : '<p class="abs-names meta">لا يوجد طلاب لهذا الفصل في السجل.</p>';
  return `<section class="abs-cls${open ? ' open' : ''}"><button class="abs-h" data-act="abs-cls" data-cls="${esc(c)}" aria-expanded="${open}">
      <b>${esc(c)}</b><span class="meta">${esc(count)}</span><span class="grow"></span><span class="pill tone-${tone}">${esc(st)}</span></button>${inner}</section>`;
}
function renderAbsence(){
  const body = $('#sheetBody'), foot = $('#abs-foot');
  if (!ABS || !S.sheet || S.sheet.kind !== 'absence' || !body) return;
  const sc = body.scrollTop;
  body.innerHTML = `<p class="meta">${esc(fmtDay(ABS.day))}. اختر ما تسجله، ثم اضغط الفصل وأسماء الطلاب، أو «لا غياب». يُحفظ كل تغيير تلقائياً، ولا يصل لشؤون الطلبة إلا بعد الاعتماد.</p>` +
    absModes() + ABS.classes.map(absBlock).join('');
  body.scrollTop = sc;
  const xs = ABS.classes.map(c => absSheet(ABS.day, c)).filter(Boolean);
  const drafts = xs.filter(x => x.status === 'draft'), sent = xs.filter(x => x.status === 'sent');
  const missing = ABS.classes.filter(c => !absSheet(ABS.day, c) && !ABS.pending[c]);
  const n = ABS.classes.reduce((k, c) => k + ABS.picks[c].size, 0), waiting = Object.keys(ABS.pending).length + Object.keys(ABS.saving).length;
  const nl = ABS.classes.reduce((k, c) => k + ABS.marks[c].late.size, 0), nv = ABS.classes.reduce((k, c) => k + VIOL_KEYS.reduce((j, m) => j + ABS.marks[c][m].size, 0), 0);
  if (drafts.length || waiting) foot.innerHTML = `<p class="meta">المجموع: ${esc(countsTxt(n, nl, nv))}${missing.length ? ' · لم يُسجَّل بعد: ' + esc(missing.join('، ')) : ''}</p>` +
    `<button class="btn primary block" data-act="abs-send">اعتماد وإرسال لشؤون الطلبة</button>`;
  else if (sent.length) foot.innerHTML = `<p class="meta">أُرسل لشؤون الطلبة ${esc(fmtTime(Math.max.apply(null, sent.map(x => x.sentAt))))}${missing.length ? ' · لم يُسجَّل: ' + esc(missing.join('، ')) : ''}.</p>
    <button class="btn ghost block" data-act="abs-unsend" data-confirm="اضغط مرة أخرى لإلغاء الإرسال">إلغاء الإرسال للتعديل</button>`;
  else foot.innerHTML = '<p class="meta">اختر الغائبين في كل فصل أو «لا غياب»، ثم اعتمد.</p>';
}
// ما تسجله الآن فوق الفصول: الغياب أو التأخير أو الزي أو الشعر، وعدد كل واحد في الورقة
function absModes(){
  const sum = k => ABS.classes.reduce((n, c) => n + (k === 'absent' ? ABS.picks[c] : ABS.marks[c][k]).size, 0);
  return `<div class="abs-modes" role="group" aria-label="ما تسجله">${[['absent', 'الغياب']].concat(MARK_KEYS.map(k => [k, MARKS[k].mode])).map(([k, l]) => { const n = sum(k);
    return `<button type="button" class="m-${k}" data-act="abs-mode" data-m="${k}" aria-pressed="${ABS.mode === k}">${esc(l)}${n ? `<span class="n">${n}</span>` : ''}</button>`; }).join('')}</div>`;
}
// الضغط على الطالب: الغياب يمسح ما سُجّل عليه، والتأخير ينقله من الغياب (وصل متأخراً)، والمخالفة للحاضر فقط
function absToggle(c, id){
  const x = absSheet(ABS.day, c);
  if (x && x.status === 'sent') return toast(ERR.already_sent, {bad:true});
  const m = ABS.mode, set = ABS.picks[c], mk = ABS.marks[c];
  if (m === 'absent') {
    if (set.has(id)) set.delete(id); else { set.add(id); MARK_KEYS.forEach(k => mk[k].delete(id)); }
  } else if (m === 'late') {
    if (mk.late.has(id)) mk.late.delete(id); else { set.delete(id); mk.late.add(id); }
  } else {
    if (set.has(id)) return toast(ERR.absent_marked, {bad:true});
    if (mk[m].has(id)) mk[m].delete(id); else mk[m].add(id);
  }
  queueAbsSave(c, false); renderAbsence();
}
const marksPayload = mk => { const o = {}; MARK_KEYS.forEach(k => { o[k] = Array.from(mk[k]); }); return o; };
function queueAbsSave(c, now){
  ABS.pending[c] = true; clearTimeout(ABS.timers[c]);
  ABS.timers[c] = setTimeout(() => saveAbsClass(c), now ? 0 : 700);
}
async function refreshAbsence(day){
  try { (await API.absenceFor(day)).forEach(x => { S.absence[x.id] = x; }); S.ver++; schedule(); } catch(e) {}
}
async function saveAbsClass(c){
  const st = ABS; if (!st || !st.pending[c]) return true;
  clearTimeout(st.timers[c]); delete st.pending[c]; st.saving[c] = true; renderAbsence();
  const ok = await save(() => API.saveDaily(st.day, c, Array.from(st.picks[c]), marksPayload(st.marks[c])));
  delete st.saving[c];
  if (!ok) st.pending[c] = true;
  await refreshAbsence(st.day); renderAbsence();
  return !!ok;
}
async function absSend(){
  for (const c of Object.keys(ABS.pending)) if (!await saveAbsClass(c)) return;
  const n = await save(() => API.sendAbsence(ABS.day, ABS.classes));
  if (n === false) return;
  await refreshAbsence(ABS.day);
  toast('اعتُمد الغياب وأُرسل لشؤون الطلبة'); renderAbsence();
}
async function absUnsend(){
  if (await save(() => API.unsendAbsence(ABS.day, ABS.classes)) === false) return;
  await refreshAbsence(ABS.day);
  toast('أُلغي الإرسال. عدّل ثم اعتمد من جديد.'); renderAbsence();
}
// عرض الغياب المعتمد (شؤون الطلبة): أي يوم، والغائبون في كل فصل مع الاتصال بولي الأمر، والطباعة
const absSent = day => absList().filter(x => x.day === day && x.status === 'sent').sort((a, b) => clsCmp(a.cls, b.cls));
const shiftSchoolDay = (d, dir) => { let x = addDays(d, dir), g = 0; while (isWeekend(x) && g++ < 7) x = addDays(x, dir); return x; };
const pctOf = (n, d) => d ? (Math.round(n * 1000 / d) / 10) + '%' : '—';
const absFetched = new Set();   // أيام أقدم من الثلاثين يوماً المحمّلة، تُجلب عند فتحها
function openAbsenceView(day){
  openSheet('absview', 'الغياب اليومي', '', `<button class="btn primary block" id="abs-print" data-act="abs-print">طباعة إحصائية هذا اليوم</button>`, {day:today(), loading:false});
  absGo(day || today());
}
async function absGo(day){
  if (!S.sheet || S.sheet.kind !== 'absview' || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return;
  if (day > today()) day = today();
  S.sheet.day = day;
  if (day < addDays(today(), -30) && !absFetched.has(day)) {
    S.sheet.loading = true; renderAbsView();
    try { (await API.absenceFor(day)).forEach(x => { S.absence[x.id] = x; }); absFetched.add(day); S.ver++; }
    catch(e) { toast(errText(e), {bad:true}); }
    if (S.sheet && S.sheet.kind === 'absview') S.sheet.loading = false;
  }
  renderAbsView();
}
function renderAbsView(){
  const body = $('#sheetBody'); if (!body || !S.sheet || S.sheet.kind !== 'absview') return;
  const day = S.sheet.day, t = today(), sent = absSent(day);
  const missing = M().classes.filter(c => !sent.some(x => x.cls === c));
  body.innerHTML = `<div class="abs-nav">
      <input type="date" id="abs-date" value="${esc(day)}" max="${t}" aria-label="اختر التاريخ">
      <div class="two"><button class="btn sm ghost" data-act="abs-day" data-d="-1">اليوم السابق</button>
      <button class="btn sm ghost" data-act="abs-day" data-d="1"${day >= t ? ' disabled' : ''}>اليوم التالي</button></div></div>
    <div class="sec-h"><h2>${esc(fmtDay(day, {weekday:'long', day:'numeric', month:'long', year:'numeric'}))}</h2>
      ${sent.length ? `<span class="count num">${esc(dailyTxt(sent))}</span>` : ''}${day !== t ? '<button class="link" data-act="abs-day" data-d="0">اليوم</button>' : ''}</div>` +
    (S.sheet.loading ? '<p class="loading">جارٍ التحميل…</p>'
      : sent.length ? sent.map(x => `<section class="abs-cls open"><div class="abs-h"><b>${esc(x.cls)}</b>
          <span class="meta">${esc([x.absent.length ? x.absent.length + ' غائب من ' + x.total : 'لا غياب', lateCount([x]) ? lateCount([x]) + ' متأخر' : '', violCount([x]) ? violTxt(violCount([x])) : ''].filter(Boolean).join(' · '))}</span><span class="grow"></span>
          <span class="meta">${esc(personName(x.sentBy))} · ${esc(fmtTime(x.sentAt))}</span></div>
          ${sheetPeople(x).map(a => { const st = S.students[a.id], ph = st && st.phone, tags = a.kinds.filter(k => k !== 'absent');
            return `<div class="row"><button class="main" data-act="open-student" data-id="${esc(a.id)}"><span class="t1 wrap">${esc(a.name)}</span>${tags.length ? `<span class="abs-tags">${tags.map(mkTag).join('')}</span>` : ''}</button>
              ${ph ? `<a class="btn sm ghost" href="tel:${esc(phoneDigits(ph))}" aria-label="اتصال بولي أمر ${esc(a.name)}">${icon('summon','sm')}اتصال</a>` : '<span class="meta">لا يوجد رقم</span>'}</div>`; }).join('')}
        </section>`).join('')
      : `<p class="calm">${isWeekend(day) ? 'عطلة نهاية الأسبوع.' : day === t ? 'لم يصل غياب اليوم بعد. يصل بعد أن يعتمده المشرفون.' : 'لا يوجد غياب معتمد لهذا اليوم.'}</p>`) +
    (sent.length && missing.length ? `<p class="meta">لم يصل غياب: ${esc(missing.join('، '))}</p>` : '');
  const pb = $('#abs-print'); if (pb) pb.disabled = !sent.length || S.sheet.loading;
}
// ورقة الطباعة: ملخص اليوم، وجدول الفصول مع أسماء الغائبين، وتوقيع شؤون الطلبة
function absPrintHtml(day, sent){
  const C = window.APP_CONFIG || {};
  const total = sent.reduce((n, x) => n + x.total, 0), abs = absCount(sent), pres = total - abs, late = lateCount(sent), viol = violCount(sent);
  const marked = sent.flatMap(x => sheetPeople(x).filter(p => !p.kinds.includes('absent')).map(p => ({cls:x.cls, name:p.name, what:p.kinds.map(k => MARKS[k].g).join('، ')})));
  const missing = M().classes.filter(c => !sent.some(x => x.cls === c));
  const rows = sent.map(x => `<tr><td>${esc(x.cls)}</td><td>${x.total}</td><td>${x.absent.length}</td><td>${x.total - x.absent.length}</td><td>${pctOf(x.total - x.absent.length, x.total)}</td>
    <td class="names">${x.absent.length ? `<ol>${x.absent.map(a => `<li>${esc(a.name)}</li>`).join('')}</ol>` : 'لا غياب'}</td><td>${esc(personName(x.sentBy))}</td></tr>`).join('');
  return `<div class="pr">
    <header class="pr-h"><img class="pr-logo" src="icons/logo.png" alt="">
      <div><div class="pr-school">${esc(C.SCHOOL_FULL || C.SCHOOL || '')}</div><div class="pr-sub">شؤون الطلبة</div></div>
      <div class="pr-title"><b>إحصائية الغياب اليومي</b><span>${esc(fmtDay(day, {weekday:'long', day:'numeric', month:'long', year:'numeric'}))}</span></div></header>
    <section class="pr-sum"><div><span>عدد الطلاب</span><b>${total}</b></div><div><span>الغياب</span><b>${abs}</b></div>
      <div><span>الحضور</span><b>${pres}</b></div><div><span>نسبة الحضور</span><b>${pctOf(pres, total)}</b></div>
      <div><span>التأخير الصباحي</span><b>${late}</b></div><div><span>المخالفات</span><b>${viol}</b></div></section>
    <table class="pr-t"><thead><tr><th>الفصل</th><th>عدد الطلاب</th><th>الغياب</th><th>الحضور</th><th>نسبة الحضور</th><th>أسماء الغائبين</th><th>المشرف</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>المجموع</th><th>${total}</th><th>${abs}</th><th>${pres}</th><th>${pctOf(pres, total)}</th><th colspan="2">${sent.length} ${sent.length === 1 ? 'فصل' : sent.length <= 10 ? 'فصول' : 'فصلاً'}</th></tr></tfoot></table>
    ${missing.length ? `<p class="pr-miss">لم يصل غياب: ${esc(missing.join('، '))}</p>` : ''}
    ${marked.length ? `<h3 class="pr-h3">التأخير الصباحي والمخالفات</h3>
      <table class="pr-t"><thead><tr><th>الفصل</th><th>الطالب</th><th>ما سُجّل عليه</th></tr></thead>
      <tbody>${marked.map(r => `<tr><td>${esc(r.cls)}</td><td class="names">${esc(r.name)}</td><td>${esc(r.what)}</td></tr>`).join('')}</tbody></table>` : ''}
    <footer class="pr-f"><div>مسؤول شؤون الطلبة<div class="line"></div></div><div>التوقيع<div class="line"></div></div>
      <div class="pr-printed">طُبعت من سجل الإشراف في ${esc(fmtDay(today(), {day:'numeric', month:'long', year:'numeric'}))} ${esc(fmtTime(Date.now()))} · ${esc(personName(S.uid))}</div></footer>
  </div>`;
}
function printAbsence(){
  const day = S.sheet && S.sheet.day, sent = day ? absSent(day) : [];
  if (!sent.length) return toast('لا يوجد غياب معتمد لهذا اليوم.', {bad:true});
  const root = $('#print-root');
  root.innerHTML = absPrintHtml(day, sent);
  document.body.classList.add('printing');
  // الطباعة مرة واحدة بعد تحميل الشعار
  let done = false;
  const img = root.querySelector('img'), go = () => { if (done) return; done = true; setTimeout(() => { try { window.print(); } catch(e) {} }, 60); };
  if (img && !img.complete) { img.onload = img.onerror = go; setTimeout(go, 1500); } else go();
}
window.addEventListener('afterprint', () => document.body.classList.remove('printing'));
function openPassword(){
  openSheet('pw', 'تغيير كلمة السر', `<div class="form">${pwField('pw-new', 'كلمة السر الجديدة (8 أحرف على الأقل)', 'new-password')}${pwField('pw-again', 'أعد كتابتها', 'new-password')}<p class="err" id="pw-err" hidden></p></div>`,
    `<button class="btn primary block" data-act="pw-save">حفظ كلمة السر</button>`);
}
async function savePassword(){
  const a = $('#pw-new').value, b = $('#pw-again').value, err = $('#pw-err'), fail = m => { err.textContent = m; err.hidden = false; };
  if (a.length < 8) return fail(ERR.weak_password);
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
    case 'go-log': S.f.log = {type:el.dataset.type || 'all', status:el.dataset.status || 'all', period:el.dataset.period || 'all', cls:el.dataset.cls || 'all', q:'', limit:120}; go('log'); break;
    case 'abs-open': openAbsence(); break;
    case 'abs-cls': ABS.open = ABS.open === el.dataset.cls ? null : el.dataset.cls; renderAbsence(); break;
    case 'abs-stu': absToggle(el.dataset.cls, id); break;
    case 'abs-mode': if (ABS && (MARKS[el.dataset.m] || el.dataset.m === 'absent')) { ABS.mode = el.dataset.m; renderAbsence(); } break;
    case 'abs-none': ABS.picks[el.dataset.cls].clear(); queueAbsSave(el.dataset.cls, true); renderAbsence(); break;
    case 'abs-send': absSend(); break;
    case 'abs-unsend': absUnsend(); break;
    case 'open-absence': openAbsenceView(el.dataset.day); break;
    case 'abs-day': { const d = +el.dataset.d; absGo(d === 0 ? today() : shiftSchoolDay(S.sheet.day, d)); break; }
    case 'abs-print': printAbsence(); break;
    case 'sf-wing': { S.sheet.wing = el.dataset.w ? +el.dataset.w : null; $$('#sf-wing [data-act="sf-wing"]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); break; }
    case 'wing-open': openWing(+id); break;
    case 'wg-sup': { const set = S.sheet.sups; if (set.has(id)) set.delete(id); else set.add(id); renderWingChips(); break; }
    case 'wg-cls': { const c = el.dataset.c, l = S.sheet.classes, i = l.indexOf(c); if (i >= 0) l.splice(i, 1); else l.push(c); renderWingChips(); break; }
    case 'wg-cls-add': { const inp = $('#wg-cls-new'), c = normCls(inp.value); if (!c) break; if (!S.sheet.classes.includes(c)) S.sheet.classes.push(c); S.sheet.extra.add(c); inp.value = ''; renderWingChips(); break; }
    case 'wing-save': saveWing(+id); break;
    case 'back': go(S.params.from || 'students'); break;
    case 'open-action': openAction(id); break;
    case 'open-student': { const from = S.view === 'student' ? (S.params.from || 'students') : S.view; go('student', {id, from}); break; }
    case 'record': openRecord({studentId: el.dataset.student || ''}); break;
    case 'close-sheet': closeSheet(); break;
    case 'quick': moveStatus(id, el.dataset.to); break;
    case 'move': moveStatus(id, el.dataset.to, ($('#ad-note') || {}).value); break;
    case 'resched': resched(id); break;
    case 'contact': markContact(id, true); break;
    case 'contact-quick': markContact(id, true, true); break;
    case 'uncontact': markContact(id, false); break;
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
    case 'pref': {
      const k = el.dataset.k, on = !prefs()[k];
      setPrefs({[k]: on});
      if (k === 'sound' && on) chime();
      // تشغيل الإشعارات يفعّلها على هذا الجهاز أيضاً (داخل نفس اللمسة، كما يشترط الآيفون)
      if (k === 'notify' && on && PUSH.state === 'off') pushEnable();
      break;
    }
    case 'push-on': pushEnable(); break;
    case 'push-off': pushDisable(); break;
    case 'push-test': pushTest(); break;
    case 'push-hint-off': pushHintLater(); update(); break;
    case 'pref-type': { const t = Object.assign({}, prefs().types); t[el.dataset.t] = !t[el.dataset.t]; setPrefs({types:t}); break; }
    case 'markread': S.seenMark = Date.now(); setPrefs({lastSeen:Date.now()}); break;
    case 'more-log': S.f.log.limit += 120; update(); break;
    case 'more-stu': S.f.stu.limit += 150; update(); break;
    case 'copy': copyText(el.dataset.text, el); break;
    case 'reload': S.fatal = ''; reload(); break;
    case 'retry-boot': S.authState = 'checking'; setGate(); boot(); break;
    // الخروج يوقف إشعارات هذا الجهاز أولاً، حتى لا تصل إشعاراتك لمن يستخدمه بعدك
    case 'signout': pushDisable(true).finally(() => API.signOut().catch(() => {}).finally(() => { teardown(); S.authState = 'out'; setGate(); })); break;
    case 'pw-toggle': { const i = document.getElementById(el.dataset.for); if (i) { const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.textContent = show ? 'إخفاء' : 'إظهار'; } break; }
    case 'pw-open': openPassword(); break;
    case 'deleted-open': openDeleted(); break;
    case 'pw-save': savePassword(); break;
    case 'su-role': S.setupRole = el.dataset.r; pickRole('su-role', S.setupRole); break;
    case 'staff-new': openStaffNew(); break;
    case 'staff-create': createStaff(); break;
    case 'staff-open': openStaff(id); break;
    case 'staff-save': saveStaff(id); break;
    case 'staff-active': setStaffActive(id, el.dataset.v === '1'); break;
    case 'staff-pw': resetStaffPassword(id); break;
    case 'sf-role': { S.sheet.role = el.dataset.r; pickRole('sf-role', S.sheet.role); const f = $('#sf-wing-field'); if (f) f.hidden = S.sheet.role !== 'supervisor'; break; }
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
  else if (el.id === 'abs-date') absGo(el.value);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.sheet) closeSheet(); });


/* ===== التشغيل ===== */
function teardown(){
  if (S.unsub) { S.unsub(); S.unsub = null; }
  S.uid = null; S.loaded = false; S.staff = {}; S.students = {}; S.actions = {}; S.absence = {}; S.wings = {}; S.prefsDoc = null; S.orphan = {}; ABS = null;
  S.fatal = ''; S.view = 'home'; S.params = {}; S.ver++; PUSH.busy = false;
}
async function enter(uid){
  S.uid = uid; S.authState = 'in'; S.loadAt = Date.now(); setGate();
  try { await loadData(); } catch(e) { S.fatal = errText(e); }
  if (!S.unsub && S.loaded) S.unsub = API.subscribe(RT);
  setGate();
  // فُتح الموقع من إشعار: افتح ما يخصه. ثم تحقق من إشعارات هذا الجهاز
  if (S.loaded) { takeOpen(); pushInit(); }
}
async function boot(){
  if (!S.booted) {
    S.booted = true;
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (API.configured) API.onAuth(ev => { if (ev === 'SIGNED_OUT' && S.authState === 'in') { teardown(); S.authState = 'out'; setGate(); } });
  }
  if (!API.configured) { setGate(); return; }
  setGate();
  try {
    const s = await API.session();
    if (s && s.user) return enter(s.user.id);
    // لا جلسة صالحة الآن، لكن هناك جلسة محفوظة: غالباً الإنترنت مقطوع، فلا نطلب الدخول من جديد
    if (API.hasStoredSession()) { S.authState = 'offline'; setGate(); return; }
    S.authState = (await API.setupNeeded()) ? 'setup' : 'out';
  } catch(e) {
    if (API.hasStoredSession()) S.authState = 'offline';
    else { S.authState = 'out'; S.fatal = errText(e); }
  }
  setGate();
}
boot();

