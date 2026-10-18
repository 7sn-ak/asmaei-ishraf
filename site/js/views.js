'use strict';
// الشاشات الرئيسية: الرئيسية، السجل، الطلاب، ملف الطالب، الإشعارات، المزيد.
/* ===== Shared fragments ===== */
function topBanner(){
  if (S.offline) return `<div class="banner warn">${icon('info')}<div>لا يوجد اتصال بالإنترنت. تظهر آخر بيانات محمّلة، ولن تُحفظ الإضافات حتى يرجع الاتصال.</div></div>`;
  if (S.fatal) return `<div class="banner bad">${icon('alert')}<div>${esc(S.fatal)} <button class="link" data-act="reload">إعادة المحاولة</button></div></div>`;
  return '';
}
function demoBanner(){
  const d = M().demo;
  if (!d.students && !d.actions) return '';
  return `<div class="banner">${icon('info')}<div>في السجل بيانات تجريبية لتجربة الموقع (طلاب: <span class="num">${d.students}</span> · إجراءات: <span class="num">${d.actions}</span>). الأسماء والأرقام وهمية، وتنحذف كلها قبل التشغيل الفعلي.</div></div>`;
}
function onboarding(){
  const m = M();
  if (!S.loaded || m.students.length || m.list.length) return '';
  const mg = isManager();
  return `<div class="empty"><h3>ابدأ بتجهيز السجل</h3>
    <ol class="steps">
      <li>أضف قوائم الطلاب، أو انسخها من ملف إكسل والصقها دفعة واحدة.</li>
      <li>${canRecord() ? 'سجّل أول إجراء من زر «تسجيل» أسفل الشاشة.' : 'تظهر لك الاستدعاءات والفصل هنا بعد أن يسجلها المشرفون، لتتواصل مع أولياء الأمور.'}</li>
      <li>${canAdmin() ? 'أنشئ حسابات الطاقم من «المزيد»، وأعطِ كل زميل اسم المستخدم وكلمة السر.' : 'ثبّت الموقع على شاشة جوالك من «المزيد» ليفتح مثل التطبيق.'}</li>
    </ol>
    ${mg ? `<div class="btns"><button class="btn primary" data-act="stu-import">${icon('upload','sm')}استيراد من إكسل</button><button class="btn ghost" data-act="stu-add">${icon('userplus','sm')}إضافة طالب</button></div>`
         : `<p>تضيف شؤون الطلبة أو الإدارة قوائم الطلاب، ويمكنك إضافة طالب أثناء تسجيل الإجراء.</p>`}
  </div>`;
}
// صف «يحتاج متابعة»: الاسم والتفاصيل كاملة، وأزرار الإجراء السريع تحتها
function quickRow(a, moves, sub){
  const acts = moves && canRecord();
  return `<div class="row${acts ? ' stacked' : ''}"><button class="main" data-act="open-action" data-id="${esc(a.id)}"><span class="t1 wrap">${esc(stuName(a))}</span><span class="t2 wrap">${esc(sub)}</span></button>
    ${acts ? `<div class="row-acts">${moves.map(mv => `<button class="btn sm ${mv[2]}" data-act="quick" data-id="${esc(a.id)}" data-to="${mv[0]}">${esc(mv[1])}</button>`).join('')}</div>` : pill(a)}</div>`;
}
// «فصولي» في السجل للمشرف الذي حُددت له فصول جناحه، وإلا كل الفصول
const scopeCls = () => myClasses() ? 'mine' : 'all';
function grp(title, n, type, tone){
  return `<div class="grp${tone ? ' ' + tone : ''}">${esc(title)} <span class="num">· ${n}</span>${type ? `<button class="link" data-act="go-log" data-type="${type}" data-status="open" data-period="all" data-cls="${scopeCls()}">عرض الكل</button>` : ''}</div>`;
}
// صف «تواصل مطلوب»: اتصال مباشر بولي الأمر ثم «تم التواصل»
function contactRow(a){
  const t = today(), s = stuOf(a), phone = s && s.phone;
  const sub = a.type === 'summon'
    ? `استدعاء · ${shortDay(a.summonDate)}${a.summonTime ? ' ' + fmtHM(a.summonTime) : ''}`
    : `فصل ${daysTxt(a.suspendDays || 1)} · ${a.suspendFrom <= t ? 'حتى ' + shortDay(a.suspendTo) : 'يبدأ ' + shortDay(a.suspendFrom)}`;
  return `<div class="row stacked"><button class="main" data-act="open-action" data-id="${esc(a.id)}"><span class="t1 wrap">${esc(stuName(a))}</span><span class="t2 wrap">${esc(sub + ' · ' + stuCls(a))}</span></button>
    <div class="row-acts"><button class="btn sm ok" data-act="contact-quick" data-id="${esc(a.id)}">${icon('check','sm')}تم التواصل</button>
    ${phone ? `<a class="btn sm ghost" href="tel:${esc(phoneDigits(phone))}" aria-label="اتصال بولي أمر ${esc(stuName(a))}">${icon('summon','sm')}اتصال</a>` : '<span class="meta">لا يوجد رقم</span>'}</div></div>`;
}
function contactAttention(){
  const due = M().list.filter(needsContact).sort((a, b) => contactKey(a).localeCompare(contactKey(b)));
  return `<div class="sec-h"><h2>بانتظار التواصل مع ولي الأمر</h2>${due.length ? `<span class="count num">${due.length}</span>` : ''}
      ${due.length > 8 ? '<button class="link" data-act="go-log" data-status="contact" data-period="all">عرض الكل</button>' : ''}</div>
    <div class="list">${due.length ? due.slice(0, 8).map(contactRow).join('') : '<p class="calm">لا يوجد تواصل مطلوب الآن.</p>'}</div>` +
    (due.length ? '<p class="meta">اتصل بولي الأمر، ثم اضغط «تم التواصل». تفاصيل الإجراء تظهر بالضغط على اسم الطالب.</p>' : '');
}
function attention(){
  if (contactDuty()) return contactAttention();
  const role = myRole(), list = M().list.filter(inScope);
  const pend = list.filter(a => a.type==='suspend' && a.status==='pending');
  // التقارير تُحفظ في سجل الطالب فقط، والتعهدات لا تظهر للمشرف العام والوكيل
  const pledges = NO_PLEDGES_HOME.includes(role) ? [] : list.filter(a => a.type==='pledge' && a.status==='open');
  let html = '', total = 0;
  if (pend.length) {
    total += pend.length;
    html += grp('فصل بانتظار الاعتماد', pend.length, pend.length > 4 && 'suspend');
    html += pend.slice(0,4).map(a => quickRow(a, isApprover() ? [['approved','اعتماد','ok'],['rejected','رفض','bad']] : null,
      `${daysTxt(a.suspendDays||1)} · يبدأ ${shortDay(a.suspendFrom)} · ${stuCls(a)}`)).join('');
  }
  if (pledges.length) {
    total += pledges.length;
    html += grp('تعهدات بانتظار التوقيع', pledges.length, pledges.length > 3 && 'pledge');
    html += pledges.slice(0,3).map(a => quickRow(a, [['signed','تم التوقيع','ok']], (a.violation||'') + ' · ' + stuCls(a))).join('');
  }
  return `<div class="sec-h"><h2>يحتاج متابعة</h2>${total ? `<span class="count num">${total}</span>` : ''}</div>` +
    (total ? `<div class="list">${html}</div>` : `<div class="list"><p class="calm">لا يوجد ما يحتاج متابعة الآن.</p></div>`);
}

