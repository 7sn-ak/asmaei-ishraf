'use strict';
// النواة: ثوابت المدرسة، أدوات مساعدة، الحالة، تحميل البيانات، الإشعارات، والتنقل بين الشاشات.
document.documentElement.setAttribute('dir', 'rtl');
document.documentElement.setAttribute('lang', 'ar');
// لا يُفتح الموقع داخل إطار موقع آخر (حماية من الخداع بالنقر)
if (window.top !== window.self) { try { window.top.location.replace(window.location.href); } catch(e) {} document.documentElement.innerHTML = ''; throw new Error('framed'); }

/* ===== المدرسة: أنواع الإجراءات والحالات والأدوار ===== */
const TYPES = {
  pledge:  {label:'تعهد',    long:'تعهد خطي',          icon:'pledge'},
  report:  {label:'تقرير',   long:'تقرير',             icon:'report'},
  summon:  {label:'استدعاء', long:'استدعاء ولي الأمر',  icon:'summon'},
  suspend: {label:'فصل',     long:'فصل مؤقت',          icon:'suspend'}
};
const TYPE_KEYS = ['pledge','report','summon','suspend'];
const STATUS = {
  pledge:  {open:{l:'بانتظار التوقيع',tone:'warn'}, signed:{l:'تم التوقيع',tone:'ok'}},
  // التقارير تُحفظ في سجل الطالب فقط (open و reviewed من قيود قديمة)
  report:  {filed:{l:'في سجل الطالب',tone:'mute'}, open:{l:'في سجل الطالب',tone:'mute'}, reviewed:{l:'في سجل الطالب',tone:'mute'}},
  summon:  {scheduled:{l:'موعد قادم',tone:'info'}, attended:{l:'حضر ولي الأمر',tone:'ok'}, absent:{l:'لم يحضر',tone:'bad'}},
  suspend: {pending:{l:'بانتظار الاعتماد',tone:'warn'}, approved:{l:'معتمد',tone:'ok'}, rejected:{l:'مرفوض',tone:'mute'}}
};
const FIRST = {pledge:'open', report:'filed', summon:'scheduled', suspend:'pending'};
const MOVES = {
  pledge:  {open:[['signed','تم توقيع التعهد','ok']], signed:[['open','إلغاء التوقيع','ghost']]},
  report:  {},
  summon:  {scheduled:[['attended','حضر ولي الأمر','ok'],['absent','لم يحضر','bad']], attended:[['scheduled','إرجاع إلى موعد قادم','ghost']], absent:[['scheduled','إرجاع إلى موعد قادم','ghost']]},
  suspend: {pending:[['approved','اعتماد الفصل','ok'],['rejected','رفض الفصل','bad']], approved:[['pending','إلغاء الاعتماد','ghost']], rejected:[['pending','إعادة إلى الاعتماد','ghost']]}
};
// contacted و uncontacted: تسجيل التواصل مع ولي الأمر وإلغاؤه (لا يغيّران حالة القيد)
const MOVE_PAST = {signed:'أكّد توقيع التعهد', reviewed:'راجع التقرير', attended:'سجّل حضور ولي الأمر', absent:'سجّل عدم حضور ولي الأمر', approved:'اعتمد الفصل', rejected:'رفض الفصل', open:'أعاد فتح القيد', scheduled:'أعاد الاستدعاء إلى موعد قادم', pending:'أعاد الفصل إلى الاعتماد', contacted:'تواصل مع ولي الأمر', uncontacted:'ألغى تسجيل التواصل مع ولي الأمر'};
const DONE = {signed:'تم تأكيد التوقيع', reviewed:'تمت مراجعة التقرير', attended:'سُجّل حضور ولي الأمر', absent:'سُجّل عدم حضور ولي الأمر', approved:'اعتُمد الفصل', rejected:'رُفض الفصل', open:'أُعيد فتح القيد', scheduled:'أُعيد إلى موعد قادم', pending:'أُعيد الفصل إلى الاعتماد', contacted:'سُجّل التواصل مع ولي الأمر', uncontacted:'أُلغي تسجيل التواصل'};
const ROLES = {supervisor:'مشرف', head:'المشرف العام', vp:'الوكيل', principal:'المدير', affairs:'شؤون الطلبة'};
const ROLE_KEYS = ['supervisor','head','vp','principal','affairs'];
const ROLE_ORDER = ['principal','vp','head','affairs','supervisor'];
const ROLE_DESC = {
  supervisor:'يسجل الإجراءات والغياب اليومي لفصول جناحه، ويرسل طلب الفصل للاعتماد. تظهر له في الرئيسية فصول جناحه فقط.',
  head:'يسجل الإجراءات، ويعتمد الفصل، ويصحّح أي قيد، ويدير قوائم الطلاب، ويحدد الأجنحة وفصولها ومشرفيها.',
  vp:'يسجل الإجراءات، ويعتمد الفصل، ويصحّح أي قيد، ويدير قوائم الطلاب، ويحدد الأجنحة وفصولها ومشرفيها.',
  principal:'يسجل الإجراءات، ويعتمد الفصل، ويصحّح أي قيد، ويدير قوائم الطلاب، ويحدد الأجنحة وفصولها ومشرفيها.',
  affairs:'يطّلع على الإجراءات ويتواصل مع أولياء الأمور في الاستدعاء والفصل ويسجل «تم التواصل»، ويستقبل الغياب اليومي بعد اعتماده، ويدير قوائم الطلاب. لا يسجل إجراءات.'
};
// تطابق الدوال approver_roles و overseer_roles و manager_roles و recorder_roles و contact_roles في قاعدة البيانات
const APPROVERS = ['principal','vp','head'];   // يعتمدون الفصل
const OVERSEERS = ['principal','vp','head'];   // يحذفون أي قيد ويحددون فصول المشرفين
const MANAGERS = ['principal','vp','head','affairs']; // يديرون قوائم الطلاب
const RECORDERS = ['supervisor','head','vp','principal']; // يسجلون الإجراءات ويغيّرون حالاتها
const CONTACTORS = ['affairs','head','vp','principal'];   // يسجلون التواصل مع ولي الأمر (ومعهم مسؤول الموقع)
const CONTACT_TYPES = ['summon','suspend'];               // الإجراءات التي يُتواصل فيها مع ولي الأمر
const VIOLATIONS = ['التأخر الصباحي','الغياب بدون عذر','الهروب من الحصة','الخروج من المدرسة دون إذن','إثارة الفوضى في الفصل','عدم الالتزام بالزي المدرسي','استخدام الهاتف النقال','ألفاظ غير لائقة','الاعتداء على زميل','مشاجرة','الإساءة لمعلم أو موظف','إتلاف ممتلكات المدرسة','التدخين','الغش في الاختبار'];
const DEFAULT_TYPES = {pledge:true, summon:true, suspend:true};
// أنواع يمكن التنبيه عنها (التقارير لا تُرسل لأحد)
const NOTIFY_TYPES = ['pledge','summon','suspend'];
// لا تظهر لهم التعهدات في الرئيسية
const NO_PLEDGES_HOME = ['head','vp'];

