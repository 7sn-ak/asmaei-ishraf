-- إشعارات تصل للجوال حتى والموقع مغلق (Web Push).
--
-- كيف تعمل:
-- 1) كل جهاز يفعّل الإشعارات من شاشة الجرس يُحفظ اشتراكه في private.push_subs (الدالة save_push).
-- 2) عند كل حدث يخص أحداً — بنفس قواعد الجرس في الموقع (relevant في site/js/core.js) — تُضاف رسالة
--    لكل مستلم مفعِّل للإشعارات في private.push_outbox، ثم تُنبَّه وظيفة الخادم push عبر pg_net.
-- 3) الوظيفة تقرأ الرسائل بالمفتاح السري (push_claim)، وترسلها مشفّرة لأجهزة المستلم، وتسجل النتيجة (push_result).
--
-- الخصوصية: نص الإشعار عام بلا أسماء الطلاب لأنه يظهر على شاشة القفل، وتفاصيله داخل السجل.
-- السلامة: أي خطأ في الإشعارات يُتجاهل ولا يوقف تسجيل الإجراءات أو الغياب.

create extension if not exists pg_net;

-- ===== اشتراكات الأجهزة =====
create table private.push_subs (
  id bigint generated always as identity primary key,
  staff_id uuid not null references public.staff(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  active boolean not null default true,
  fails int not null default 0,
  last_ok_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subs_staff_idx on private.push_subs (staff_id) where active;

-- ===== صندوق الإشعارات: رسالة لكل مستلم =====
create table private.push_outbox (
  id bigint generated always as identity primary key,
  staff_id uuid not null references public.staff(id) on delete cascade,
  payload jsonb not null,            -- {title, body, tag, open}
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  tries int not null default 0,
  done_at timestamptz
);
create index push_outbox_pending_idx on private.push_outbox (id) where done_at is null;

-- لا يصل إليهما أحد من الإنترنت: فقط الدوال أدناه
alter table private.push_subs enable row level security;
alter table private.push_outbox enable row level security;
revoke all on private.push_subs, private.push_outbox from public, anon, authenticated;

-- ===== التاريخ والوقت بالعربي لنص الإشعار (توقيت الكويت) =====
create or replace function private.kw_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Kuwait')::date $$;

create or replace function private.ar_day(d date) returns text
language sql stable strict set search_path = '' as $$
  select case
    when d = private.kw_today() then 'اليوم'
    when d = private.kw_today() + 1 then 'غداً'
    when d = private.kw_today() - 1 then 'أمس'
    else (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from d)::int + 1]
      || ' ' || extract(day from d)::int || ' '
      || (array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'])[extract(month from d)::int]
  end
$$;

create or replace function private.ar_time(t time) returns text
language sql immutable strict set search_path = '' as $$
  select ((extract(hour from t)::int + 11) % 12 + 1) || ':' || lpad(extract(minute from t)::int::text, 2, '0')
    || case when extract(hour from t) < 12 then ' ص' else ' م' end
$$;

create or replace function private.ar_days(n int) returns text
language sql immutable strict set search_path = '' as $$
  select case when n = 1 then 'يوم واحد' when n = 2 then 'يومان' when n <= 10 then n || ' أيام' else n || ' يوماً' end
$$;

-- ===== تنبيه وظيفة الخادم push لترسل ما في الصندوق =====
-- مرة واحدة لكل عملية، ويُرسل الطلب بعد حفظ العملية فقط (pg_net)
create or replace function private.push_kick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('ishraf.push_kick', true) = 'on' then return; end if;
  perform set_config('ishraf.push_kick', 'on', true);
  perform net.http_post(
    url := 'https://steriboxkchbvqyumfvt.supabase.co/functions/v1/push',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 25000);
end $$;

-- رسالة لكل مستلم نشط مفعِّل للإشعارات وله جهاز مشترك (p_force: رسالة التجربة تتجاوز التفضيل)
create or replace function private.push_enqueue(p_to uuid[], p_payload jsonb, p_force boolean default false)
returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into private.push_outbox (staff_id, payload)
  select s.id, p_payload from public.staff s
   where s.id = any (coalesce(p_to, '{}')) and s.active
     and (p_force or exists (select 1 from public.prefs p where p.user_id = s.id and p.notify))
     and exists (select 1 from private.push_subs x where x.staff_id = s.id and x.active);
  get diagnostics v_n = row_count;
  if v_n > 0 then perform private.push_kick(); end if;
  return v_n;
end $$;

-- ===== من يصله إشعار عن حدث في قيد (نفس قواعد الجرس في الموقع) =====
-- 1) صاحب القيد: كل ما يفعله غيره في قيده
-- 2) شؤون الطلبة: كل استدعاء جديد أو موعد جديد، وكل فصل يُعتمد
-- 3) قيد جديد: طلب الفصل للمدير والوكيل والمشرف العام دائماً، ولغيرهم حسب أنواع الإشعارات التي اختاروها،
--    والمشرف الذي حُددت فصول جناحه تصله فصوله فقط. التقارير لا تُرسل لأحد.
create or replace function private.push_on_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a public.actions%rowtype;
  v_cls text; v_who text; v_when text; v_label text; v_title text; v_verb text;
  v_done uuid[]; v_to uuid[]; v_tag jsonb;