/* «اليوم» في الرئيسية (المشرف والمشرف العام والوكيل والمدير): من لا يحضر إلى المدرسة لأنه مفصول،
   ومن يجب أن يحضر ولي أمره. المشرف يرى طلاب جناحه فقط. في عطلة الجمعة والسبت تعرض يوم الدوام القادم. */
function todayCard(){
  if (!canRecord()) return '';
  const t = today(), d = firstSchoolDay(t), dl = d === t ? 'اليوم' : shortDay(d), next = firstSchoolDay(addDays(d, 1));
  const list = M().list.filter(inScope), seen = new Set(), uniq = a => !seen.has(a.studentId) && seen.add(a.studentId);
  const byEnd = (a, b) => a.suspendTo.localeCompare(b.suspendTo) || clsCmp(stuCls(a), stuCls(b)) || stuName(a).localeCompare(stuName(b), 'ar');
  const susp = list.filter(a => suspOn(a, d)).sort(byEnd).filter(uniq);
  const soon = list.filter(a => a.type === 'suspend' && a.status === 'approved' && a.suspendFrom === next).sort(byEnd).filter(uniq);
  const when = a => (a.summonDate || '') + ' ' + (a.summonTime || '');
  const due = list.filter(a => summonDue(a, d)).sort((a, b) => when(a).localeCompare(when(b)));
  const sums = due.filter(a => a.summonDate >= t), late = due.filter(a => a.summonDate < t);
  const sRow = (a, sub) => `<button class="row" data-act="open-action" data-id="${esc(a.id)}">${tico('suspend')}
    <span class="main"><span class="t1 wrap">${esc(stuName(a))}</span><span class="t2 wrap">${esc(sub)}</span></span></button>`;
  const came = [['attended','حضر','ok'],['absent','لم يحضر','bad']];
  let html = '';
  if (susp.length) html += grp('مفصولون: لا يحضرون إلى المدرسة', susp.length, null, 'bad') +
    susp.map(a => { const n = schoolDayNo(a.suspendFrom, d);
      return sRow(a, `${stuCls(a)} · حتى ${shortDay(a.suspendTo)}${n ? ' · اليوم ' + n + ' من ' + (a.suspendDays || n) : ''}`); }).join('');
  if (soon.length) html += grp('يبدأ فصلهم ' + shortDay(next), soon.length) +
    soon.map(a => sRow(a, `${stuCls(a)} · ${daysTxt(a.suspendDays || 1)}، حتى ${shortDay(a.suspendTo)}`)).join('');
  if (sums.length) html += grp('مطلوب حضور ولي الأمر ' + dl, sums.length, null, 'warn') +
    sums.map(a => quickRow(a, a.summonDate === t ? came : null,
      (a.summonDate === d ? '' : shortDay(a.summonDate) + ' ') + 'الساعة ' + (fmtHM(a.summonTime) || '—') + ' · ' + stuCls(a) + (a.violation ? ' · ' + a.violation : ''))).join('');
  const mine = myClasses(), vx = d === t ? violList().filter(x => x.day === t && violCountOf(x) > 0 && (!mine || mine.includes(x.cls))).sort((a, b) => clsCmp(a.cls, b.cls)) : [];
  const vp = vx.flatMap(x => violPeople(x).map(p => Object.assign({cls:x.cls}, p)));
  if (vp.length) html += `<div class="grp info">مخالفات الزي والشعر اليوم <span class="num">· ${vp.length}</span><button class="link" data-act="open-viol" data-day="${t}">التفاصيل</button></div>` +
    vp.map(p => `<button class="row" data-act="open-student" data-id="${esc(p.id)}"><span class="main"><span class="t1 wrap">${esc(p.name)}</span>
      <span class="t2 wrap">${esc(p.cls)} <span class="abs-tags inl">${p.kinds.map(mkTag).join('')}</span></span></span></button>`).join('');
  if (late.length) html += grp('فات موعدها ولم يُسجَّل حضور ولي الأمر', late.length, late.length > 5 && 'summon', 'bad') +
    late.slice(-5).reverse().map(a => quickRow(a, came, 'كان الموعد ' + dayLabel(a.summonDate) + ' · ' + stuCls(a))).join('');
  return `<div class="sec-h"><h2>${d === t ? 'اليوم' : 'يوم الدوام القادم'}</h2><span class="meta">${esc(fmtDay(d))}</span></div>` +
    `<div class="list">${html || `<p class="calm">لا يوجد طالب مفصول ولا استدعاء لولي أمر ولا مخالفة ${esc(dl)}.</p>`}</div>`;
}

/* المفصولون والاستدعاءات في رئيسية المشرف العام والوكيل والمدير: العدد الآن، والإحصائية وطباعتها */
function discCard(){
  if (!canDisc()) return '';
  const d = discData(), n = d.susp.length;
  const box = (sec, kind, label, v, sub) => `<button class="box k-${kind}" data-act="disc-open" data-sec="${sec}"><span class="lb">${label}</span>
      <b${v ? '' : ' class="none"'}>${esc(v || 'لا يوجد')}</b><small>${sub.map(x => `<span class="nl">${esc(x)}</span>`).join('')}</small><span class="btn sm ghost">التفاصيل</span></button>`;
  const ml = [d.late.length ? `فات موعدها ${d.late.length}` : '', d.absent.length ? `لم يحضر ${d.absent.length}` : '', d.now.length ? `موعدها اليوم ${d.now.length}` : '',
    d.soon.length ? `مواعيد قادمة ${d.soon.length}` : ''].filter(Boolean);
  return `<div class="sec-h"><h2>المفصولون والاستدعاءات</h2><span class="meta">كل الفصول</span><button class="link" data-act="disc-open">الإحصائية والطباعة</button></div>
    <div class="duo">${box('susp', 'suspend', 'مفصولون الآن', n ? n + ' طالب' : '', [n ? 'لا يحضرون إلى المدرسة' : 'لا يوجد طالب مفصول الآن'])}${
      box('sum', 'summon', 'لم يحضر ولي الأمر', d.due ? d.due + ' استدعاء' : '', ml.length ? ml : ['لا يوجد استدعاء ينتظر حضور ولي الأمر'])}</div>`;
}