/* ===== أدوات ===== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const AR_DIG = '٠١٢٣٤٥٦٧٨٩', FA_DIG = '۰۱۲۳۴۵۶۷۸۹';
const latinDigits = s => String(s == null ? '' : s).replace(/[٠-٩]/g, d => AR_DIG.indexOf(d)).replace(/[۰-۹]/g, d => FA_DIG.indexOf(d));
const norm = s => latinDigits(s).replace(/[ً-ْٰـ]/g, '').replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').toLowerCase().replace(/\s+/g, ' ').trim();
const normCls = s => latinDigits(s).trim().replace(/\s*[-\\_.|,،]\s*|\s+/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
const clsKey = c => { const m = String(c).match(/^(\d+)\D*(\d+)?/); return m ? [+m[1], +(m[2] || 0)] : [999, 0]; };
const clsCmp = (a, b) => { const x = clsKey(a), y = clsKey(b); return x[0] - y[0] || x[1] - y[1] || String(a).localeCompare(String(b), 'ar'); };
const icon = (n, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const initial = n => (String(n || '').trim().replace(/^(ال)/, '')[0] || '؟');
const code = id => '#' + String(id || '').replace(/-/g, '').slice(-4).toUpperCase();
const phoneDigits = s => latinDigits(s).replace(/\D/g, '');
const waNum = s => { const d = phoneDigits(s); if (d.length === 8) return '965' + d; if (d.startsWith('00')) return d.slice(2); return d; };
const daysTxt = n => n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يوماً`;
const schoolDaysTxt = n => n === 1 ? 'يوم دراسي واحد' : n === 2 ? 'يومان دراسيان' : n <= 10 ? `${n} أيام دراسية` : `${n} يوماً دراسياً`;
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ===== التواريخ (الكويت: الدوام من الأحد إلى الخميس) ===== */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = s => { const p = String(s || '').split('-').map(Number); return new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const isWeekend = s => { const g = parseYmd(s).getDay(); return g === 5 || g === 6; };
const firstSchoolDay = s => { let d = s, guard = 0; while (isWeekend(d) && guard++ < 7) d = addDays(d, 1); return d; };
const nextSchoolDay = () => firstSchoolDay(addDays(today(), 1));
const schoolEnd = (from, n) => { let d = firstSchoolDay(from), c = 1; while (c < n) { d = addDays(d, 1); if (!isWeekend(d)) c++; } return d; };
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return ymd(d); };
const LOC = 'ar-KW-u-nu-latn';
const fmtDay = (s, opt) => { if (!s) return '—'; try { return new Intl.DateTimeFormat(LOC, opt || {weekday:'long', day:'numeric', month:'long'}).format(parseYmd(s)); } catch(e) { return s; } };
const fmtTime = t => { try { return new Intl.DateTimeFormat(LOC, {hour:'numeric', minute:'2-digit'}).format(new Date(t)); } catch(e) { return ''; } };
const fmtHM = hm => { if (!hm) return ''; const p = hm.split(':').map(Number); const d = new Date(); d.setHours(p[0] || 0, p[1] || 0, 0, 0); return fmtTime(d); };
const dayLabel = s => { const t = today(); if (s === t) return 'اليوم'; if (s === addDays(t, -1)) return 'أمس'; if (s === addDays(t, 1)) return 'غداً'; return fmtDay(s); };
// تاريخ مختصر للصفوف الضيقة: اسم اليوم خلال الأسبوع القادم، وإلا اليوم/الشهر
const shortDay = s => { const t = today(); if (!s) return '—'; if (s === t || s === addDays(t, -1) || s === addDays(t, 1)) return dayLabel(s); if (s > t && s <= addDays(t, 6)) return fmtDay(s, {weekday:'long'}); return fmtDay(s, {day:'numeric', month:'numeric'}); };
const rel = t => { if (!t) return ''; const s = (Date.now() - t) / 1000; if (s < 60) return 'الآن'; if (s < 3600) return `قبل ${Math.floor(s / 60)} د`; if (s < 86400 && ymd(new Date(t)) === today()) return fmtTime(t); const d = ymd(new Date(t)); return d === addDays(today(), -1) ? 'أمس' : fmtDay(d, {day:'numeric', month:'short'}); };

