-- 1) فصول الجناح لكل مشرف: تحدد ما يظهر له في الرئيسية وما يصله من إشعارات، وفصول الغياب اليومي.
-- 2) الغياب اليومي: يسجله المشرف لكل فصل، ويصل شؤون الطلبة بعد أن يعتمده.
-- 3) التقارير لا تُرفع لأحد: تُحفظ في سجل الطالب فقط، بلا حالة متابعة.

-- ===== فصول الجناح =====
alter table public.staff add column classes text[] not null default '{}';

-- يحددها مسؤول الموقع أو المشرف العام أو الوكيل أو المدير
create or replace function public.set_staff_classes(p_id uuid, p_classes text[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_list text[];
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (private.is_admin() or v_role = any (private.overseer_roles())) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select coalesce(array_agg(c order by c), '{}') into v_list
    from (select distinct btrim(x) as c from unnest(coalesce(p_classes, '{}')) x) t where c <> '';
  if cardinality(v_list) > 40 or exists (select 1 from unnest(v_list) c where length(c) > 20) then
    raise exception 'bad_class' using errcode = '22023';
  end if;
  update public.staff set classes = v_list where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.set_staff_classes(uuid, text[]) from public, anon;
grant execute on function public.set_staff_classes(uuid, text[]) to authenticated;

-- ===== الغياب اليومي: ورقة لكل فصل في كل يوم =====
create table public.absence_sheets (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  cls text not null check (length(btrim(cls)) between 1 and 20),
  total int not null default 0 check (total between 0 and 500),
  absent jsonb not null default '[]'::jsonb,   -- [{id, name}] نسخة من أسماء الغائبين وقت التسجيل
  status text not null default 'draft' check (status in ('draft', 'sent')),
  created_by uuid references public.staff(id) on delete set null,
  updated_by uuid references public.staff(id) on delete set null,
  sent_by uuid references public.staff(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (day, cls)
);
alter table public.absence_sheets enable row level security;
create policy absence_read on public.absence_sheets for select to authenticated using (private.is_staff());
revoke insert, update, delete, truncate on public.absence_sheets from anon, authenticated;
alter publication supabase_realtime add table public.absence_sheets;

-- حفظ غياب فصل (مسودة). يُرفض إذا أُرسلت الورقة؛ للتعديل بعد الإرسال يُلغى الإرسال أولاً.
create or replace function public.save_absence(p_day date, p_cls text, p_absent uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_cls text := btrim(coalesce(p_cls, ''));
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_absent, '{}')) x where x is not null);
  v_status text;
  v_total int;
  v_list jsonb;
  v_id uuid;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (v_role = any (private.recorder_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_cls = '' or length(v_cls) > 20 then raise exception 'bad_class' using errcode = '22023'; end if;
  if p_day is null or p_day < current_date - 7 or p_day > current_date + 1 then raise exception 'bad_day' using errcode = '22023'; end if;
  select status into v_status from public.absence_sheets where day = p_day and cls = v_cls for update;
  if v_status = 'sent' then raise exception 'already_sent' using errcode = '22023'; end if;
  select count(*) into v_total from public.students where cls = v_cls;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb) into v_list
    from public.students s where s.cls = v_cls and s.id = any (v_ids);
  if jsonb_array_length(v_list) <> cardinality(v_ids) then raise exception 'student_not_in_class' using errcode = '22023'; end if;
  insert into public.absence_sheets (day, cls, total, absent, status, created_by, updated_by)
    values (p_day, v_cls, v_total, v_list, 'draft', auth.uid(), auth.uid())
  on conflict (day, cls) do update
    set total = excluded.total, absent = excluded.absent, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- اعتماد الغياب وإرساله لشؤون الطلبة (الفصول المحفوظة في ذلك اليوم)
create or replace function public.send_absence(p_day date, p_classes text[])
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_n int;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (v_role = any (private.recorder_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.absence_sheets set status = 'sent', sent_at = now(), sent_by = auth.uid(), updated_at = now()
   where day = p_day and cls = any (coalesce(p_classes, '{}')) and status = 'draft';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- إلغاء الإرسال للتعديل
create or replace function public.unsend_absence(p_day date, p_classes text[])
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_n int;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (v_role = any (private.recorder_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.absence_sheets set status = 'draft', sent_at = null, sent_by = null, updated_by = auth.uid(), updated_at = now()
   where day = p_day and cls = any (coalesce(p_classes, '{}')) and status = 'sent';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.save_absence(date, text, uuid[]), public.send_absence(date, text[]), public.unsend_absence(date, text[]) from public, anon;
grant execute on function public.save_absence(date, text, uuid[]), public.send_absence(date, text[]), public.unsend_absence(date, text[]) to authenticated;

-- ===== التقارير: تُحفظ في سجل الطالب فقط =====
create or replace function public.create_action(
  p_student_id uuid,
  p_type text,
  p_violation text,
  p_details text,
  p_date date,
  p_summon_date date default null,
  p_summon_time time default null,
  p_suspend_days int default null,
  p_suspend_from date default null,
  p_suspend_to date default null,
  p_report_to text default null,
  p_new_student_name text default null,
  p_new_student_cls text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_sid uuid := p_student_id;
  v_name text;
  v_cls text;
  v_status text;
  v_id uuid;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (v_role = any (private.recorder_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_type not in ('pledge','report','summon','suspend') then raise exception 'bad_type' using errcode = '22023'; end if;
  if coalesce(btrim(p_violation), '') = '' then raise exception 'violation_required' using errcode = '22023'; end if;
  if p_date is null then raise exception 'date_required' using errcode = '22023'; end if;
  if p_type = 'summon' and p_summon_date is null then raise exception 'summon_date_required' using errcode = '22023'; end if;
  if p_type = 'suspend' and (p_suspend_days is null or p_suspend_from is null or p_suspend_to is null) then
    raise exception 'suspend_period_required' using errcode = '22023';
  end if;

  if v_sid is null then
    if coalesce(btrim(p_new_student_name), '') = '' then raise exception 'student_required' using errcode = '22023'; end if;
    insert into public.students (name, cls, created_by)
      values (btrim(p_new_student_name), coalesce(btrim(p_new_student_cls), ''), auth.uid())
      returning id, name, cls into v_sid, v_name, v_cls;
  else
    select name, cls into v_name, v_cls from public.students where id = v_sid;
    if v_name is null then raise exception 'student_not_found' using errcode = 'P0002'; end if;
  end if;

  v_status := case p_type
    when 'pledge' then 'open'
    when 'report' then 'filed'
    when 'summon' then 'scheduled'
    else case when v_role = any (private.approver_roles()) then 'approved' else 'pending' end
  end;

  insert into public.actions (student_id, student_name, cls, type, status, violation, details, date,
      summon_date, summon_time, suspend_days, suspend_from, suspend_to, report_to, created_by)
    values (v_sid, v_name, v_cls, p_type, v_status, btrim(p_violation), coalesce(p_details, ''), p_date,
      case when p_type = 'summon' then p_summon_date end,
      case when p_type = 'summon' then p_summon_time end,
      case when p_type = 'suspend' then p_suspend_days end,
      case when p_type = 'suspend' then p_suspend_from end,
      case when p_type = 'suspend' then p_suspend_to end,
      null,
      auth.uid())
    returning id into v_id;

  insert into public.action_log (action_id, by, ev, to_status) values (v_id, auth.uid(), 'created', v_status);
  return v_id;
end $$;

-- التقارير بلا حالات: لا يُغيَّر لها شيء
create or replace function public.move_action(p_id uuid, p_to text, p_note text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  a public.actions%rowtype;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (v_role = any (private.recorder_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into a from public.actions where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (
       (a.type = 'pledge'  and p_to in ('open','signed'))
    or (a.type = 'summon'  and p_to in ('scheduled','attended','absent'))
    or (a.type = 'suspend' and p_to in ('pending','approved','rejected'))
  ) then raise exception 'bad_status' using errcode = '22023'; end if;
  if a.type = 'suspend' and not (v_role = any (private.approver_roles())) then
    raise exception 'not_approver' using errcode = '42501';
  end if;
  if a.status = p_to then return; end if;
  update public.actions set status = p_to, updated_at = now() where id = p_id;
  insert into public.action_log (action_id, by, ev, to_status, note)
    values (p_id, auth.uid(), 'status', p_to, coalesce(btrim(p_note), ''));
end $$;