/* مخالفات الزي والشعر في رئيسية المشرف العام: عدد اليوم، وزر التسجيل */
function violCard(){
  const t = today(), head = `<div class="sec-h"><h2>مخالفات الزي والشعر</h2><span class="meta">${esc(dayLabel(t))}</span></div>`;
  if (isWeekend(t)) return head + `<div class="list"><div class="setrow"><div class="main"><div class="t1 wrap">اليوم عطلة نهاية الأسبوع</div></div></div></div>`;
  const xs = violList().filter(x => x.day === t && violCountOf(x) > 0), n = xs.reduce((k, x) => k + violCountOf(x), 0);
  return head + `<div class="list"><div class="setrow"><div class="main"><div class="t1 wrap">${n ? `سُجّل اليوم ${esc(violTxt(n))} في ${xs.length} ${xs.length === 1 ? 'فصل' : 'فصول'}` : 'لم تُسجَّل مخالفة اليوم'}</div>
    <div class="t2 wrap">يصل الإشعار لمشرف جناح الطالب فقط.</div></div><button class="btn sm primary" data-act="viol-open">تسجيل المخالفات</button></div></div>`;
}

/* الغياب والتأخير في رئيسية المشرف: خانتان منفصلتان. الغياب يُعتمد ويصل لشؤون الطلبة، والتأخير يُحفظ في
   سجل الطالب ولا يُرسل لأحد. ثم ملخص شؤون الطلبة (absenceToday) */
function absenceCard(){
  const cl = myClasses(), w = myWing(), t = today();
  // إحصائية غياب الجناح لأي يوم وطباعتها (في العطلة: آخر يوم دوام)
  const stat = cl ? `<button class="link" data-act="open-absence" data-day="${isWeekend(t) ? shiftSchoolDay(t, -1) : t}">إحصائية الغياب</button>` : '';
  const head = `<div class="sec-h"><h2>الغياب والتأخير</h2><span class="meta">${esc(dayLabel(t))}</span>${stat}</div>`;
  if (!cl) {
    const btn = !w && canAdmin() ? `<button class="btn sm primary" data-act="staff-open" data-id="${esc(S.uid)}">تحديد جناحي</button>`
      : w && canWings() ? `<button class="btn sm primary" data-act="wing-open" data-id="${w.id}">إضافة الفصول</button>` : '';
    return head + `<div class="list"><div class="setrow"><div class="main"><div class="t1 wrap">${w ? 'لم تُضف فصول ' + esc(w.name) + ' بعد' : 'لم يُحدَّد جناحك بعد'}</div>
      <div class="t2 wrap">${w ? (canWings() ? 'أضفها من «المزيد» ← الأجنحة، فتظهر لك فصول جناحك فقط وتسجل غيابها وتأخيرها.' : 'يضيفها مسؤول الموقع أو المشرف العام، وتظهر لك بعدها فصول جناحك فقط.')
        : (canAdmin() ? 'اختر جناحك، فتظهر لك فصوله فقط في الرئيسية وتسجل غيابها وتأخيرها.' : 'يحدده مسؤول الموقع أو المشرف العام، وتظهر لك بعدها فصول جناحك فقط.')}</div></div>${btn}</div></div>`;
  }
  // الجمعة والسبت عطلة: لا غياب ولا تأخير
  if (isWeekend(t)) return head + `<div class="list"><div class="setrow"><div class="main"><div class="t1 wrap">اليوم عطلة نهاية الأسبوع</div>
      <div class="t2 wrap">لا يُسجَّل غياب ولا تأخير يوم الجمعة والسبت. يعود التسجيل يوم الأحد.</div></div></div></div>`;
  const sheets = cl.map(c => absSheet(t, c)).filter(Boolean);
  const sent = sheets.filter(x => x.status === 'sent'), drafts = sheets.filter(x => x.status === 'draft');
  const done = sheets.length === cl.length && !drafts.length, n = absCount(sheets);
  const of = `سُجّل ${sheets.length} من ${cl.length} ${cl.length === 1 ? 'فصل' : 'فصول'}`;
  // اعتماد مشرف واحد يكفي للجناح: يظهر لزميله من اعتمده، فلا يسجله مرة أخرى
  const by = sent.length ? ['اعتمده ' + sentByTxt(sent)] : [];
  const ab = !sheets.length ? ['', ['يصل لشؤون الطلبة بعد اعتمادك'], 'تسجيل الغياب', true]
    : done ? [n ? n + ' غائب' : 'لا غياب', ['أُرسل لشؤون الطلبة ' + fmtTime(Math.max.apply(null, sent.map(x => x.sentAt)))].concat(by), 'عرض', false]
    : [n ? n + ' غائب' : 'لا غياب', [of].concat(drafts.length ? ['لم يُعتمد بعد'] : [], by), 'إكمال واعتماد', true];
  const ln = cl.reduce((k, c) => k + lateIdsOf(t, c).size, 0);
  // [الرقم، أسطر الشرح، الزر، الزر الرئيسي]
  const box = (act, kind, label, [v, sub, go, main]) => `<button class="box k-${kind}" data-act="${act}"><span class="lb">${label}</span>
      <b${v ? '' : ' class="none"'}>${esc(v || 'لم يُسجَّل بعد')}</b><small>${sub.map(x => `<span class="nl">${esc(x)}</span>`).join('')}</small><span class="btn sm ${main ? 'primary' : 'ghost'}">${go}</span></button>`;
  return head + `<div class="duo">${box('abs-open', 'absent', 'الغياب', ab)}${box('late-open', 'late', 'التأخير', [ln ? ln + ' متأخر' : '', ['يُحفظ في سجل الطالب، ولا يُرسل لأحد'], 'تسجيل التأخير', !ln])}</div>`;
}
function absenceToday(){
  const t = today();
  // الجمعة والسبت عطلة: لا غياب، ورابط لآخر يوم دوام (للاطلاع والطباعة)
  if (isWeekend(t)) {
    const last = shiftSchoolDay(t, -1), n = absSent(last);
    return `<div class="sec-h"><h2>الغياب اليومي</h2><button class="link" data-act="open-absence" data-day="${last}">غياب ${esc(fmtDay(last, {weekday:'long'}))}${n.length ? ' والطباعة' : ''}</button></div>
      <div class="list"><p class="calm">اليوم عطلة نهاية الأسبوع، لا يوجد غياب.${n.length ? ` آخر يوم دوام (${esc(fmtDay(last, {weekday:'long'}))}): ${absCount(n)} غائب.` : ''}</p></div>`;
  }
  const sent = absList().filter(x => x.day === t && x.status === 'sent').sort((a, b) => clsCmp(a.cls, b.cls));
  const missing = M().classes.filter(c => !sent.some(x => x.cls === c));
  return `<div class="sec-h"><h2>الغياب اليوم</h2>${sent.length ? `<span class="count num">${absCount(sent)}</span>` : ''}<button class="link" data-act="open-absence" data-day="${t}">${sent.length ? 'التفاصيل والطباعة' : 'الأيام السابقة'}</button></div>
    <div class="list">${sent.length ? sent.map(x => `<button class="row" data-act="open-absence" data-day="${esc(x.day)}">
        <span class="main"><span class="t1">${esc(x.cls)} · ${x.absent.length ? x.absent.length + ' غائب من ' + x.total : 'لا غياب'}</span>
        <span class="t2 wrap">${nameLines(x.absent, 'حضر الجميع')}</span></span><span class="when">${esc(fmtTime(x.sentAt))}</span></button>`).join('')
      : '<p class="calm">لم يصل غياب اليوم بعد. يصلك هنا بعد أن يعتمده المشرفون.</p>'}</div>
    ${sent.length && missing.length ? `<p class="meta">لم يصل بعد: ${esc(missing.join('، '))}</p>` : ''}`;
}