/* ===== الحالة ===== */
const S = {
  authState:'checking', uid:null, staff:{}, students:{}, actions:{}, absence:{}, wings:{}, prefsDoc:null, orphan:{},
  loaded:false, fatal:'', offline:!navigator.onLine, loadAt:Date.now(), ver:0, rtDown:false, hiddenAt:0,
  view:'home', params:{}, gate:null, sheet:null, unsub:null,
  f:{ log:{type:'all', status:'all', period:'week', cls:'all', q:'', limit:120},
      stu:{cls:'all', q:'', sort:'name', limit:150} },
  seenMark:0, audio:null, prefsQ:Promise.resolve()
};

let memo = {ver:-1};
function M(){
  if (memo.ver === S.ver) return memo;
  const list = Object.values(S.actions).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const byStu = {};
  for (const a of list) (byStu[a.studentId] || (byStu[a.studentId] = [])).push(a);
  const students = Object.values(S.students).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
  const classes = Array.from(new Set(students.map(s => s.cls).filter(Boolean))).sort(clsCmp);
  const demo = {students:students.filter(s => isDemo(s.id)).length, actions:list.filter(a => isDemo(a.id)).length};
  memo = {ver:S.ver, list, byStu, students, classes, demo, ev:null};
  return memo;
}
// البيانات التجريبية: معرّفاتها تبدأ بهذه البادئة (supabase/seed_demo.sql)، وتُحذف بـ supabase/clear_demo.sql
const DEMO_PREFIX = 'dd000000-';
const isDemo = id => String(id || '').startsWith(DEMO_PREFIX);

/* ===== الأشخاص والأدوار ===== */
const me = () => S.staff[S.uid] || null;
const myRole = () => (me() && me().role) || '';
const isApprover = () => APPROVERS.includes(myRole());
const canAdmin = () => !!(me() && me().isAdmin);
const isManager = () => MANAGERS.includes(myRole()) || canAdmin();
const canRecord = () => RECORDERS.includes(myRole());
const canContact = () => CONTACTORS.includes(myRole()) || canAdmin();
// شؤون الطلبة: عملهم في السجل التواصل مع أولياء الأمور
const contactDuty = () => myRole() === 'affairs';
const canDelete = a => a.createdBy === S.uid || OVERSEERS.includes(myRole()) || canAdmin();
// الأجنحة: لكل جناح فصوله، والمشرف في جناح واحد. تحددها الإدارة من «المزيد» ← الأجنحة.
const wingList = () => Object.values(S.wings).sort((a, b) => a.sort - b.sort || a.id - b.id);
const wingOf = st => (st && st.wingId && S.wings[st.wingId]) || null;
const shortWing = w => String((w && w.name) || '').replace(/^جناح\s+/, '');
const wingOfClass = c => wingList().find(w => w.classes.includes(c)) || null;
const supsOf = id => Object.values(S.staff).filter(s => s.role === 'supervisor' && s.wingId === id).sort((a, b) => (b.active - a.active) || String(a.name).localeCompare(String(b.name), 'ar'));
const canWings = () => OVERSEERS.includes(myRole()) || canAdmin();
// جناح المشرف وفصوله (غير المشرف يرى كل الفصول، ومشرف بلا جناح أو جناحه بلا فصول يرى كل الفصول)
const myWing = () => { const m = me(); return m && m.role === 'supervisor' ? wingOf(m) : null; };
const myClasses = () => { const w = myWing(); return w && w.classes.length ? w.classes.slice().sort(clsCmp) : null; };
const inScope = a => { const c = myClasses(); return !c || c.includes(stuCls(a)); };
function prefs(){
  const d = S.prefsDoc || {};
  return {notify:!!d.notify, sound:!!d.sound, lastSeen:d.lastSeen || S.loadAt, types:Object.assign({}, DEFAULT_TYPES, d.types || {})};
}
const personName = id => { const st = S.staff[id]; return st ? st.name : 'زميل سابق'; };
const personTitle = id => { const st = S.staff[id]; return st ? (ROLES[st.role] || '') : ''; };