begin
  begin
    -- الأحداث الحية فقط (لا ما يُضاف بتاريخ قديم مثل البيانات التجريبية)
    if new."by" is null or new.at < now() - interval '5 minutes' or new.at > now() + interval '1 minute' then return null; end if;
    select * into a from public.actions where id = new.action_id;
    if not found or a.type not in ('pledge', 'summon', 'suspend') then return null; end if;
    v_cls := coalesce(nullif((select s.cls from public.students s where s.id = a.student_id), ''), nullif(a.cls, ''));
    v_who := coalesce((select s.name from public.staff s where s.id = new."by"), 'زميل');
    v_label := case a.type when 'pledge' then 'تعهد' when 'summon' then 'استدعاء' else 'فصل' end;
    v_when := case a.type
      when 'summon' then 'الموعد ' || private.ar_day(a.summon_date) || coalesce(' ' || private.ar_time(a.summon_time), '')
      when 'suspend' then private.ar_days(a.suspend_days) || ' · يبدأ ' || private.ar_day(a.suspend_from)
      else a.violation end;
    v_tag := jsonb_build_object('tag', 'a-' || a.id, 'open', 'a:' || a.id);
    v_done := array[new."by"];

    -- 1) صاحب القيد
    if a.created_by is not null and a.created_by <> new."by" then
      v_title := case when new.ev = 'resched' then 'تغيّر موعد الاستدعاء' else case new.to_status
        when 'signed' then 'تم توقيع التعهد'
        when 'open' then 'أُعيد فتح التعهد'
        when 'attended' then 'حضر ولي الأمر'
        when 'absent' then 'لم يحضر ولي الأمر'
        when 'scheduled' then 'أُعيد الاستدعاء إلى موعد قادم'
        when 'approved' then 'اعتُمد طلب الفصل'
        when 'rejected' then 'رُفض طلب الفصل'
        when 'pending' then 'أُعيد طلب الفصل إلى الاعتماد'
        when 'contacted' then 'تم التواصل مع ولي الأمر'
        when 'uncontacted' then 'أُلغي تسجيل التواصل مع ولي الأمر'
        else 'تحديث على قيد سجلته' end end;
      v_verb := case when new.ev = 'resched' then 'غيّره ' when new.to_status = 'approved' then 'اعتمده '
                     when new.to_status = 'rejected' then 'رفضه ' else '' end;
      perform private.push_enqueue(array[a.created_by], v_tag || jsonb_build_object(
        'title', v_title, 'body', concat_ws(' · ', v_label, v_cls, v_when, v_verb || v_who)));
      v_done := v_done || a.created_by;
    end if;

    -- 2) شؤون الطلبة
    if (a.type = 'summon' and new.ev in ('created', 'resched')) or (a.type = 'suspend' and new.to_status = 'approved') then
      select coalesce(array_agg(s.id), '{}') into v_to from public.staff s
       where s.active and s.role = 'affairs' and s.id <> all (v_done);
      if cardinality(v_to) > 0 then
        v_title := case when a.type = 'suspend' then 'فصل معتمد: تواصل مع ولي الأمر'
                        when new.ev = 'resched' then 'موعد جديد لاستدعاء ولي أمر'
                        else 'استدعاء ولي أمر جديد' end;
        v_verb := case when a.type = 'suspend' then 'اعتمده ' when new.ev = 'resched' then 'غيّره ' else 'سجّله ' end;
        perform private.push_enqueue(v_to, v_tag || jsonb_build_object(
          'title', v_title, 'body', concat_ws(' · ', v_cls, v_when, v_verb || v_who)));
        v_done := v_done || v_to;
      end if;
    end if;

    -- 3) قيد جديد
    if new.ev = 'created' then
      if a.type = 'suspend' then
        select coalesce(array_agg(s.id), '{}') into v_to from public.staff s
         where s.active and s.role = any (private.approver_roles()) and s.id <> all (v_done);
        if cardinality(v_to) > 0 then
          perform private.push_enqueue(v_to, v_tag || jsonb_build_object(
            'title', case when a.status = 'pending' then 'طلب فصل بانتظار اعتمادك' else 'فصل معتمد جديد' end,
            'body', concat_ws(' · ', v_cls, v_when, 'سجّله ' || v_who)));
          v_done := v_done || v_to;
        end if;
      end if;
      select coalesce(array_agg(s.id), '{}') into v_to
        from public.staff s left join public.prefs p on p.user_id = s.id
       where s.active and s.id <> all (v_done)
         and coalesce(p.types -> a.type, 'true'::jsonb) not in ('false'::jsonb, 'null'::jsonb, '0'::jsonb, '""'::jsonb)
         and (s.role <> 'supervisor' or cardinality(s.classes) = 0 or v_cls = any (s.classes));
      if cardinality(v_to) > 0 then
        perform private.push_enqueue(v_to, v_tag || jsonb_build_object(
          'title', case a.type when 'pledge' then 'تعهد جديد' when 'summon' then 'استدعاء ولي أمر جديد'
                     else case when a.status = 'pending' then 'طلب فصل بانتظار الاعتماد' else 'فصل معتمد جديد' end end,
          'body', concat_ws(' · ', v_cls, v_when, 'سجّله ' || v_who)));
      end if;
    end if;
  exception when others then
    raise warning 'push_on_log: % %', sqlstate, sqlerrm;
  end;
  return null;