/* الأجنحة في «المزيد»: مشرفو كل جناح وفصوله، ويعدّلها مسؤول الموقع والمشرف العام والوكيل والمدير */
function wingsSection(){
  const ws = wingList(); if (!ws.length) return '';
  const edit = canWings();
  return `<section class="sec" id="m-wings"><div class="sec-h"><h2>الأجنحة</h2><span class="count num">${ws.length}</span></div>
    <div class="list">${ws.map(w => {
      const sups = supsOf(w.id), cls = w.classes.slice().sort(clsCmp);
      const inner = `<span class="main"><span class="t1">${esc(w.name)}</span>
        <span class="t2 wrap">${sups.length ? 'المشرفون: ' + esc(sups.map(s => s.name + (s.active ? '' : ' (موقوف)')).join('، ')) : 'لم يُحدَّد مشرفوه بعد'}</span>
        <span class="t2 wrap">${cls.length ? 'الفصول: ' + esc(cls.join('، ')) : 'لم تُضف فصوله بعد'}</span></span>`;
      return edit ? `<button class="row" data-act="wing-open" data-id="${w.id}">${inner}${icon('edit','sm')}</button>` : `<div class="row">${inner}</div>`;
    }).join('')}</div>
    ${edit ? '<p class="meta">اضغط الجناح لتحديد مشرفيه وفصوله. المشرف يرى في الرئيسية فصول جناحه فقط، وتصله إشعاراتها، ويسجل غيابها اليومي.</p>' : ''}</section>`;
}

/* إشعارات الجهاز (حتى والموقع مغلق): حالة هذا الجهاز في شاشة الإشعارات، وتذكير في الرئيسية */
function pushRow(){
  const st = PUSH.state, B = (act, cls, label, extra) => `<button class="btn sm ${cls}" data-act="${act}"${extra || ''}>${label}</button>`;
  const R = {
    on: ['تصل لهذا الجهاز حتى والموقع مغلق', 'وتصل كذلك لكل جهاز آخر فعّلتها عليه.', B('push-test', 'ghost', 'تجربة') + B('push-off', 'ghost', 'إيقاف على هذا الجهاز', ' data-confirm="اضغط مرة أخرى للإيقاف"')],
    off: ['لا تصل لهذا الجهاز والموقع مغلق', 'فعّلها مرة واحدة على كل جهاز تستخدمه، واضغط «سماح» عندما يسألك.',
      B('push-on', 'primary', PUSH.busy ? 'جارٍ التفعيل…' : 'تفعيل على هذا الجهاز', PUSH.busy ? ' disabled' : '')],
    denied: ['الإشعارات محظورة لهذا الموقع في المتصفح', 'اسمح بها من إعدادات الموقع في المتصفح (الأذونات ← الإشعارات)، ثم ارجع هنا.', ''],
    ios: ['على الآيفون: ثبّت الموقع على الشاشة الرئيسية أولاً', 'من Safari: زر المشاركة ثم «إضافة إلى الشاشة الرئيسية». افتح السجل من أيقونته، ثم فعّل الإشعارات من هنا (iOS 16.4 أو أحدث).', ''],
    unsupported: ['هذا المتصفح لا يدعم الإشعارات والموقع مغلق', 'استخدم Chrome في أندرويد أو الكمبيوتر، أو ثبّت الموقع على الشاشة الرئيسية في الآيفون.', ''],
    checking: ['جارٍ التحقق من إشعارات هذا الجهاز…', '', '']
  }[st] || ['جارٍ التحقق من إشعارات هذا الجهاز…', '', ''];
  const tone = st === 'on' ? 'ok' : st === 'off' ? 'warn' : 'mute';
  return `<div class="setrow stacked" id="in-push" data-state="${esc(st)}"><span class="dev-ic tone-${tone}">${icon(st === 'on' ? 'check' : 'bell', 'sm')}</span>
    <div class="main"><div class="t1 wrap">${R[0]}</div>${R[1] ? `<div class="t2 wrap">${R[1]}</div>` : ''}</div>${R[2] ? `<div class="row-acts">${R[2]}</div>` : ''}</div>`;
}
function pushHint(){
  if (!prefs().notify || (PUSH.state !== 'off' && PUSH.state !== 'ios') || pushHintPaused()) return '';
  const ios = PUSH.state === 'ios';
  return `<div class="banner hint" id="h-push">${icon('bell')}<div class="grow"><b>الإشعارات لا تصل لهذا الجهاز والموقع مغلق</b>
    <div class="meta">${ios ? 'ثبّت الموقع على الشاشة الرئيسية من Safari (زر المشاركة ← «إضافة إلى الشاشة الرئيسية»)، وافتحه من أيقونته، ثم فعّلها من الجرس.' : 'فعّلها مرة واحدة لتصلك الاستدعاءات وطلبات الفصل وغيرها حتى والجوال مقفل.'}</div>
    <div class="btns">${ios ? '' : '<button class="btn sm primary" data-act="push-on">تفعيل على هذا الجهاز</button>'}<button class="btn sm ghost" data-act="push-hint-off">${ios ? 'حسناً' : 'لاحقاً'}</button></div></div></div>`;
}