/* ===== الطلاب والإجراءات ===== */
const stuOf = a => S.students[a.studentId];
const stuName = a => (stuOf(a) && stuOf(a).name) || a.studentName || 'طالب';
const stuCls = a => (stuOf(a) && stuOf(a).cls) || a.cls || '';
const isOpen = a => a.type !== 'report' && a.status === FIRST[a.type];
// مفصول في يوم معيّن: فصل معتمد واليوم ضمن مدته (لا يحضر الطالب إلى المدرسة)
const suspOn = (a, d) => a.type === 'suspend' && a.status === 'approved' && !!a.suspendFrom && !!a.suspendTo && a.suspendFrom <= d && d <= a.suspendTo;
const suspNow = a => suspOn(a, today());
const activeSusp = sid => (M().byStu[sid] || []).find(suspNow);
// رقم يوم الدوام داخل مدة الفصل (اليوم 2 من 3)، و0 في العطلة
const schoolDayNo = (from, d) => { if (!from || isWeekend(d) || d < from) return 0; let n = 0, x = from, g = 0; while (x <= d && g++ < 90) { if (!isWeekend(x)) n++; x = addDays(x, 1); } return n; };
// استدعاء ينتظر حضور ولي الأمر حتى يوم معيّن (اليوم إن لم يُحدَّد): موعده فيه، أو فات ولم يُسجَّل الحضور
const summonDue = (a, d) => a.type === 'summon' && a.status === 'scheduled' && !!a.summonDate && a.summonDate <= (d || today());
const stInfo = a => ((STATUS[a.type] || {})[a.status]) || {l:a.status || '', tone:'mute'};
const pill = a => {
  if (a.type === 'report') return '';
  // الأوضح لليوم: حضور ولي الأمر اليوم، أو فات موعده، أو الطالب مفصول الآن
  if (a.type === 'summon' && a.status === 'scheduled' && a.summonDate && a.summonDate <= today())
    return a.summonDate === today() ? '<span class="pill tone-warn">الحضور اليوم</span>' : '<span class="pill tone-bad">فات الموعد</span>';
  if (suspNow(a)) return '<span class="pill tone-bad">مفصول الآن</span>';
  const s = stInfo(a); return `<span class="pill tone-${s.tone}">${esc(s.l)}</span>`;
};
// تنبيه أعلى القيد وملف الطالب: موعد حضور ولي الأمر، أو مدة الفصل
function timeBanner(a){
  const t = today();
  if (a.type === 'summon' && a.status === 'scheduled' && a.summonDate) {
    const at = a.summonTime ? ' الساعة ' + fmtHM(a.summonTime) : '';
    if (a.summonDate === t) return `<div class="banner warn">${icon('summon')}<div><b>مطلوب حضور ولي الأمر اليوم${esc(at)}</b></div></div>`;
    if (a.summonDate > t) return `<div class="banner">${icon('summon')}<div>موعد حضور ولي الأمر ${esc(dayLabel(a.summonDate))}${esc(at)}</div></div>`;
    return `<div class="banner bad">${icon('alert')}<div><b>فات موعد حضور ولي الأمر (${esc(dayLabel(a.summonDate))})</b><div class="meta">${canRecord() ? 'سجّل «حضر» أو «لم يحضر»، أو غيّر الموعد.' : 'لم يُسجَّل الحضور بعد.'}</div></div></div>`;
  }
  if (a.type === 'suspend' && a.status === 'approved' && a.suspendFrom && a.suspendTo) {
    if (suspNow(a)) { const n = schoolDayNo(a.suspendFrom, t);
      return `<div class="banner bad">${icon('suspend')}<div><b>مفصول الآن حتى ${esc(fmtDay(a.suspendTo))}</b><div class="meta">لا يحضر إلى المدرسة طوال مدة الفصل${n ? ' · اليوم ' + n + ' من ' + (a.suspendDays || n) : ''}.</div></div></div>`; }
    if (a.suspendFrom > t) return `<div class="banner">${icon('suspend')}<div>يبدأ الفصل ${esc(dayLabel(a.suspendFrom))}${a.suspendTo !== a.suspendFrom ? ' وينتهي ' + esc(dayLabel(a.suspendTo)) : ''}.</div></div>`;
  }
  return '';
}
/* التواصل مع ولي الأمر */
// يمكن تسجيله الآن: استدعاء موعده قائم، أو فصل معتمد (قاعدة البيانات تشترط اعتماد الفصل)
const contactOpen = a => (a.type === 'summon' && a.status === 'scheduled') || (a.type === 'suspend' && a.status === 'approved');
// ينتظر التواصل: لم يُسجَّل بعد، وموعد الاستدعاء لم يمضِ أو مدة الفصل لم تنتهِ
const needsContact = a => !a.contactedAt && contactOpen(a) && ((a.type === 'summon' ? a.summonDate : a.suspendTo) || '') >= today();
const contactKey = a => a.type === 'summon' ? (a.summonDate || '') + ' ' + (a.summonTime || '') : (a.suspendFrom || '');
const contactPill = a => a.contactedAt ? '<span class="pill tone-ok">تم التواصل</span>' : needsContact(a) ? '<span class="pill tone-warn">بانتظار التواصل</span>' : '';
// شؤون الطلبة يرون حالة التواصل مكان حالة القيد في الاستدعاء والفصل
const rowPill = a => (contactDuty() && CONTACT_TYPES.includes(a.type) && contactPill(a)) || pill(a);
const tico = (t, sm) => `<span class="tico ty-${t}">${icon(TYPES[t] ? TYPES[t].icon : 'report', sm ? 'sm' : '')}</span>`;
const tchip = t => `<span class="tchip ty-${t}">${esc(TYPES[t] ? TYPES[t].label : '')}</span>`;
function actLine(a){
  const parts = [TYPES[a.type] && TYPES[a.type].label, a.violation].filter(Boolean);
  if (a.type === 'summon' && a.summonDate) parts.push('الموعد ' + dayLabel(a.summonDate) + (a.summonTime ? ' ' + fmtHM(a.summonTime) : ''));
  if (a.type === 'suspend' && a.suspendDays) parts.push(daysTxt(a.suspendDays));
  return parts.join(' · ');
}
// صف القيد: اسم الطالب كاملاً في السطر الأول، والحالة ثم التفاصيل في السطر الثاني، والوقت على الطرف
function actRow(a){
  const cls = stuCls(a);
  return `<button class="row" data-act="open-action" data-id="${esc(a.id)}">${tico(a.type)}
    <span class="main"><span class="t1">${esc(stuName(a))}</span><span class="t2">${rowPill(a)}${esc(actLine(a))}${cls ? ' · ' + esc(cls) : ''}</span></span>
    <span class="when">${esc(rel(a.createdAt))}</span></button>`;
}

