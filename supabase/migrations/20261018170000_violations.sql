-- مخالفات الزي والشعر (طلب 18 أكتوبر، بعد الجولة اليومية): يسجلها المشرف العام وحده، ويصل إشعارها لمشرف جناح
-- الطالب فقط، ولا تُرسل لشؤون الطلبة. ورقة الغياب عند مشرف الجناح: الغياب والتأخير الصباحي فقط.

-- ===== ورقة الغياب: التأخير فقط مع الغياب =====
create or replace function private.mark_kinds() returns text[]
language sql immutable set search_path = '' as $$ select array['late'] $$;

-- مثل السابقة، مع قبول نوع غير معروف إذا كان فارغاً: نسخة الموقع المحفوظة في الأجهزة قبل هذا التحديث
-- ترسل الزي والشعر فارغين مع كل حفظ، فلا يتعطل حفظ الغياب عندها.
create or replace function public.save_daily(p_day date, p_cls text, p_absent uuid[], p_marks jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_cls text := btrim(coalesce(p_cls, ''));
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_absent, '{}')) x where x is not null);
  v_in jsonb := coalesce(p_marks, '{}'::jsonb);
  v_marks jsonb := '{}'::jsonb;
  v_k text;
  v_kids uuid[];
  v_list jsonb;
  v_alist jsonb;
  v_status text;
  v_total int;
  v_id uuid;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (v_role = any (private.recorder_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_cls = '' or length(v_cls) > 20 then raise exception 'bad_class' using errcode = '22023'; end if;
  if p_day is null or p_day < current_date - 7 or p_day > current_date + 1 then raise exception 'bad_day' using errcode = '22023'; end if;
  if extract(isodow from p_day) in (5, 6) then raise exception 'weekend' using errcode = '22023'; end if;
  if jsonb_typeof(v_in) <> 'object' then raise exception 'bad_marks' using errcode = '22023'; end if;
  for v_k in select jsonb_object_keys(v_in) loop
    if jsonb_typeof(v_in -> v_k) <> 'array'
       or (not (v_k = any (private.mark_kinds())) and jsonb_array_length(v_in -> v_k) > 0) then
      raise exception 'bad_marks' using errcode = '22023';
    end if;
  end loop;
  select status into v_status from public.absence_sheets where day = p_day and cls = v_cls for update;
  if v_status = 'sent' then raise exception 'already_sent' using errcode = '22023'; end if;
  select count(*) into v_total from public.students where cls = v_cls;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb) into v_alist
    from public.students s where s.cls = v_cls and s.id = any (v_ids);
  if jsonb_array_length(v_alist) <> cardinality(v_ids) then raise exception 'student_not_in_class' using errcode = '22023'; end if;
  foreach v_k in array private.mark_kinds() loop
    continue when not (v_in ? v_k);
    begin
      v_kids := array(select distinct (x #>> '{}')::uuid from jsonb_array_elements(v_in -> v_k) x where x #>> '{}' is not null);
    exception when invalid_text_representation then
      raise exception 'bad_marks' using errcode = '22023';
    end;
    continue when cardinality(v_kids) = 0;
    if v_kids && v_ids then raise exception 'absent_marked' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb) into v_list
      from public.students s where s.cls = v_cls and s.id = any (v_kids);
    if jsonb_array_length(v_list) <> cardinality(v_kids) then raise exception 'student_not_in_class' using errcode = '22023'; end if;
    v_marks := v_marks || jsonb_build_object(v_k, v_list);
  end loop;
  insert into public.absence_sheets (day, cls, total, absent, marks, status, created_by, updated_by)
    values (p_day, v_cls, v_total, v_alist, v_marks, 'draft', auth.uid(), auth.uid())
  on conflict (day, cls) do update
    set total = excluded.total, absent = excluded.absent, marks = excluded.marks, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- ===== مخالفات الزي والشعر: ورقة لكل فصل في كل يوم، يكتبها المشرف العام =====
-- أنواع المخالفات. لإضافة نوع: أضفه هنا (migration جديد) وفي VIOLS في site/js/core.js
create or replace function private.viol_kinds() returns text[]
language sql immutable set search_path = '' as $$ select array['uniform', 'hair'] $$;
revoke all on function private.viol_kinds() from public, anon;
grant execute on function private.viol_kinds() to authenticated, service_role;

create table public.violation_sheets (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  cls text not null check (length(btrim(cls)) between 1 and 20),
  -- {"uniform":[{id,name}], "hair":[{id,name}]}: نسخة من الأسماء وقت التسجيل
  marks jsonb not null default '{}'::jsonb check (jsonb_typeof(marks) = 'object'),
  created_by uuid references public.staff(id) on delete set null,
  updated_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (day, cls)
);
alter table public.violation_sheets enable row level security;
create policy violation_read on public.violation_sheets for select to authenticated using (private.is_staff());
revoke insert, update, delete, truncate on public.violation_sheets from anon, authenticated;
alter publication supabase_realtime add table public.violation_sheets;

-- حفظ مخالفات فصل في يوم (للمشرف العام فقط). الغائب في ورقة غياب ذلك اليوم لا تُسجَّل عليه مخالفة.
create or replace function public.save_violations(p_day date, p_cls text, p_marks jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_cls text := btrim(coalesce(p_cls, ''));
  v_in jsonb := coalesce(p_marks, '{}'::jsonb);
  v_marks jsonb := '{}'::jsonb;
  v_k text;
  v_kids uuid[];
  v_list jsonb;
  v_absent uuid[];
  v_id uuid;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if v_role <> 'head' then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_cls = '' or length(v_cls) > 20 then raise exception 'bad_class' using errcode = '22023'; end if;
  if p_day is null or p_day < current_date - 7 or p_day > current_date then raise exception 'bad_day' using errcode = '22023'; end if;
  if extract(isodow from p_day) in (5, 6) then raise exception 'weekend' using errcode = '22023'; end if;
  if jsonb_typeof(v_in) <> 'object' then raise exception 'bad_marks' using errcode = '22023'; end if;
  for v_k in select jsonb_object_keys(v_in) loop
    if not (v_k = any (private.viol_kinds())) or jsonb_typeof(v_in -> v_k) <> 'array' then
      raise exception 'bad_marks' using errcode = '22023';
    end if;
  end loop;
  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into v_absent
    from public.absence_sheets a, jsonb_array_elements(a.absent) e where a.day = p_day and a.cls = v_cls;
  perform 1 from public.violation_sheets where day = p_day and cls = v_cls for update;
  foreach v_k in array private.viol_kinds() loop
    continue when not (v_in ? v_k);
    begin
      v_kids := array(select distinct (x #>> '{}')::uuid from jsonb_array_elements(v_in -> v_k) x where x #>> '{}' is not null);
    exception when invalid_text_representation then
      raise exception 'bad_marks' using errcode = '22023';
    end;
    continue when cardinality(v_kids) = 0;
    if v_kids && v_absent then raise exception 'absent_marked' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb) into v_list
      from public.students s where s.cls = v_cls and s.id = any (v_kids);
    if jsonb_array_length(v_list) <> cardinality(v_kids) then raise exception 'student_not_in_class' using errcode = '22023'; end if;
    v_marks := v_marks || jsonb_build_object(v_k, v_list);
  end loop;
  insert into public.violation_sheets (day, cls, marks, created_by, updated_by)
    values (p_day, v_cls, v_marks, auth.uid(), auth.uid())
  on conflict (day, cls) do update set marks = excluded.marks, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.save_violations(date, text, jsonb) from public, anon;
grant execute on function public.save_violations(date, text, jsonb) to authenticated;

-- ===== الإشعار: لمشرفي جناح الفصل فقط، عند مخالفة جديدة (ما أُضيف في هذا الحفظ) =====
-- بلا أسماء الطلاب (يظهر على شاشة القفل). الوسم واحد لكل فصل في كل يوم فيحل الإشعار الجديد محل السابق.
create or replace function private.push_on_violation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new int;
  v_to uuid[];
  v_parts text;
begin
  begin
    select count(*)::int into v_new from (
      select e.key, x ->> 'id' from jsonb_each(new.marks) e,
             jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) x
      except
      select e.key, x ->> 'id' from jsonb_each(case when tg_op = 'UPDATE' then old.marks else '{}'::jsonb end) e,
             jsonb_array_elements(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) x
    ) d;
    if v_new = 0 then return null; end if;
    select coalesce(array_agg(s.id), '{}') into v_to
      from public.staff s join public.wings w on w.id = s.wing_id
     where s.active and s.role = 'supervisor' and new.cls = any (w.classes) and s.id is distinct from new.updated_by;
    if cardinality(v_to) = 0 then return null; end if;
    select string_agg(case t.k when 'uniform' then 'الزي' when 'hair' then 'الشعر' else t.k end || ' ' || t.n, ' · '
                      order by array_position(private.viol_kinds(), t.k))
      into v_parts
      from (select e.key as k, jsonb_array_length(e.value) as n from jsonb_each(new.marks) e
             where jsonb_typeof(e.value) = 'array' and jsonb_array_length(e.value) > 0) t;
    perform private.push_enqueue(v_to, jsonb_build_object(
      'title', 'مخالفة الزي والشعر في ' || new.cls,
      'body', coalesce(v_parts, '') || ' · ' || coalesce(private.ar_day(new.day), '')
              || ' · سجّلها ' || coalesce((select s.name from public.staff s where s.id = new.updated_by), 'المشرف العام'),
      'tag', 'viol-' || new.day || '-' || new.cls, 'open', 'viol:' || new.day));
  exception when others then
    raise warning 'push_on_violation: % %', sqlstate, sqlerrm;
  end;
  return null;
end $$;
revoke all on function private.push_on_violation() from public, anon, authenticated;
create trigger violation_sheets_push after insert or update on public.violation_sheets
  for each row execute function private.push_on_violation();