/* ===== Views ===== */
const VIEWS = {
  home: {
    mount(el){
      el.innerHTML = `<div class="stack">
        <section class="hello" id="h-hello"></section>
        <div id="h-banner" class="stack"></div>
        <section class="sec" id="h-today" hidden></section>
        <section class="sec" id="h-disc" hidden></section>
        <section class="sec" id="h-abs" hidden></section>
        <section class="sec" id="h-attn"></section>
        <section class="sec" id="h-week"></section>
        <section class="sec" id="h-top"></section>
        <section class="sec" id="h-recent"></section></div>`;
    },
    update(el){
      const m = M(), t = today(), hr = new Date().getHours(), cl = myClasses();
      // المشرف يرى في الرئيسية فصول جناحه فقط
      const scope = m.list.filter(inScope), sc = scopeCls();
      $('#h-hello', el).innerHTML = `<div class="hello-d">${esc(fmtDay(t))}</div>
        <h1>${hr < 12 ? 'صباح الخير' : 'مساء الخير'}، ${esc(personName(S.uid))}</h1>
        <span class="rolechip">${esc(ROLES[myRole()]||'')}</span>${myWing() ? `<div class="meta">${esc(myWing().name)}${cl ? ': ' + esc(cl.join(' · ')) : ' · لم تُضف فصوله بعد'}</div>` : ''}`;
      const b = topBanner() + pushHint() + demoBanner() + onboarding();
      const hb = $('#h-banner', el); hb.innerHTML = b; hb.hidden = !b;
      const ht = $('#h-today', el), td = todayCard();
      ht.innerHTML = td; ht.hidden = !td;
      const hd = $('#h-disc', el), dc = discCard();
      hd.innerHTML = dc; hd.hidden = !dc;
      const ha = $('#h-abs', el), abs = myRole() === 'supervisor' ? absenceCard() : contactDuty() ? absenceToday() : canViol() ? violCard() : '';
      ha.innerHTML = abs; ha.hidden = !abs;
      $('#h-attn', el).innerHTML = attention();

      const ws = weekStart(), wk = scope.filter(a => (a.date||'') >= ws);
      $('#h-week', el).innerHTML = `<div class="sec-h"><h2>هذا الأسبوع</h2><span class="meta">منذ ${esc(fmtDay(ws))}</span></div>
        <div class="stats">${TYPE_KEYS.map(k => {
          const n = wk.filter(a => a.type===k).length, td = wk.filter(a => a.type===k && a.date===t).length;
          return `<button class="stat ty-${k}" data-act="go-log" data-type="${k}" data-period="week" data-cls="${sc}"><span class="lb">${TYPES[k].label}</span><b>${n}</b><small>اليوم ${td}</small></button>`;
        }).join('')}</div>`;

      const since = addDays(t, -30), cnt = {};
      for (const a of scope) if ((a.date||'') >= since) {
        const c = cnt[a.studentId] || (cnt[a.studentId] = {a, n:0, by:{}});
        c.n++; c.by[a.type] = (c.by[a.type]||0) + 1;
      }
      const top = Object.values(cnt).filter(c => c.n >= 2).sort((x,y) => y.n - x.n).slice(0,5);
      $('#h-top', el).innerHTML = top.length ? `<div class="sec-h"><h2>الأكثر تكراراً</h2><span class="meta">آخر 30 يوماً</span></div>
        <div class="list">${top.map(c => `<button class="row" data-act="open-student" data-id="${esc(c.a.studentId)}"><span class="avatar">${esc(initial(stuName(c.a)))}</span>
          <span class="main"><span class="t1">${esc(stuName(c.a))}</span><span class="t2">${esc(stuCls(c.a))} · ${c.n} إجراءات</span></span>
          <span class="cnts">${TYPE_KEYS.filter(k => c.by[k]).map(k => `<span class="cnt ty-${k}" aria-label="${TYPES[k].label} ${c.by[k]}">${c.by[k]}</span>`).join('')}</span></button>`).join('')}</div>` : '';

      const recent = scope.slice(0, 8);
      $('#h-recent', el).innerHTML = `<div class="sec-h"><h2>آخر الإجراءات</h2>${recent.length ? `<button class="link" data-act="go-log" data-period="all" data-cls="${sc}">${cl ? 'كل إجراءات جناحي' : 'السجل كاملاً'}</button>` : ''}</div>` +
        (recent.length ? `<div class="list">${recent.map(actRow).join('')}</div>` : `<div class="list"><p class="calm">${S.loaded ? 'لم يُسجَّل أي إجراء بعد.' : 'جارٍ التحميل…'}</p></div>`);
    }
  },

  log: {
    mount(el){
      const f = S.f.log;
      el.innerHTML = `<div class="stack">
        <div class="page-h"><h1>السجل</h1><span class="meta num" id="l-count"></span></div>
        <div class="tools">
          <label class="search">${icon('search')}<input id="l-q" type="search" placeholder="ابحث باسم الطالب أو المخالفة" data-in="log-q" autocomplete="off" value="${esc(f.q)}"></label>
          <div class="chips" id="l-types" role="group" aria-label="نوع الإجراء"></div>
          <div class="chips" id="l-period" role="group" aria-label="الفترة"></div>
          <div class="chips" id="l-status" role="group" aria-label="الحالة"></div>
          <select id="l-cls" aria-label="الفصل"></select>
        </div>
        <div id="l-list"></div></div>`;
    },
    update(el){
      const f = S.f.log, m = M(), t = today();
      const chip = (k, v, label) => `<button class="chip" data-act="f" data-k="log.${k}" data-v="${v}" aria-pressed="${f[k]===v}">${label}</button>`;
      $('#l-types', el).innerHTML = chip('type','all','الكل') + TYPE_KEYS.map(k => chip('type', k, TYPES[k].label)).join('');
      $('#l-period', el).innerHTML = chip('period','today','اليوم') + chip('period','week','هذا الأسبوع') + chip('period','month','آخر 30 يوماً') + chip('period','all','كل الفترات');
      $('#l-status', el).innerHTML = chip('status','all','كل الحالات') + chip('status','open','يحتاج متابعة') + chip('status','closed','منتهي') + chip('status','contact','بانتظار التواصل');
      const mine = myClasses(), sel = $('#l-cls', el), sig = m.classes.join('|') + '#' + (mine || []).join('|') + '#' + f.cls;
      if (f.cls === 'mine' && !mine) f.cls = 'all';
      if (sel.dataset.sig !== sig) {
        sel.innerHTML = `<option value="all">كل الفصول</option>` + (mine ? `<option value="mine"${f.cls==='mine' ? ' selected' : ''}>جناحي (${esc(myWing().name)})</option>` : '') +
          m.classes.map(c => `<option value="${esc(c)}"${f.cls===c ? ' selected' : ''}>${esc(c)}</option>`).join('');
        sel.dataset.sig = sig;
      }
      const ws = weekStart(), since = addDays(t, -30), q = norm(f.q);
      let rows = m.list.filter(a => {
        if (f.type !== 'all' && a.type !== f.type) return false;
        const d = a.date || '';
        if (f.period==='today' && d !== t) return false;
        if (f.period==='week' && d < ws) return false;
        if (f.period==='month' && d < since) return false;
        if (f.status==='open' && !isOpen(a)) return false;
        if (f.status==='closed' && isOpen(a)) return false;
        if (f.status==='contact' && !needsContact(a)) return false;
        if (f.cls === 'mine' ? !inScope(a) : (f.cls !== 'all' && stuCls(a) !== f.cls)) return false;
        if (q && !norm(stuName(a) + ' ' + (a.violation||'') + ' ' + (a.details||'')).includes(q)) return false;
        return true;
      });
      rows.sort((a,b) => (b.date||'').localeCompare(a.date||'') || (b.createdAt||0) - (a.createdAt||0));
      $('#l-count', el).textContent = rows.length ? `${rows.length} قيد` : '';
      if (!rows.length) {
        $('#l-list', el).innerHTML = `<div class="empty"><h3>لا توجد قيود مطابقة</h3><p>${m.list.length ? 'جرّب فترة أطول أو أزل بعض عوامل التصفية.' : canRecord() ? 'تظهر هنا كل الإجراءات بعد تسجيلها من زر «تسجيل».' : 'تظهر هنا كل الإجراءات بعد أن يسجلها المشرفون.'}</p>${m.list.length ? '<button class="btn ghost" data-act="go-log" data-period="all">عرض كل القيود</button>' : ''}</div>`;
        return;
      }
      const shown = rows.slice(0, f.limit);
      let html = '', day = null;
      for (const a of shown) {
        if (a.date !== day) { day = a.date; html += `<div class="grp">${esc(dayLabel(day))}</div>`; }
        html += actRow(a);
      }
      $('#l-list', el).innerHTML = `<div class="list">${html}</div>` + (rows.length > shown.length ? `<button class="btn ghost block" data-act="more-log">عرض المزيد (${rows.length - shown.length})</button>` : '');
    }
  },

  students: {
    mount(el){
      const f = S.f.stu;
      el.innerHTML = `<div class="stack">
        <div class="page-h"><h1>الطلاب</h1><span class="meta num" id="s-count"></span><span class="grow"></span>
          ${isManager() ? `<button class="btn sm ghost" data-act="stu-import">${icon('upload','sm')}استيراد</button><button class="btn sm primary" data-act="stu-add">${icon('userplus','sm')}طالب</button>` : ''}</div>
        <div class="tools">
          <label class="search">${icon('search')}<input id="s-q" type="search" placeholder="ابحث باسم الطالب" data-in="stu-q" autocomplete="off" value="${esc(f.q)}"></label>
          <div class="chips" id="s-cls" role="group" aria-label="الفصل"></div>
          <div class="chips" id="s-sort" role="group" aria-label="الترتيب"></div>
        </div>
        <div id="s-list"></div></div>`;
    },
    update(el){
      const f = S.f.stu, m = M();
      const chip = (k, v, label) => `<button class="chip" data-act="f" data-k="stu.${k}" data-v="${esc(v)}" aria-pressed="${f[k]===v}">${label}</button>`;
      $('#s-cls', el).innerHTML = chip('cls','all','كل الفصول') + m.classes.map(c => chip('cls', c, esc(c))).join('');
      $('#s-sort', el).innerHTML = chip('sort','name','حسب الاسم') + chip('sort','count','الأكثر إجراءات') + chip('sort','susp','المفصولون حالياً') +
        `<span class="legend" aria-hidden="true">${TYPE_KEYS.map(tchip).join('')}</span>`;
      $('#s-count', el).textContent = m.students.length ? `${m.students.length} طالب` : '';
      if (!m.students.length) {
        $('#s-list', el).innerHTML = S.loaded ? `<div class="empty"><h3>لا يوجد طلاب بعد</h3>
          <p>${isManager() ? 'أسرع طريقة: انسخ أعمدة الاسم والفصل وهاتف ولي الأمر من ملف إكسل، والصقها في الاستيراد.' : 'تضيف شؤون الطلبة أو الإدارة قوائم الطلاب. يمكنك إضافة طالب أثناء تسجيل الإجراء.'}</p>
          ${isManager() ? `<div class="btns"><button class="btn primary" data-act="stu-import">${icon('upload','sm')}استيراد من إكسل</button><button class="btn ghost" data-act="stu-add">${icon('userplus','sm')}إضافة طالب</button></div>` : ''}</div>`
          : `<p class="loading">جارٍ التحميل…</p>`;
        return;
      }
      const q = norm(f.q);
      let rows = m.students.filter(s => (f.cls==='all' || s.cls===f.cls) && (!q || norm(s.name).includes(q)));
      if (f.sort==='susp') rows = rows.filter(s => activeSusp(s.id));
      if (f.sort==='count') rows = rows.slice().sort((a,b) => (m.byStu[b.id]||[]).length - (m.byStu[a.id]||[]).length);
      if (!rows.length) {
        $('#s-list', el).innerHTML = `<div class="empty"><h3>${f.sort==='susp' && !q ? 'لا يوجد طالب مفصول حالياً' : 'لا يوجد طالب مطابق'}</h3>
          ${q && isManager() ? `<button class="btn ghost" data-act="stu-add" data-name="${esc(f.q.trim())}">${icon('userplus','sm')}إضافة «${esc(f.q.trim())}» طالباً جديداً</button>` : ''}</div>`;
        return;
      }
      const shown = rows.slice(0, f.limit);
      $('#s-list', el).innerHTML = `<div class="list">${shown.map(s => {
        const acts = m.byStu[s.id] || [], by = {};
        acts.forEach(a => { by[a.type] = (by[a.type]||0) + 1; });
        return `<button class="row" data-act="open-student" data-id="${esc(s.id)}"><span class="avatar">${esc(initial(s.name))}</span>
          <span class="main"><span class="t1">${esc(s.name)}</span><span class="t2">${esc(s.cls||'بدون فصل')}${activeSusp(s.id) ? '<span class="flag">مفصول</span>' : ''}</span></span>
          <span class="cnts">${TYPE_KEYS.filter(k => by[k]).map(k => `<span class="cnt ty-${k}" aria-label="${TYPES[k].label} ${by[k]}">${by[k]}</span>`).join('')}</span></button>`;
      }).join('')}</div>` + (rows.length > shown.length ? `<button class="btn ghost block" data-act="more-stu">عرض المزيد (${rows.length - shown.length})</button>` : '');
    }
  },

  student: {
    mount(el){ el.innerHTML = `<div class="stack" id="p-root"></div>`; },
    update(el){
      const id = S.params.id, s = S.students[id], acts = M().byStu[id] || [], root = $('#p-root', el);
      const back = `<div class="pback"><button class="iconbtn" data-act="back" aria-label="رجوع">${icon('back')}</button><span>${{home:'الرئيسية', log:'السجل', inbox:'الإشعارات'}[S.params.from] || 'الطلاب'}</span></div>`;
      if (!s && !acts.length) {
        root.innerHTML = back + (S.loaded ? `<div class="empty"><h3>لم يُعثر على الطالب</h3><p>ربما حُذف من قائمة الطلاب.</p></div>` : '<p class="loading">جارٍ التحميل…</p>');
        return;
      }
      const name = s ? s.name : acts[0].studentName, cls = s ? s.cls : acts[0].cls;
      const by = {}; acts.forEach(a => { by[a.type] = (by[a.type]||0) + 1; });
      const sus = activeSusp(id), recent = acts.filter(a => (a.date||'') >= addDays(today(), -30)).length;
      // فصل معتمد لم يبدأ بعد: الأقرب
      const upSus = sus ? null : acts.filter(a => a.type === 'suspend' && a.status === 'approved' && (a.suspendFrom || '') > today()).sort((a, b) => a.suspendFrom.localeCompare(b.suspendFrom))[0];
      const phone = s && s.phone;
      const since = addDays(today(), -30), dn = {absent:0, late:0}; VIOL_KEYS.forEach(k => { dn[k] = 0; });
      absList().forEach(x => { if (x.status !== 'sent' || x.day < since) return;
        if (x.absent.some(a => a.id === id)) dn.absent++;
      });
      const lates = lateEntries(id); fetchLateOf(id);
      dn.late = lates.filter(l => l.day >= since).length;
      violList().forEach(x => { if (x.day < since) return; VIOL_KEYS.forEach(k => { if (marksOf(x, k).some(a => a.id === id)) dn[k]++; }); });
      // سجل الطالب: الإجراءات، والتأخير الصباحي بتاريخه ومن سجّله، الأحدث أولاً
      const items = acts.map(a => ({t:a.createdAt || 0, html:`<li class="ty-${a.type}"><button class="card" data-act="open-action" data-id="${esc(a.id)}">
              <span class="top">${tchip(a.type)}${pill(a)}${CONTACT_TYPES.includes(a.type) ? contactPill(a) : ''}<span class="grow"></span><span class="day">${esc(dayLabel(a.date))}</span></span>
              <span class="what">${esc(a.violation || '—')}</span>
              <span class="meta">سجّله ${esc(personName(a.createdBy))}${a.type==='summon' && a.summonDate ? ' · الموعد ' + esc(dayLabel(a.summonDate)) : ''}${a.type==='suspend' && a.suspendFrom ? ' · ' + esc(daysTxt(a.suspendDays||1)) + '، يبدأ ' + esc(dayLabel(a.suspendFrom)) : ''}</span>
            </button></li>`}))
        .concat(lates.map(l => ({t:l.at || Date.parse(l.day + 'T07:00:00+03:00'), html:`<li class="ty-late"><div class="card">
              <span class="top"><span class="tchip ty-late">تأخير صباحي</span><span class="grow"></span><span class="day">${esc(dayLabel(l.day))}</span></span>
              <span class="meta">سجّله ${esc(personName(l.by))}${l.at ? ' · ' + esc(fmtTime(l.at)) : ''} · ${esc(l.cls)}</span></div></li>`})))
        .sort((x, y) => y.t - x.t);
      const daily = [dn.absent ? 'غياب ' + dn.absent : '', dn.late ? 'تأخير ' + dn.late : ''].concat(VIOL_KEYS.map(k => dn[k] ? VIOLS[k].g + ' ' + dn[k] : '')).filter(Boolean).join(' · ');
      root.innerHTML = back + `
        <section class="phead"><span class="avatar lg">${esc(initial(name))}</span><div><h1>${esc(name)}</h1><div class="meta">${esc(cls ? 'الفصل ' + cls : 'بدون فصل')}${s ? '' : ' · حُذف من القائمة'}</div></div></section>
        ${sus ? timeBanner(sus) : upSus ? timeBanner(upSus) : ''}
        ${acts.filter(a => a.type === 'summon' && a.status === 'scheduled' && a.summonDate).map(timeBanner).join('')}
        ${phone ? `<div class="contact"><span class="meta">ولي الأمر</span><span class="phone">${esc(phone)}</span><span class="grow"></span>
          <button class="btn sm ghost" data-act="copy" data-text="${esc(phone)}">${icon('copy','sm')}نسخ</button>
          <a class="btn sm ghost" href="https://wa.me/${esc(waNum(phone))}" target="_blank" rel="noopener">${icon('chat','sm')}واتساب</a>
          <a class="btn sm ghost" href="tel:${esc(phoneDigits(phone))}">${icon('summon','sm')}اتصال</a></div>` : ''}
        ${s && s.notes ? `<p class="details">${esc(s.notes)}</p>` : ''}
        <div class="stats five">${TYPE_KEYS.map(k => `<div class="stat ty-${k}"><span class="lb">${TYPES[k].label}</span><b>${by[k]||0}</b></div>`).join('')}
          <div class="stat ty-late" id="p-late"><span class="lb">تأخير</span><b>${lates.length}</b></div></div>
        ${daily ? `<p class="meta" id="p-daily">الغياب اليومي، آخر 30 يوماً: ${esc(daily)}</p>` : ''}
        ${recent >= 3 ? `<div class="banner warn">${icon('alert')}<div>عدد الإجراءات على هذا الطالب خلال آخر 30 يوماً: ${recent}.</div></div>` : ''}
        ${canRecord() ? `<button class="btn primary block" data-act="record" data-student="${esc(id)}">${icon('plus','sm')}تسجيل إجراء لهذا الطالب</button>` : ''}
        <section class="sec"><div class="sec-h"><h2>سجل الطالب</h2>${items.length ? `<span class="count num">${items.length}</span>` : ''}</div>
          ${items.length ? `<ol class="tl">${items.map(x => x.html).join('')}</ol>` : `<div class="list"><p class="calm">لا توجد إجراءات مسجلة على هذا الطالب.</p></div>`}
        </section>
        ${s && isManager() ? `<div class="btns"><button class="btn ghost" data-act="stu-edit" data-id="${esc(id)}">${icon('edit','sm')}تعديل بيانات الطالب</button></div>` : ''}`;
    }
  },

  inbox: {
    mount(el){
      el.innerHTML = `<div class="stack">
        <div class="page-h"><h1>الإشعارات</h1><span class="grow"></span><button class="btn sm ghost" data-act="markread">تعليم الكل كمقروء</button></div>
        <section class="list" id="in-prefs"></section>
        <div id="in-list"></div></div>`;
    },
    update(el){
      const p = prefs();
      const sw = (k, label) => `<button class="sw" role="switch" aria-checked="${!!p[k]}" data-act="pref" data-k="${k}" aria-label="${label}"></button>`;
      $('#in-prefs', el).innerHTML = `
        <div class="setrow"><div class="main"><div class="t1">الإشعارات</div><div class="t2 wrap">تنبيه لحظة حدوث ما يخصك: على الشاشة وأنت تتصفح السجل، وعلى جهازك حتى والموقع مغلق بعد تفعيلها عليه.</div></div>${sw('notify','الإشعارات')}</div>
        ${p.notify ? pushRow() + `<div class="setrow"><div class="main"><div class="t1">صوت مع التنبيه داخل الموقع</div><div class="t2 wrap">يعمل بعد أول لمسة على الصفحة، مع اهتزاز في الأجهزة التي تدعمه. إشعارات الجهاز تتبع صوت الجوال.</div></div>${sw('sound','صوت مع التنبيه')}</div>
        <div class="setrow"><div class="main"><div class="t1">نبّهني عن</div><div class="chips">${NOTIFY_TYPES.map(k => `<button class="chip" data-act="pref-type" data-t="${k}" aria-pressed="${!!p.types[k]}">${TYPES[k].label}</button>`).join('')}</div>
          ${isApprover() ? '<div class="t2 wrap">طلبات الفصل تصلك دائماً لأنك تعتمدها.</div>' : ''}
          ${contactDuty() ? '<div class="t2 wrap">الاستدعاءات وتغيير مواعيدها والفصل المعتمد والغياب اليومي تصلك دائماً لأنك تتواصل مع أولياء الأمور.</div>' : ''}
          ${myClasses() ? '<div class="t2 wrap">تصلك إجراءات فصول جناحك فقط، وكل تحديث على ما سجلته أنت.</div>' : ''}
          <div class="t2 wrap">التقارير لا تُرسل لأحد، وتُحفظ في سجل الطالب.</div>
          <div class="t2 wrap">إشعار الجهاز يظهر على شاشة القفل، فلا يُكتب فيه اسم الطالب، وتجد التفاصيل هنا.</div></div></div>` : ''}`;
      const ev = events();
      if (!ev.length) {
        $('#in-list', el).innerHTML = `<div class="empty"><h3>لا توجد إشعارات</h3><p>${contactDuty() ? 'تظهر هنا الاستدعاءات الجديدة والفصل المعتمد والغياب اليومي بعد اعتماده.' : 'تظهر هنا الإجراءات الجديدة التي يسجلها الزملاء، وكل تحديث على القيود التي سجلتها أنت.'}</p></div>`;
        return;
      }
      $('#in-list', el).innerHTML = `<div class="list">${ev.map(x => {
        const t = evText(x), un = (x.e.t||0) > S.seenMark;
        if (x.viol) return `<button class="row${un ? ' unread' : ''}" data-act="open-viol" data-day="${esc(x.viol.day)}"><span class="tico ty-viol">${icon('alert')}</span>
          <span class="main"><span class="t1 wrap">${esc(t.t1)}</span><span class="t2 wrap">${esc(t.t2)}</span></span><span class="when">${esc(rel(x.e.t))}</span></button>`;
        if (x.abs) return `<button class="row${un ? ' unread' : ''}" data-act="open-absence" data-day="${esc(x.abs.day)}"><span class="tico ty-abs">${icon('users')}</span>
          <span class="main"><span class="t1 wrap">${esc(t.t1)}</span><span class="t2 wrap">${esc(t.t2)}</span></span><span class="when">${esc(rel(x.e.t))}</span></button>`;
        return `<button class="row${un ? ' unread' : ''}" data-act="open-action" data-id="${esc(x.a.id)}">${tico(x.a.type)}
          <span class="main"><span class="t1 wrap">${esc(t.t1)}</span><span class="t2 wrap">${esc(t.t2)}</span></span><span class="when">${esc(rel(x.e.t))}</span></button>`;
      }).join('')}</div>`;
    }
  },

  more: {
    mount(el){ el.innerHTML = `<div class="stack" id="m-root"></div>`; },
    update(el){
      const my = me() || {}, admin = canAdmin();
      const ids = Object.keys(S.staff).sort((a,b) => (S.staff[b].active - S.staff[a].active) || ROLE_ORDER.indexOf(S.staff[a].role) - ROLE_ORDER.indexOf(S.staff[b].role) || personName(a).localeCompare(personName(b),'ar'));
      const shown = admin ? ids : ids.filter(id => S.staff[id].active);
      const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
      $('#m-root', el).innerHTML = `
        <div class="page-h"><h1>المزيد</h1></div>
        <section class="list">
          <div class="setrow"><span class="avatar lg">${esc(initial(my.name))}</span>
            <div class="main"><div class="t1">${esc(my.name||'')}</div><div class="t2 wrap">${esc(ROLES[my.role]||'')} · <span dir="ltr">${esc(my.username||'')}</span>${admin ? ' · مسؤول الموقع' : ''}</div></div></div>
          <button class="row" data-act="pw-open">${icon('edit','sm')}<span class="main"><span class="t1">تغيير كلمة السر</span></span></button>
          <button class="row" data-act="signout" data-confirm="اضغط مرة أخرى لتسجيل الخروج">${icon('back','sm')}<span class="main"><span class="t1">تسجيل الخروج</span></span></button>
        </section>
        ${wingsSection()}
        <section class="sec"><div class="sec-h"><h2>الطاقم</h2><span class="count num">${shown.length}</span>${admin ? `<button class="link" data-act="staff-new">+ إضافة عضو</button>` : ''}</div>
          <div class="list">${shown.map(id => { const st = S.staff[id]; const inner = `<span class="avatar">${esc(initial(st.name))}</span>
            <span class="main"><span class="t1">${esc(st.name)}${id===S.uid ? ' (أنت)' : ''}</span><span class="t2 wrap">${esc(ROLES[st.role]||'')}${st.isAdmin ? ' · مسؤول' : ''}${admin ? ' · <span dir="ltr">' + esc(st.username) + '</span>' : ''}${st.active ? '' : ' · موقوف'}</span>
            ${st.role === 'supervisor' ? `<span class="t2 wrap">${wingOf(st) ? esc(wingOf(st).name) : 'لم يُحدَّد جناحه بعد'}</span>` : ''}</span>`;
            return admin ? `<button class="row${st.active ? '' : ' off'}" data-act="staff-open" data-id="${esc(id)}">${inner}${icon('edit','sm')}</button>` : `<div class="row">${inner}</div>`; }).join('')}</div>
          ${admin ? `<p class="meta">أضف حساباً لكل زميل، ثم أرسل له رابط الموقع مع اسم المستخدم وكلمة السر. يقدر كل واحد يغيّر كلمة سره بنفسه بعد الدخول.</p>
          <div class="btns"><button class="btn ghost sm" data-act="deleted-open">${icon('trash','sm')}سجل المحذوفات</button></div>` : ''}</section>
        ${standalone ? '' : `<section class="sec"><div class="sec-h"><h2>ثبّت الموقع على جوالك</h2></div><div class="list"><div class="setrow"><ol class="steps">
          <li>آيفون: افتح الموقع في Safari، اضغط زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية».</li>
          <li>أندرويد: افتح الموقع في Chrome، اضغط القائمة ⋮، ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li>
          <li>بعد التثبيت فعّل الإشعارات من الجرس أعلى الشاشة، لتصلك حتى والموقع مغلق.</li></ol></div></div></section>`}
        <section class="sec"><div class="sec-h"><h2>عن السجل</h2></div>
          <p class="meta">سجل الإشراف لمدرسة الأصمعي: الطلاب، والتعهدات والتقارير والاستدعاءات والفصل، وملف لكل طالب، والإشعارات. البيانات محفوظة في قاعدة بيانات المدرسة ولا يراها إلا أعضاء الطاقم.</p></section>`;
    }
  }
};