/* ===== الأخطاء والحفظ ===== */
const ERR = {
  not_staff:'حسابك غير مفعّل في الطاقم. راجع مسؤول الموقع.',
  not_approver:'يعتمد الفصل المدير أو الوكيل أو المشرف العام.',
  not_allowed:'لا تملك صلاحية هذا الإجراء.',
  not_approved:'يُسجَّل التواصل في الفصل بعد اعتماده.',
  not_contact_type:'التواصل مع ولي الأمر يُسجَّل في الاستدعاء والفصل فقط.',
  already_sent:'أُرسل غياب هذا الفصل. ألغِ الإرسال أولاً للتعديل.',
  student_not_in_class:'أحد الطلاب لم يعد في هذا الفصل. أعد فتح الغياب.',
  bad_day:'لا يمكن تسجيل الغياب لهذا التاريخ.',
  bad_class:'اسم الفصل غير صالح.',
  bad_status:'لا يمكن تغيير حالة هذا القيد.',
  too_fast:'انتظر قليلاً ثم جرّب مرة أخرى.',
  not_supervisor:'الأجنحة للمشرفين فقط.',
  weekend:'الجمعة والسبت عطلة، لا يُسجَّل فيهما غياب.',
  absent_marked:'الطالب مسجّل غائب، فلا يُسجَّل عليه تأخير أو مخالفة.',
  bad_marks:'تعذّر حفظ الورقة. أغلق النافذة وافتحها من جديد.',
  name_taken:'يوجد جناح بهذا الاسم.',
  bad_endpoint:'هذا المتصفح يستخدم خدمة إشعارات غير معروفة، فلا تصله الإشعارات والموقع مغلق.',
  bad_keys:'تعذر تفعيل الإشعارات على هذا الجهاز.',
  forbidden:'هذا الإجراء للمسؤولين فقط.',
  username_taken:'اسم المستخدم مستخدم من قبل. اختر اسماً آخر.',
  bad_username:'اسم المستخدم بالإنجليزي: حروف صغيرة وأرقام ونقطة أو شرطة، من 3 إلى 30.',
  weak_password:'كلمة السر لازم تكون 8 أحرف على الأقل.',
  bad_setup_code:'رمز الإعداد غير صحيح. انسخه كما وصلك من Claude.',
  name_required:'اكتب الاسم.',
  cannot_lock_self:'لا يمكنك إيقاف حسابك أو إزالة صلاحية الإدارة عن نفسك.',
  already_set_up:'تم إعداد الموقع من قبل. سجّل دخولك.',
  student_not_found:'الطالب غير موجود. ربما حُذف.',
  invalid_credentials:'اسم المستخدم أو كلمة السر غير صحيحة.',
  user_banned:'هذا الحساب موقوف. راجع مسؤول الموقع.',
  same_password:'كلمة السر الجديدة مطابقة للقديمة.'
};
function errText(e){
  const c = String((e && e.code) || ''), m = String((e && e.message) || '');
  if (ERR[m]) return ERR[m];
  if (ERR[c]) return ERR[c];
  if (/Invalid login credentials/i.test(m)) return ERR.invalid_credentials;
  if (/banned/i.test(m)) return ERR.user_banned;
  if (c === '42501' || /row-level security|permission denied/i.test(m)) return ERR.not_allowed;
  if (c === 'PGRST301' || /JWT expired|invalid JWT/i.test(m)) return 'انتهت جلستك. سجّل دخولك من جديد.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m) || !navigator.onLine) return 'تعذر الاتصال. تحقق من الإنترنت ثم أعد المحاولة.';
  if (c === 'quota_exceeded' || /quota/i.test(m)) return 'امتلأت مساحة قاعدة البيانات المجانية. راجع مسؤول الموقع.';
  return 'تعذر الحفظ. أعد المحاولة.';
}
async function save(fn, okMsg){
  try { const r = await fn(); if (okMsg) toast(okMsg); return r === undefined ? true : r; }
  catch(e) { console.error(e); toast(errText(e), {bad:true}); return false; }
}
function setPrefs(patch){
  if (!S.uid) return Promise.resolve(false);
  const next = Object.assign(prefs(), patch);
  S.prefsDoc = next; S.ver++; schedule();
  S.prefsQ = S.prefsQ.then(() => API.savePrefs(next, S.uid)).catch(e => { toast(errText(e), {bad:true}); });
  return S.prefsQ;
}

