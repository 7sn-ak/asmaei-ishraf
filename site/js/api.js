'use strict';
// كل التعامل مع الخادم (Supabase) في هذا الملف فقط.
// بقية الملفات تتعامل مع كائنات بسيطة: طالب، إجراء، سجل إجراء، عضو طاقم، تفضيلات.
const API = (function(){
  const C = window.APP_CONFIG || {};
  const configured = !!(C.SUPABASE_URL && C.SUPABASE_KEY && !/YOUR-/.test(C.SUPABASE_URL + C.SUPABASE_KEY));
  const sb = configured && window.supabase
    ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}})
    : null;

  const emailOf = u => String(u || '').trim().toLowerCase() + '@' + C.USER_DOMAIN;
  const ms = t => t ? Date.parse(t) : 0;
  const hm = t => t ? String(t).slice(0, 5) : '';

  const mapStudent = r => ({id:r.id, name:r.name, cls:r.cls || '', phone:r.phone || '', notes:r.notes || '', createdBy:r.created_by});
  const mapAction = r => ({
    id:r.id, type:r.type, status:r.status, studentId:r.student_id, studentName:r.student_name, cls:r.cls || '',
    violation:r.violation, details:r.details || '', date:r.date,
    summonDate:r.summon_date || '', summonTime:hm(r.summon_time),
    suspendDays:r.suspend_days || null, suspendFrom:r.suspend_from || '', suspendTo:r.suspend_to || '',
    to:r.report_to || '', createdAt:ms(r.created_at), createdBy:r.created_by, updatedAt:ms(r.updated_at),
    contactedAt:ms(r.contacted_at), contactedBy:r.contacted_by || '', contactNote:r.contact_note || '', log:[]
  });
  const mapLog = r => ({id:r.id, actionId:r.action_id, t:ms(r.at), by:r.by, ev:r.ev, to:r.to_status || '', note:r.note || ''});
  const mapStaff = r => ({id:r.id, name:r.name, username:r.username, role:r.role, isAdmin:!!r.is_admin, active:!!r.active, wingId:r.wing_id || null});
  const mapWing = r => ({id:r.id, name:r.name, sort:r.sort || 0, classes:Array.isArray(r.classes) ? r.classes : []});
  // ما سُجّل مع الغياب: {late:[{id,name}], uniform:[...], hair:[...]}
  const mapMarks = m => { const o = {}; if (m && typeof m === 'object' && !Array.isArray(m)) for (const k in m) if (Array.isArray(m[k])) o[k] = m[k]; return o; };
  const mapAbsence = r => ({id:r.id, day:r.day, cls:r.cls, total:r.total || 0, absent:Array.isArray(r.absent) ? r.absent : [], marks:mapMarks(r.marks), status:r.status,
    createdBy:r.created_by, updatedBy:r.updated_by, sentBy:r.sent_by || '', sentAt:ms(r.sent_at), updatedAt:ms(r.updated_at)});
  const mapViol = r => ({id:r.id, day:r.day, cls:r.cls, marks:mapMarks(r.marks), createdBy:r.created_by, updatedBy:r.updated_by, createdAt:ms(r.created_at), updatedAt:ms(r.updated_at)});
  const mapPrefs = r => r ? {notify:!!r.notify, sound:!!r.sound, types:r.types || {}, lastSeen:ms(r.last_seen)} : null;

  function fail(err){
    const e = new Error((err && (err.message || err.error || err.msg)) || 'error');
    e.code = (err && (err.code || err.error_code || err.error)) || '';
    return e;
  }
  async function q(p){ const r = await p; if (r.error) throw fail(r.error); return r.data; }
  async function all(build){
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = await q(build().range(from, from + 999));
      out.push.apply(out, rows);
      if (rows.length < 1000) break;
    }
    return out;
  }
  async function fn(name, body){
    const r = await sb.functions.invoke(name, {body});
    if (r.error) {
      let detail = null;
      try { detail = await r.error.context.json(); } catch(e) {}
      throw fail(detail || r.error);
    }
    return r.data;
  }
  const ACTION_COLS = '*';
  const LOG_COLS = 'id,action_id,at,by,ev,to_status,note';
  const ABS_COLS = 'id,day,cls,total,absent,marks,status,created_by,updated_by,sent_by,sent_at,updated_at';
  const VIOL_COLS = 'id,day,cls,marks,created_by,updated_by,created_at,updated_at';
  const STAFF_COLS = 'id,name,username,role,is_admin,active,wing_id';

  return {
    configured,
    async session(){ const r = await sb.auth.getSession(); return r.data.session; },
    // جلسة محفوظة على الجهاز حتى لو تعذر تجديدها الآن (مثلاً لانقطاع الإنترنت)
    hasStoredSession(){ try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true; } } catch(e) {} return false; },
    onAuth(cb){ sb.auth.onAuthStateChange((ev, s) => cb(ev, s)); },
    async signIn(username, password){
      const r = await sb.auth.signInWithPassword({email:emailOf(username), password});
      if (r.error) throw fail(r.error);
    },
    async signOut(){ await sb.auth.signOut(); },
    async changePassword(password){ const r = await sb.auth.updateUser({password}); if (r.error) throw fail(r.error); },
    async setupNeeded(){ const r = await fn('staff', {op:'status'}); return !!(r && r.needed); },
    setup(p){ return fn('staff', Object.assign({op:'setup'}, p)); },
    adminUsers(body){ return fn('staff', body); },
    loadDeleted(){ return q(sb.from('deleted_log').select('id,table_name,row_data,deleted_by,deleted_at').order('id', {ascending:false}).limit(100)); },

    async loadAll(sinceISO, absSince){
      const res = await Promise.all([
        q(sb.from('staff').select(STAFF_COLS)),
        all(() => sb.from('students').select('id,name,cls,phone,notes,created_by').order('id')),
        all(() => sb.from('actions').select(ACTION_COLS).gte('created_at', sinceISO).order('created_at', {ascending:false})),
        all(() => sb.from('action_log').select(LOG_COLS).gte('at', sinceISO).order('id')),
        q(sb.from('prefs').select('*').maybeSingle()),
        all(() => sb.from('absence_sheets').select(ABS_COLS).gte('day', absSince).order('id')),
        q(sb.from('wings').select('id,name,sort,classes').order('sort')),
        all(() => sb.from('violation_sheets').select(VIOL_COLS).gte('day', absSince).order('id'))
      ]);
      return {staff:res[0].map(mapStaff), students:res[1].map(mapStudent), actions:res[2].map(mapAction), logs:res[3].map(mapLog), prefs:mapPrefs(res[4]), absence:res[5].map(mapAbsence), wings:res[6].map(mapWing), violations:res[7].map(mapViol)};
    },
    async absenceFor(day){ return (await q(sb.from('absence_sheets').select(ABS_COLS).eq('day', day))).map(mapAbsence); },
    async violationsFor(day){ return (await q(sb.from('violation_sheets').select(VIOL_COLS).eq('day', day))).map(mapViol); },
    async getAction(id){
      const res = await Promise.all([
        q(sb.from('actions').select(ACTION_COLS).eq('id', id).maybeSingle()),
        q(sb.from('action_log').select(LOG_COLS).eq('action_id', id).order('id'))
      ]);
      if (!res[0]) return null;
      const a = mapAction(res[0]); a.log = res[1].map(mapLog); return a;
    },
    async getStudent(id){ const r = await q(sb.from('students').select('id,name,cls,phone,notes,created_by').eq('id', id).maybeSingle()); return r ? mapStudent(r) : null; },
    subscribe(h){
      const ch = sb.channel('school-db')
        .on('postgres_changes', {event:'*', schema:'public', table:'actions'}, p => h.action(p.eventType, p.new && p.new.id ? mapAction(p.new) : null, p.old && p.old.id))
        .on('postgres_changes', {event:'INSERT', schema:'public', table:'action_log'}, p => h.log(mapLog(p.new)))
        .on('postgres_changes', {event:'*', schema:'public', table:'students'}, p => h.student(p.eventType, p.new && p.new.id ? mapStudent(p.new) : null, p.old && p.old.id))
        .on('postgres_changes', {event:'*', schema:'public', table:'staff'}, p => h.staff(p.eventType, p.new && p.new.id ? mapStaff(p.new) : null, p.old && p.old.id))
        .on('postgres_changes', {event:'*', schema:'public', table:'absence_sheets'}, p => h.absence(p.eventType, p.new && p.new.id ? mapAbsence(p.new) : null, p.old && p.old.id))
        .on('postgres_changes', {event:'*', schema:'public', table:'violation_sheets'}, p => h.violation(p.eventType, p.new && p.new.id ? mapViol(p.new) : null, p.old && p.old.id))
        .on('postgres_changes', {event:'*', schema:'public', table:'wings'}, p => h.wing(p.eventType, p.new && p.new.id ? mapWing(p.new) : null, p.old && p.old.id))
        .subscribe(status => { if (h.status) h.status(status); });
      return () => sb.removeChannel(ch);
    },

    createAction(a){
      return q(sb.rpc('create_action', {
        p_student_id: a.studentId || null, p_type: a.type, p_violation: a.violation, p_details: a.details || '', p_date: a.date,
        p_summon_date: a.summonDate || null, p_summon_time: a.summonTime || null,
        p_suspend_days: a.suspendDays || null, p_suspend_from: a.suspendFrom || null, p_suspend_to: a.suspendTo || null,
        p_report_to: a.to || null, p_new_student_name: a.newStudentName || null, p_new_student_cls: a.newStudentCls || null
      }));
    },
    async moveAction(id, to, note){ await q(sb.rpc('move_action', {p_id:id, p_to:to, p_note:note || ''})); },
    async reschedAction(id, date, time, note){ await q(sb.rpc('resched_action', {p_id:id, p_date:date, p_time:time || null, p_note:note || ''})); },
    // تسجيل التواصل مع ولي الأمر في الاستدعاء والفصل، أو إلغاؤه
    async markContact(id, done, note){ await q(sb.rpc('mark_contact', {p_id:id, p_done:!!done, p_note:note || ''})); },
    // الأجنحة: اسم الجناح وفصوله ومشرفوه، أو جناح مشرف واحد (لمسؤول الموقع والمشرف العام والوكيل والمدير)
    async setWing(id, name, classes, supervisors){ await q(sb.rpc('set_wing', {p_id:id, p_name:name, p_classes:classes, p_supervisors:supervisors})); },
    async setStaffWing(id, wing){ await q(sb.rpc('set_staff_wing', {p_id:id, p_wing:wing || null})); },
    // الغياب اليومي: حفظ فصل (مسودة)، ثم اعتماد الإرسال لشؤون الطلبة، أو إلغاؤه للتعديل
    saveAbsence(day, cls, ids){ return q(sb.rpc('save_absence', {p_day:day, p_cls:cls, p_absent:ids})); },
    // ورقة الفصل كاملة: الغائبون، وما سُجّل على الحاضرين {late:[ids], uniform:[ids], hair:[ids]}
    saveDaily(day, cls, ids, marks){ return q(sb.rpc('save_daily', {p_day:day, p_cls:cls, p_absent:ids, p_marks:marks})); },
    // مخالفات الزي والشعر لفصل في يوم (المشرف العام): {uniform:[ids], hair:[ids]}
    saveViolations(day, cls, marks){ return q(sb.rpc('save_violations', {p_day:day, p_cls:cls, p_marks:marks})); },
    sendAbsence(day, classes){ return q(sb.rpc('send_absence', {p_day:day, p_classes:classes})); },
    unsendAbsence(day, classes){ return q(sb.rpc('unsend_absence', {p_day:day, p_classes:classes})); },
    async deleteAction(id){
      const rows = await q(sb.from('actions').delete().eq('id', id).select('id'));
      if (!rows.length) throw fail({code:'42501', message:'not_allowed'});
    },

    async addStudent(s){
      const r = await q(sb.from('students').insert({name:s.name, cls:s.cls, phone:s.phone || '', notes:s.notes || ''}).select('id,name,cls,phone,notes,created_by').single());
      return mapStudent(r);
    },
    async updateStudent(id, s){
      const rows = await q(sb.from('students').update({name:s.name, cls:s.cls, phone:s.phone || '', notes:s.notes || ''}).eq('id', id).select('id,name,cls,phone,notes,created_by'));
      if (!rows.length) throw fail({code:'42501', message:'not_allowed'});
      return mapStudent(rows[0]);
    },
    async deleteStudent(id){
      const rows = await q(sb.from('students').delete().eq('id', id).select('id'));
      if (!rows.length) throw fail({code:'42501', message:'not_allowed'});
    },
    async importStudents(rows, onProgress){
      let done = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200).map(r => ({name:r.name, cls:r.cls, phone:r.phone || ''}));
        await q(sb.from('students').insert(chunk));
        done += chunk.length;
        if (onProgress) onProgress(done);
      }
      return done;
    },
    async savePrefs(p, uid){
      await q(sb.from('prefs').upsert({user_id:uid, notify:!!p.notify, sound:!!p.sound, types:p.types, last_seen:new Date(p.lastSeen || Date.now()).toISOString()}));
    },

    // إشعارات الجهاز (Web Push): المفتاح العام، وحفظ اشتراك هذا الجهاز أو إيقافه، وإشعار تجريبي
    pushKey(){ return q(sb.rpc('push_key')); },
    async savePush(s){ const k = (s && s.keys) || {}; await q(sb.rpc('save_push', {p_endpoint:s.endpoint, p_p256dh:k.p256dh, p_auth:k.auth})); },
    async dropPush(endpoint){ await q(sb.rpc('drop_push', {p_endpoint:endpoint})); },
    testPush(){ return q(sb.rpc('push_test')); }
  };
})();
