'use strict';
// الشاشات الرئيسية: الرئيسية، السجل، الطلاب، ملف الطالب، الإشعارات، المزيد.
/* ===== Shared fragments ===== */
function topBanner(){
  if (S.offline) return `<div class="banner warn">${icon('info')}<div>لا يوجد اتصال بالإنترنت. تظهر آخر بيانات محمّلة، ولن تُحفظ الإضافات حتى يرجع الاتصال.</div></div>`;
  if (S.fatal) return `<div class="banner bad">${icon('alert')}<div>${esc(S.fatal)} <button class="link" data-act="reload">إعادة المحاولة</button></div></div>`;
  return '';
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
function quickRow(a, moves, sub){
  return `<div class="row"><button class="main" data-act="open-action" data-id="${esc(a.id)}"><span class="t1">${esc(stuName(a))}</span><span class="t2">${esc(sub)}</span></button>
    ${moves && canRecord() ? `<div class="row-acts">${moves.map(mv => `<button class="btn sm ${mv[2]}" data-act="quick" data-id="${esc(a.id)}" data-to="${mv[0]}">${esc(mv[1])}</button>`).join('')}</div>` : pill(a)}</div>`;
}
function grp(title, n, type){
  return `<div class="grp">${esc(title)} <span class="num">· ${n}</span>${type ? `<button class="link" data-act="go-log" data-type="${type}" data-status="open" data-period="all">عرض الكل</button>` : ''}</div>`;
}
// صف «تواصل مطلوب»: اتصال مباشر بولي الأمر ثم «تم التواصل»
function contactRow(a){
  const t = today(), s = stuOf(a), phone = s && s.phone;
  const sub = a.type === 'summon'
    ? `استدعاء · ${shortDay(a.summonDate)}${a.summonTime ? ' ' + fmtHM(a.summonTime) : ''}`
    : `فصل ${daysTxt(a.suspendDays || 1)} · ${a.suspendFrom <= t ? 'بدأ' : 'يبدأ'} ${shortDay(a.suspendFrom)}`;
  return `<div class="row"><button class="main" data-act="open-action" data-id="${esc(a.id)}"><span class="t1">${esc(stuName(a))}</span><span class="t2">${esc(sub + ' · ' + stuCls(a))}</span></button>
    <div class="row-acts">${phone ? `<a class="btn sm ghost" href="tel:${esc(phoneDigits(phone))}" aria-label="اتصال بولي أمر ${esc(stuName(a))}">${icon('summon','sm')}</a>` : ''}
    <button class="btn sm ok" data-act="contact-quick" data-id="${esc(a.id)}">تم التواصل</button></div></div>`;
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
  const m = M(), role = myRole(), t = today();
  const pend = m.list.filter(a => a.type==='suspend' && a.status==='pending');
  const sums = m.list.filter(a => a.type==='summon' && a.status==='scheduled' && a.summonDate && a.summonDate <= t)
    .sort((a,b) => (a.summonDate + (a.summonTime||'')).localeCompare(b.summonDate + (b.summonTime||'')));
  const reports = m.list.filter(a => a.type==='report' && a.status==='open' && (OVERSEERS.includes(role) || a.to===role));
  const pledges = m.list.filter(a => a.type==='pledge' && a.status==='open');
  let html = '', total = 0;
  if (pend.length) {
    total += pend.length;
    html += grp('فصل بانتظار الاعتماد', pend.length, pend.length > 4 && 'suspend');
    html += pend.slice(0,4).map(a => quickRow(a, isApprover() ? [['approved','اعتماد','ok'],['rejected','رفض','bad']] : null,
      `${daysTxt(a.suspendDays||1)} · يبدأ ${dayLabel(a.suspendFrom)} · ${stuCls(a)}`)).join('');
  }
  if (sums.length) {
    total += sums.length;
    html += grp('استدعاءات اليوم', sums.length, sums.length > 5 && 'summon');
    html += sums.slice(0,5).map(a => quickRow(a, [['attended','حضر','ok'],['absent','لم يحضر','bad']],
      (a.summonDate < t ? 'متأخر · كان الموعد ' + dayLabel(a.summonDate) : 'الساعة ' + (fmtHM(a.summonTime) || '—')) + ' · ' + stuCls(a))).join('');
  }
  if (reports.length) {
    total += reports.length;
    html += grp('تقارير جديدة', reports.length, reports.length > 3 && 'report');
    html += reports.slice(0,3).map(a => quickRow(a, null, (a.violation||'') + ' · ' + stuCls(a))).join('');
  }
  if (pledges.length) {
    total += pledges.length;
    html += grp('تعهدات بانتظار التوقيع', pledges.length, pledges.length > 3 && 'pledge');
    html += pledges.slice(0,3).map(a => quickRow(a, [['signed','تم التوقيع','ok']], (a.violation||'') + ' · ' + stuCls(a))).join('');
  }
  return `<div class="sec-h"><h2>يحتاج متابعة</h2>${total ? `<span class="count num">${total}</span>` : ''}</div>` +
    (total ? `<div class="list">${html}</div>` : `<div class="list"><p class="calm">لا يوجد ما يحتاج متابعة الآن.</p></div>`);
}

/* ===== Views ===== */
const VIEWS = {
  home: {
    mount(el){
      el.innerHTML = `<div class="stack">
        <section class="hello" id="h-hello"></section>
        <div id="h-banner" class="stack"></div>
        <section class="sec" id="h-attn"></section>
        <section class="sec" id="h-week"></section>
        <section class="sec" id="h-top"></section>
        <section class="sec" id="h-recent"></section></div>`;
    },
    update(el){
      const m = M(), t = today(), hr = new Date().getHours();
      $('#h-hello', el).innerHTML = `<div class="hello-d">${esc(fmtDay(t))}</div>
        <h1>${hr < 12 ? 'صباح الخير' : 'مساء الخير'}، ${esc(personName(S.uid))}</h1>
        <span class="rolechip">${esc(ROLES[myRole()]||'')}</span>`;
      const b = topBanner() + onboarding();
      const hb = $('#h-banner', el); hb.innerHTML = b; hb.hidden = !b;
      $('#h-attn', el).innerHTML = attention();

      const ws = weekStart(), wk = m.list.filter(a => (a.date||'') >= ws);
      $('#h-week', el).innerHTML = `<div class="sec-h"><h2>هذا الأسبوع</h2><span class="meta">منذ ${esc(fmtDay(ws))}</span></div>
        <div class="stats">${TYPE_KEYS.map(k => {
          const n = wk.filter(a => a.type===k).length, td = wk.filter(a => a.type===k && a.date===t).length;
          return `<button class="stat ty-${k}" data-act="go-log" data-type="${k}" data-period="week"><span class="lb">${TYPES[k].label}</span><b>${n}</b><small>اليوم ${td}</small></button>`;
        }).join('')}</div>`;

      const since = addDays(t, -30), cnt = {};
      for (const a of m.list) if ((a.date||'') >= since) {
        const c = cnt[a.studentId] || (cnt[a.studentId] = {a, n:0, by:{}});
        c.n++; c.by[a.type] = (c.by[a.type]||0) + 1;
      }
      const top = Object.values(cnt).filter(c => c.n >= 2).sort((x,y) => y.n - x.n).slice(0,5);
      $('#h-top', el).innerHTML = top.length ? `<div class="sec-h"><h2>الأكثر تكراراً</h2><span class="meta">آخر 30 يوماً</span></div>
        <div class="list">${top.map(c => `<button class="row" data-act="open-student" data-id="${esc(c.a.studentId)}"><span class="avatar">${esc(initial(stuName(c.a)))}</span>
          <span class="main"><span class="t1">${esc(stuName(c.a))}</span><span class="t2">${esc(stuCls(c.a))} · ${c.n} إجراءات</span></span>
          <span class="cnts">${TYPE_KEYS.filter(k => c.by[k]).map(k => `<span class="cnt ty-${k}" aria-label="${TYPES[k].label} ${c.by[k]}">${c.by[k]}</span>`).join('')}</span></button>`).join('')}</div>` : '';

      const recent = m.list.slice(0, 8);
      $('#h-recent', el).innerHTML = `<div class="sec-h"><h2>آخر الإجراءات</h2>${recent.length ? '<button class="link" data-act="go-log" data-period="all">السجل كاملاً</button>' : ''}</div>` +
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
      const sel = $('#l-cls', el), sig = m.classes.join('|') + '#' + f.cls;
      if (sel.dataset.sig !== sig) {
        sel.innerHTML = `<option value="all">كل الفصول</option>` + m.classes.map(c => `<option value="${esc(c)}"${f.cls===c ? ' selected' : ''}>${esc(c)}</option>`).join('');
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
        if (f.cls !== 'all' && stuCls(a) !== f.cls) return false;
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
      const phone = s && s.phone;
      root.innerHTML = back + `
        <section class="phead"><span class="avatar lg">${esc(initial(name))}</span><div><h1>${esc(name)}</h1><div class="meta">${esc(cls ? 'الفصل ' + cls : 'بدون فصل')}${s ? '' : ' · حُذف من القائمة'}</div></div></section>
        ${sus ? `<div class="banner bad">${icon('suspend')}<div>مفصول حالياً من ${esc(fmtDay(sus.suspendFrom))} حتى ${esc(fmtDay(sus.suspendTo))}.</div></div>` : ''}
        ${phone ? `<div class="contact"><span class="meta">ولي الأمر</span><span class="phone">${esc(phone)}</span><span class="grow"></span>
          <button class="btn sm ghost" data-act="copy" data-text="${esc(phone)}">${icon('copy','sm')}نسخ</button>
          <a class="btn sm ghost" href="https://wa.me/${esc(waNum(phone))}" target="_blank" rel="noopener">${icon('chat','sm')}واتساب</a>
          <a class="btn sm ghost" href="tel:${esc(phoneDigits(phone))}">${icon('summon','sm')}اتصال</a></div>` : ''}
        ${s && s.notes ? `<p class="details">${esc(s.notes)}</p>` : ''}
        <div class="stats">${TYPE_KEYS.map(k => `<div class="stat ty-${k}"><span class="lb">${TYPES[k].label}</span><b>${by[k]||0}</b></div>`).join('')}</div>
        ${recent >= 3 ? `<div class="banner warn">${icon('alert')}<div>عدد الإجراءات على هذا الطالب خلال آخر 30 يوماً: ${recent}.</div></div>` : ''}
        ${canRecord() ? `<button class="btn primary block" data-act="record" data-student="${esc(id)}">${icon('plus','sm')}تسجيل إجراء لهذا الطالب</button>` : ''}
        <section class="sec"><div class="sec-h"><h2>سجل الطالب</h2>${acts.length ? `<span class="count num">${acts.length}</span>` : ''}</div>
          ${acts.length ? `<ol class="tl">${acts.map(a => `<li class="ty-${a.type}"><button class="card" data-act="open-action" data-id="${esc(a.id)}">
              <span class="top">${tchip(a.type)}${pill(a)}${CONTACT_TYPES.includes(a.type) ? contactPill(a) : ''}<span class="grow"></span><span class="day">${esc(dayLabel(a.date))}</span></span>
              <span class="what">${esc(a.violation || '—')}</span>
              <span class="meta">سجّله ${esc(personName(a.createdBy))}${a.type==='summon' && a.summonDate ? ' · الموعد ' + esc(dayLabel(a.summonDate)) : ''}${a.type==='suspend' && a.suspendFrom ? ' · ' + esc(daysTxt(a.suspendDays||1)) + '، يبدأ ' + esc(dayLabel(a.suspendFrom)) : ''}</span>
            </button></li>`).join('')}</ol>` : `<div class="list"><p class="calm">لا توجد إجراءات مسجلة على هذا الطالب.</p></div>`}
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
        <div class="setrow"><div class="main"><div class="t1">التنبيهات الفورية</div><div class="t2 wrap">يظهر تنبيه على الشاشة لحظة تسجيل إجراء جديد أثناء فتحك للسجل.</div></div>${sw('notify','التنبيهات الفورية')}</div>
        ${p.notify ? `<div class="setrow"><div class="main"><div class="t1">صوت مع التنبيه</div><div class="t2 wrap">يعمل بعد أول لمسة على الصفحة، مع اهتزاز في الأجهزة التي تدعمه.</div></div>${sw('sound','صوت مع التنبيه')}</div>
        <div class="setrow"><div class="main"><div class="t1">نبّهني عن</div><div class="chips">${TYPE_KEYS.map(k => `<button class="chip" data-act="pref-type" data-t="${k}" aria-pressed="${!!p.types[k]}">${TYPES[k].label}</button>`).join('')}</div>
          ${isApprover() ? '<div class="t2 wrap">طلبات الفصل تصلك دائماً لأنك تعتمدها.</div>' : ''}
          ${contactDuty() ? '<div class="t2 wrap">الاستدعاءات وتغيير مواعيدها والفصل المعتمد تصلك دائماً لأنك تتواصل مع أولياء الأمور.</div>' : ''}</div></div>` : ''}`;
      const ev = events();
      if (!ev.length) {
        $('#in-list', el).innerHTML = `<div class="empty"><h3>لا توجد إشعارات</h3><p>${contactDuty() ? 'تظهر هنا الاستدعاءات الجديدة والفصل المعتمد، لتتواصل مع أولياء الأمور.' : 'تظهر هنا الإجراءات الجديدة التي يسجلها الزملاء، وكل تحديث على القيود التي سجلتها أنت.'}</p></div>`;
        return;
      }
      $('#in-list', el).innerHTML = `<div class="list">${ev.map(x => {
        const t = evText(x), un = (x.e.t||0) > S.seenMark;
        return `<button class="row${un ? ' unread' : ''}" data-act="open-action" data-id="${esc(x.a.id)}">${tico(x.a.type)}
          <span class="main"><span class="t1">${esc(t.t1)}</span><span class="t2">${esc(t.t2)}</span></span><span class="when">${esc(rel(x.e.t))}</span></button>`;
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
            <div class="main"><div class="t1">${esc(my.name||'')}</div><div class="t2">${esc(ROLES[my.role]||'')} · <span dir="ltr">${esc(my.username||'')}</span>${admin ? ' · مسؤول الموقع' : ''}</div></div></div>
          <button class="row" data-act="pw-open">${icon('edit','sm')}<span class="main"><span class="t1">تغيير كلمة السر</span></span></button>
          <button class="row" data-act="signout" data-confirm="اضغط مرة أخرى لتسجيل الخروج">${icon('back','sm')}<span class="main"><span class="t1">تسجيل الخروج</span></span></button>
        </section>
        <section class="sec"><div class="sec-h"><h2>الطاقم</h2><span class="count num">${shown.length}</span>${admin ? `<button class="link" data-act="staff-new">+ إضافة عضو</button>` : ''}</div>
          <div class="list">${shown.map(id => { const st = S.staff[id]; const inner = `<span class="avatar">${esc(initial(st.name))}</span>
            <span class="main"><span class="t1">${esc(st.name)}${id===S.uid ? ' (أنت)' : ''}</span><span class="t2">${esc(ROLES[st.role]||'')}${st.isAdmin ? ' · مسؤول' : ''}${admin ? ' · <span dir="ltr">' + esc(st.username) + '</span>' : ''}${st.active ? '' : ' · موقوف'}</span></span>`;
            return admin ? `<button class="row${st.active ? '' : ' off'}" data-act="staff-open" data-id="${esc(id)}">${inner}${icon('edit','sm')}</button>` : `<div class="row">${inner}</div>`; }).join('')}</div>
          ${admin ? `<p class="meta">أضف حساباً لكل زميل، ثم أرسل له رابط الموقع مع اسم المستخدم وكلمة السر. يقدر كل واحد يغيّر كلمة سره بنفسه بعد الدخول.</p>
          <div class="btns"><button class="btn ghost sm" data-act="deleted-open">${icon('trash','sm')}سجل المحذوفات</button></div>` : ''}</section>
        ${standalone ? '' : `<section class="sec"><div class="sec-h"><h2>ثبّت الموقع على جوالك</h2></div><div class="list"><div class="setrow"><ol class="steps">
          <li>آيفون: افتح الموقع في Safari، اضغط زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية».</li>
          <li>أندرويد: افتح الموقع في Chrome، اضغط القائمة ⋮، ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</li></ol></div></div></section>`}
        <section class="sec"><div class="sec-h"><h2>عن السجل</h2></div>
          <p class="meta">سجل الإشراف لمدرسة الأصمعي: الطلاب، والتعهدات والتقارير والاستدعاءات والفصل، وملف لكل طالب، والإشعارات. البيانات محفوظة في قاعدة بيانات المدرسة ولا يراها إلا أعضاء الطاقم.</p></section>`;
    }
  }
};