/* ===== تحميل البيانات والتحديث المباشر ===== */
async function loadData(){
  const since = new Date(Date.now() - 400 * 864e5).toISOString();
  const d = await API.loadAll(since, addDays(today(), -30));
  const staff = {}, students = {}, actions = {}, absence = {}, wings = {};
  (d.absence || []).forEach(x => { absence[x.id] = x; });
  (d.wings || []).forEach(w => { wings[w.id] = w; });
  d.staff.forEach(s => { staff[s.id] = s; });
  d.students.forEach(s => { students[s.id] = s; });
  d.actions.forEach(a => { actions[a.id] = a; });
  d.logs.forEach(l => { const a = actions[l.actionId]; if (a) a.log.push(l); });
  Object.values(actions).forEach(a => a.log.sort((x, y) => x.t - y.t || x.id - y.id));
  S.staff = staff; S.students = students; S.actions = actions; S.absence = absence; S.wings = wings; S.prefsDoc = d.prefs;
  S.loaded = true; S.fatal = ''; S.ver++;
}
async function reload(){
  try { await loadData(); } catch(e) { S.fatal = errText(e); }
  setGate();
  // إذا تعذر التحميل أول مرة (مثلاً بلا إنترنت): ما فُتح من إشعار، وحالة إشعارات الجهاز
  if (S.loaded && S.gate === 'in') { takeOpen(); if (PUSH.state === 'checking') pushInit(); }
}
async function refreshAction(id){
  try { const a = await API.getAction(id); if (a) S.actions[id] = a; else delete S.actions[id]; S.ver++; schedule(); } catch(e) {}
}
function bump(){ S.ver++; schedule(); }
const RT = {
  action(ev, row, oldId){
    if (ev === 'DELETE') { delete S.actions[oldId]; return bump(); }
    if (!row) return;
    const prev = S.actions[row.id];
    row.log = prev ? prev.log : (S.orphan[row.id] || []);
    delete S.orphan[row.id];
    S.actions[row.id] = row;
    if (!prev) row.log.forEach(e => maybeAlert(row, e));
    bump();
  },
  log(e){
    const a = S.actions[e.actionId];
    if (!a) { (S.orphan[e.actionId] || (S.orphan[e.actionId] = [])).push(e); return; }
    if (a.log.some(x => x.id === e.id)) return;
    a.log.push(e); a.log.sort((x, y) => x.t - y.t || x.id - y.id);
    maybeAlert(a, e); bump();
  },
  student(ev, row, oldId){ if (ev === 'DELETE') delete S.students[oldId]; else if (row) S.students[row.id] = row; bump(); },
  staff(ev, row, oldId){
    if (ev === 'DELETE') delete S.staff[oldId]; else if (row) S.staff[row.id] = row;
    S.ver++; setGate();
  },
  wing(ev, row, oldId){
    if (ev === 'DELETE') delete S.wings[oldId]; else if (row) S.wings[row.id] = row;
    S.ver++; setGate();
  },
  absence(ev, row, oldId){
    if (ev === 'DELETE') { delete S.absence[oldId]; return bump(); }
    if (!row) return;
    const prev = S.absence[row.id];
    S.absence[row.id] = row;
    if (row.status === 'sent' && (!prev || prev.status !== 'sent')) absAlert(row);
    bump();
  },
  status(st){
    if (st === 'SUBSCRIBED') { if (S.rtDown) { S.rtDown = false; reload(); } }
    else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') S.rtDown = true;
  }
};