end $$;
create trigger action_log_push after insert on public.action_log
  for each row execute function private.push_on_log();

-- ===== الغياب اليومي: يصل شؤون الطلبة عند اعتماده (إشعار واحد لكل مشرف في كل يوم) =====
create or replace function private.push_on_absence() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_to uuid[];
begin
  begin
    for r in
      select n.day, n.sent_by, count(*)::int as k, coalesce(sum(jsonb_array_length(n.absent)), 0)::int as m,
             string_agg(n.cls, '، ' order by length(n.cls), n.cls) as classes
        from new_rows n join old_rows o on o.id = n.id
       where n.status = 'sent' and o.status is distinct from 'sent'
       group by n.day, n.sent_by
    loop
      select coalesce(array_agg(s.id), '{}') into v_to from public.staff s
       where s.active and s.role = 'affairs' and s.id is distinct from r.sent_by;
      perform private.push_enqueue(v_to, jsonb_build_object(
        'title', 'وصل غياب ' || coalesce(private.ar_day(r.day), ''),
        'body', r.m || ' غائب في ' || r.k || case when r.k = 1 then ' فصل: ' else ' فصول: ' end || r.classes
                || ' · اعتمده ' || coalesce((select s.name from public.staff s where s.id = r.sent_by), 'زميل'),
        'tag', 'abs-' || r.day, 'open', 'abs:' || r.day));
    end loop;
  exception when others then
    raise warning 'push_on_absence: % %', sqlstate, sqlerrm;
  end;
  return null;
end $$;
create trigger absence_sheets_push after update on public.absence_sheets
  referencing old table as old_rows new table as new_rows
  for each statement execute function private.push_on_absence();

-- ===== من المتصفح =====
-- المفتاح العام للإشعارات. وظيفة الخادم push تولّد المفتاحين أول مرة وتحفظهما في app_secrets،
-- ولا يخرج المفتاح الخاص منها.
create or replace function public.push_key() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'not_staff' using errcode = '42501'; end if;
  return (select value::jsonb ->> 'public' from public.app_secrets where key = 'vapid');
end $$;