/* ===== الإشعارات ===== */
function relevant(a, e){
  if (!e || !e.by || e.by === S.uid) return false;
  const role = myRole();
  if (a.createdBy === S.uid) return true;
  // شؤون الطلبة: كل استدعاء جديد أو موعد جديد، وكل فصل يُعتمد، لأنها تحتاج تواصلاً مع ولي الأمر
  if (contactDuty() && ((a.type === 'summon' && (e.ev === 'created' || e.ev === 'resched')) || (a.type === 'suspend' && e.to === 'approved'))) return true;
  if (e.ev === 'created') {
    if (a.type === 'report') return false;
    if (a.type === 'suspend' && APPROVERS.includes(role)) return true;
    return !!prefs().types[a.type] && inScope(a);
  }
  return false;
}
function maybeAlert(a, e){
  if (!S.loaded || !relevant(a, e) || Date.now() - e.t > 120000) return;
  if (prefs().notify) alertEv({a, e});
}
function events(){
  const m = M();
  if (m.ev) return m.ev;
  const out = [];
  for (const a of m.list) for (const e of a.log) if (relevant(a, e)) out.push({a, e});
  if (contactDuty()) out.push.apply(out, absEvents());
  out.sort((x, y) => (y.e.t || 0) - (x.e.t || 0));
  m.ev = out.slice(0, 100);
  return m.ev;
}
const unread = () => { const ls = prefs().lastSeen || 0; return events().filter(x => (x.e.t || 0) > ls).length; };
function evText(x){
  if (x.abs) return {t1:`وصل غياب ${dayLabel(x.abs.day)}: ${dailyTxt(x.abs.sheets)} في ${x.abs.sheets.length} ${x.abs.sheets.length === 1 ? 'فصل' : 'فصول'}`,
    t2:'اعتمده ' + personName(x.e.by) + ' · ' + x.abs.sheets.map(s => s.cls).sort(clsCmp).join('، ')};
  const a = x.a, e = x.e, who = personName(e.by), n = stuName(a);
  if (e.ev === 'created') {
    let t1;
    if (a.type === 'suspend') t1 = e.to === 'pending' ? `طلب فصل ${n} بانتظار الاعتماد` : `فصل ${n}`;
    else if (a.type === 'summon') t1 = `استدعاء ولي أمر ${n}`;
    else if (a.type === 'report') t1 = `تقرير جديد عن ${n}`;
    else t1 = `تعهد جديد على ${n}`;
    return {t1, t2:'سجّله ' + who};
  }
  if (e.ev === 'resched') return {t1:`موعد جديد لاستدعاء ولي أمر ${n}`, t2:'غيّره ' + who};
  if (e.to === 'contacted') return {t1:`${who} تواصل مع ولي أمر ${n}`, t2:e.note || TYPES[a.type].label};
  if (e.to === 'uncontacted') return {t1:`${who} ألغى تسجيل التواصل مع ولي أمر ${n}`, t2:TYPES[a.type].label};
  return {t1:`${who} ${MOVE_PAST[e.to] || 'حدّث القيد'}: ${n}`, t2:e.note || TYPES[a.type].label};
}
function toast(msg, o){
  o = o || {};
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast' + (o.bad ? ' bad' : '');
  el.setAttribute('role', o.bad ? 'alert' : 'status');
  el.innerHTML = `<div class="main"><div class="tt"></div>${o.sub ? '<div class="ts"></div>' : ''}</div>${o.btn ? '<button type="button"></button>' : ''}`;
  el.querySelector('.tt').textContent = msg;
  if (o.sub) el.querySelector('.ts').textContent = o.sub;
  if (o.btn) { const b = el.querySelector('button'); b.textContent = o.btn; b.addEventListener('click', () => { el.remove(); if (o.onBtn) o.onBtn(); }); }
  // لمسة على التنبيه تخفيه، حتى لا يغطي زر الإغلاق أعلى النافذة
  el.addEventListener('click', e => { if (!e.target.closest('button')) el.remove(); });
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => el.remove(), o.ms || (o.bad ? 7000 : 3800));
}
function alertEv(x){
  const t = evText(x);
  toast(t.t1, {sub:t.t2, btn:'فتح', ms:7000, onBtn:() => x.abs ? openAbsenceView(x.abs.day) : openAction(x.a.id)});
  try { if (navigator.vibrate) navigator.vibrate([70, 50, 70]); } catch(e) {}
  if (prefs().sound) chime();
}
function chime(){
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ac = S.audio || (S.audio = new C());
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime + 0.02;
    [[784, 0], [1046.5, 0.14]].forEach(p => {
      const os = ac.createOscillator(), g = ac.createGain();
      os.type = 'sine'; os.frequency.value = p[0];
      g.gain.setValueAtTime(0.0001, t0 + p[1]);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + p[1] + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + p[1] + 0.4);
      os.connect(g); g.connect(ac.destination); os.start(t0 + p[1]); os.stop(t0 + p[1] + 0.45);
    });
  } catch(e) {}
}
document.addEventListener('pointerdown', () => {
  if (prefs().sound && !S.audio) { try { const C = window.AudioContext || window.webkitAudioContext; if (C) { S.audio = new C(); S.audio.resume(); } } catch(e) {} }
}, {passive:true});

/* ===== الغياب اليومي ===== */
const absList = () => Object.values(S.absence);
const absSheet = (day, cls) => absList().find(x => x.day === day && x.cls === cls);
const absCount = sheets => sheets.reduce((n, x) => n + x.absent.length, 0);
// ما يُسجَّل مع الغياب في ورقة الفصل: التأخير الصباحي ومخالفات الزي والشعر. الأنواع نفسها في private.mark_kinds()
// في قاعدة البيانات؛ لإضافة نوع أضفه هنا وهناك.
const MARKS = {
  late:{l:'متأخر', mode:'التأخير', g:'التأخير الصباحي'},
  uniform:{l:'الزي', mode:'الزي', g:'مخالفة الزي'},
  hair:{l:'الشعر', mode:'الشعر', g:'مخالفة الشعر'}
};
const MARK_KEYS = Object.keys(MARKS), VIOL_KEYS = MARK_KEYS.filter(k => k !== 'late');
const marksOf = (x, k) => (x && x.marks && Array.isArray(x.marks[k])) ? x.marks[k] : [];
const lateCount = sheets => sheets.reduce((n, x) => n + marksOf(x, 'late').length, 0);
const violCount = sheets => sheets.reduce((n, x) => n + VIOL_KEYS.reduce((m, k) => m + marksOf(x, k).length, 0), 0);
const violTxt = n => n + (n >= 2 && n <= 10 ? ' مخالفات' : ' مخالفة');
// «3 غائب · 2 متأخر · 1 مخالفة»: التأخير والمخالفات إن وُجدت
const countsTxt = (a, l, v) => [a + ' غائب', l ? l + ' متأخر' : '', v ? violTxt(v) : ''].filter(Boolean).join(' · ');
const dailyTxt = sheets => countsTxt(absCount(sheets), lateCount(sheets), violCount(sheets));
const mkTag = k => k === 'absent' ? '<span class="mk mk-absent">غائب</span>' : `<span class="mk mk-${k}">${esc(MARKS[k].l)}</span>`;
// طلاب الورقة مع ما سُجّل على كل واحد: الغائبون أولاً، ثم المتأخرون، ثم المخالفات
function sheetPeople(x){
  const by = new Map(), add = (a, k) => { const p = by.get(a.id) || {id:a.id, name:a.name, kinds:[]}; p.kinds.push(k); by.set(a.id, p); };
  x.absent.forEach(a => add(a, 'absent'));
  MARK_KEYS.forEach(k => marksOf(x, k).forEach(a => add(a, k)));
  const rank = p => p.kinds.includes('absent') ? 0 : p.kinds.includes('late') ? 1 : 2;
  return Array.from(by.values()).sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name), 'ar'));
}
// سطر لكل طالب: الغائب باسمه، والمتأخر وصاحب المخالفة مع ما سُجّل عليه
const peopleLines = (x, empty) => { const ps = sheetPeople(x);
  return ps.length ? ps.map(p => `<span class="nl">${esc(p.name)}${p.kinds.filter(k => k !== 'absent').map(k => ' ' + mkTag(k)).join('')}</span>`).join('') : esc(empty); };
// أسماء الغائبين تحت بعض: سطر لكل اسم
const nameLines = (list, empty) => list.length ? list.map(a => `<span class="nl">${esc(a.name)}</span>`).join('') : esc(empty);
const rosterOf = cls => M().students.filter(s => s.cls === cls);
// إشعارات شؤون الطلبة: ما أرسله كل مشرف في يوم واحد يُجمع في إشعار واحد
function absEvents(){
  const groups = {};
  for (const x of absList()) if (x.status === 'sent' && x.sentAt) {
    const k = x.day + '|' + x.sentBy, g = groups[k] || (groups[k] = {day:x.day, by:x.sentBy, t:0, sheets:[]});
    g.sheets.push(x); g.t = Math.max(g.t, x.sentAt);
  }
  return Object.values(groups).map(g => ({abs:g, e:{t:g.t, by:g.by, ev:'absence'}}));
}
let absBuf = [], absTimer = null;
function absAlert(row){
  if (!S.loaded || !contactDuty() || Date.now() - (row.sentAt || 0) > 120000) return;
  absBuf.push(row); clearTimeout(absTimer);
  absTimer = setTimeout(() => {
    const rows = absBuf; absBuf = [];
    if (!prefs().notify || !rows.length) return;
    alertEv({abs:{day:rows[0].day, by:rows[0].sentBy, sheets:rows}, e:{t:Date.now(), by:rows[0].sentBy}});
  }, 1200);
}

/* ===== الشاشات ===== */
let pendingFrame = false;
function schedule(){
  if (pendingFrame) return;
  pendingFrame = true;
  const fire = () => { if (!pendingFrame) return; pendingFrame = false; update(); };
  requestAnimationFrame(fire);
  setTimeout(fire, 250);
}
function gateState(){
  if (!API.configured) return 'config';
  if (S.authState === 'checking') return 'loading';
  if (S.authState === 'offline') return 'offline';
  if (S.authState === 'setup') return 'setup';
  if (S.authState === 'out') return 'login';
  if (!S.loaded) return S.fatal ? 'fatal' : 'loading';
  const m = me();
  if (!m || !m.active) return 'inactive';
  return 'in';
}
function setGate(){
  const g = gateState();
  if (g !== S.gate) { S.gate = g; mount(); return; }
  schedule();
}
function mount(){
  const g = S.gate, view = $('#view');
  $('#nav').hidden = g !== 'in';
  $('#bellBtn').hidden = g !== 'in';
  view.classList.toggle('bare', g !== 'in');
  if (g === 'in') { const V = VIEWS[S.view] || VIEWS.home; view.innerHTML = ''; V.mount(view); V.update(view); }
  else { closeSheet(); (GATES[g] || GATES.loading)(view); }
  markNav(); syncNav(); refreshBadge();
}
function update(){
  if (S.gate === 'in') { const V = VIEWS[S.view] || VIEWS.home; V.update($('#view')); refreshSheet(); }
  syncNav(); refreshBadge();
}
// زر «تسجيل» لمن يسجل الإجراءات فقط (يتحدث فوراً إذا غيّر مسؤول الموقع الدور)
function syncNav(){
  const rec = S.gate === 'in' && canRecord(), nav = $('#nav');
  nav.classList.toggle('no-rec', !rec);
  $('.rec', nav).hidden = !rec;
}
function markNav(){
  const cur = S.view === 'student' ? ({log:'log', home:'home'}[S.params.from] || 'students') : S.view;
  $$('#nav [data-tab]').forEach(b => { if (b.dataset.tab === cur) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}
function refreshBadge(){
  const b = $('#bellBadge'), btn = $('#bellBtn');
  if (S.gate !== 'in') { b.hidden = true; return; }
  const n = unread();
  b.hidden = !n; b.textContent = n > 99 ? '99+' : String(n);
  btn.setAttribute('aria-label', n ? `الإشعارات، ${n} غير مقروءة` : 'الإشعارات');
}
function go(v, params){
  S.view = v; S.params = params || {};
  closeSheet();
  if (v === 'inbox') { S.seenMark = prefs().lastSeen; if (unread() > 0) setPrefs({lastSeen:Date.now()}); pushClearShown(); }
  window.scrollTo(0, 0);
  mount();
}
window.addEventListener('online', () => {
  S.offline = false;
  // رجع الاتصال: افتح السجل تلقائياً إذا كان متوقفاً بسببه
  if (S.authState === 'offline') boot();
  else if (S.gate === 'fatal') reload();
  else schedule();
});
window.addEventListener('offline', () => { S.offline = true; schedule(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { S.hiddenAt = Date.now(); return; }
  if (S.gate === 'in' && S.hiddenAt && Date.now() - S.hiddenAt > 60000) reload();
});
setInterval(() => { if (S.gate === 'in' && !document.hidden) schedule(); }, 60000);