-- تفعيل الإشعارات على هذا الجهاز (أو ربطه بمن سجّل الدخول الآن)
-- الاشتراك لخوادم الإشعارات المعروفة فقط: Google وApple وMozilla وMicrosoft
create or replace function public.save_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_host text := substring(coalesce(p_endpoint, '') from '^https://([a-z0-9.-]+)/');
begin
  if not private.is_staff() then raise exception 'not_staff' using errcode = '42501'; end if;
  if length(p_endpoint) > 1000 or v_host is null or v_host !~ ('^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com'
       || '|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$') then
    raise exception 'bad_endpoint' using errcode = '22023';
  end if;
  if coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_+/-]{87}=?$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_+/-]{22}(==)?$' then
    raise exception 'bad_keys' using errcode = '22023';
  end if;
  insert into private.push_subs (staff_id, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set staff_id = excluded.staff_id, p256dh = excluded.p256dh, auth = excluded.auth,
        active = true, fails = 0, updated_at = now();
  -- عشرة أجهزة على الأكثر لكل شخص: يتوقف أقدمها
  update private.push_subs set active = false, updated_at = now()
   where staff_id = auth.uid() and active
     and id not in (select x.id from private.push_subs x where x.staff_id = auth.uid() and x.active
                     order by x.updated_at desc, x.id desc limit 10);
end $$;

-- إيقاف الإشعارات على هذا الجهاز (وعند تسجيل الخروج)
create or replace function public.drop_push(p_endpoint text)
returns void
language sql security definer set search_path = '' as $$
  update private.push_subs set active = false, updated_at = now()
   where endpoint = p_endpoint and staff_id = auth.uid() and active
$$;

-- إشعار تجريبي لأجهزتي. يرجع عدد الأجهزة المفعّلة.
create or replace function public.push_test()
returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not private.is_staff() then raise exception 'not_staff' using errcode = '42501'; end if;
  if exists (select 1 from private.push_outbox where staff_id = auth.uid() and payload ->> 'tag' = 'test'
              and created_at > now() - interval '20 seconds') then
    raise exception 'too_fast' using errcode = '22023';
  end if;
  select count(*) into v_n from private.push_subs where staff_id = auth.uid() and active;
  if v_n > 0 then
    perform private.push_enqueue(array[auth.uid()], jsonb_build_object(
      'title', 'تجربة الإشعارات',
      'body', 'وصلك هذا الإشعار، فستصلك تنبيهات السجل على هذا الجهاز حتى والموقع مغلق.',
      'tag', 'test', 'open', 'inbox'), true);
  end if;
  return v_n;
end $$;

-- ===== لوظيفة الخادم push فقط (بالمفتاح السري) =====
-- تحجز رسائل لم تُرسل، وترجع لكل رسالة أجهزة مستلمها
create or replace function public.push_claim(p_limit int default 200)
returns table (outbox_id bigint, sub_id bigint, endpoint text, p256dh text, auth text, payload jsonb)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_ids bigint[];
begin
  -- ما مضى عليه يوم، أو تعثّر إرساله ثلاث مرات، لا فائدة منه
  update private.push_outbox o set done_at = now()
   where o.done_at is null and (o.created_at < now() - interval '1 day' or o.tries >= 3);
  select coalesce(array_agg(c.id), '{}') into v_ids from (
    select x.id from private.push_outbox x
     where x.done_at is null and (x.claimed_at is null or x.claimed_at < now() - interval '2 minutes')
     order by x.id limit greatest(1, least(coalesce(p_limit, 200), 500))
     for update skip locked) c;
  update private.push_outbox o set claimed_at = now(), tries = o.tries + 1 where o.id = any (v_ids);
  -- من ليس له جهاز مفعّل الآن تُغلق رسالته
  update private.push_outbox o set done_at = now()
   where o.id = any (v_ids) and not exists (select 1 from private.push_subs s where s.staff_id = o.staff_id and s.active);
  return query
    select o.id, s.id, s.endpoint, s.p256dh, s.auth, o.payload
      from private.push_outbox o join private.push_subs s on s.staff_id = o.staff_id and s.active
     where o.id = any (v_ids) and o.done_at is null
     order by o.id, s.id;
end $$;

-- نتيجة الإرسال: الرسائل التي انتهت، والأجهزة التي وصلها، والتي انتهى اشتراكها، والتي تعثّر الإرسال لها
create or replace function public.push_result(p_done bigint[], p_ok bigint[], p_gone bigint[], p_failed bigint[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.push_outbox set done_at = now() where id = any (coalesce(p_done, '{}')) and done_at is null;
  update private.push_subs set fails = 0, last_ok_at = now() where id = any (coalesce(p_ok, '{}'));
  update private.push_subs set active = false, updated_at = now() where id = any (coalesce(p_gone, '{}'));
  -- عشر محاولات متتالية فاشلة: يتوقف الجهاز حتى يُفعَّل من جديد
  update private.push_subs set fails = fails + 1, active = active and fails + 1 < 10, updated_at = now()
   where id = any (coalesce(p_failed, '{}'));
end $$;

-- ===== من يستدعي الدوال =====
revoke all on function public.push_key(), public.save_push(text, text, text), public.drop_push(text), public.push_test() from public, anon;
grant execute on function public.push_key(), public.save_push(text, text, text), public.drop_push(text), public.push_test() to authenticated;
revoke all on function public.push_claim(int), public.push_result(bigint[], bigint[], bigint[], bigint[]) from public, anon, authenticated;
grant execute on function public.push_claim(int), public.push_result(bigint[], bigint[], bigint[], bigint[]) to service_role;
revoke all on function private.kw_today(), private.ar_day(date), private.ar_time(time), private.ar_days(int),
  private.push_kick(), private.push_enqueue(uuid[], jsonb, boolean), private.push_on_log(), private.push_on_absence()
  from public, anon, authenticated;
