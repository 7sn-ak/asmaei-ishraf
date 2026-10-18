-- الجولة اليومية (طلب 18 أكتوبر): مع الغياب، التأخير الصباحي ومخالفات الزي والشعر في ورقة الفصل نفسها.
-- المشرف يفتح الفصل ويختار ما يسجله (الغياب أو التأخير أو الزي أو الشعر) ثم يضغط أسماء الطلاب.
-- الطالب الغائب لا يُسجَّل عليه تأخير ولا مخالفة. كل شيء يُرسل لشؤون الطلبة مع الغياب عند الاعتماد.

-- {"late":[{id,name}], "uniform":[...], "hair":[...]}: نسخة من الأسماء وقت التسجيل مثل absent
alter table public.absence_sheets add column if not exists marks jsonb not null default '{}'::jsonb;
alter table public.absence_sheets add constraint absence_marks_object check (jsonb_typeof(marks) = 'object');

-- أنواع ما يُسجَّل مع الغياب. لإضافة نوع: أضفه هنا (migration جديد) وفي MARKS في site/js/core.js
create or replace function private.mark_kinds() returns text[]
language sql immutable set search_path = '' as $$ select array['late', 'uniform', 'hair'] $$;
revoke all on function private.mark_kinds() from public, anon;
grant execute on function private.mark_kinds() to authenticated, service_role;

-- حفظ ورقة فصل (مسودة): الغائبون، وما سُجّل على الحاضرين. يُرفض إذا أُرسلت الورقة؛ للتعديل يُلغى الإرسال أولاً.
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
  -- كائن مفاتيحه من الأنواع المعروفة، وقيمه قوائم بمعرّفات الطلاب
  if jsonb_typeof(v_in) <> 'object' then raise exception 'bad_marks' using errcode = '22023'; end if;
  for v_k in select jsonb_object_keys(v_in) loop
    if not (v_k = any (private.mark_kinds())) or jsonb_typeof(v_in -> v_k) <> 'array' then
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
revoke all on function public.save_daily(date, text, uuid[], jsonb) from public, anon;
grant execute on function public.save_daily(date, text, uuid[], jsonb) to authenticated;

-- الحفظ القديم (نسخ الموقع المحفوظة في الأجهزة قبل التحديث): الغياب فقط، ويبقى ما سُجّل على الحاضرين،
-- ويُحذف منه من صار غائباً.
create or replace function public.save_absence(p_day date, p_cls text, p_absent uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_keep jsonb := '{}'::jsonb;
  v_k text;
begin
  select marks into v_old from public.absence_sheets where day = p_day and cls = btrim(coalesce(p_cls, ''));
  foreach v_k in array private.mark_kinds() loop
    continue when v_old is null or jsonb_typeof(v_old -> v_k) is distinct from 'array';
    v_keep := v_keep || jsonb_build_object(v_k, coalesce((select jsonb_agg(e -> 'id') from jsonb_array_elements(v_old -> v_k) e
      where not ((e ->> 'id')::uuid = any (coalesce(p_absent, '{}')))), '[]'::jsonb));
  end loop;
  return public.save_daily(p_day, p_cls, p_absent, v_keep);
end $$;

-- إشعار شؤون الطلبة عند الاعتماد: مع عدد الغائبين، عدد المتأخرين والمخالفات
create or replace function private.push_on_absence() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_to uuid[];
begin
  begin
    for r in
      select n.day, n.sent_by, count(*)::int as k, coalesce(sum(jsonb_array_length(n.absent)), 0)::int as m,
             coalesce(sum(case when jsonb_typeof(n.marks -> 'late') = 'array' then jsonb_array_length(n.marks -> 'late') else 0 end), 0)::int as l,
             coalesce(sum((select coalesce(sum(jsonb_array_length(e.v)), 0) from jsonb_each(n.marks) as e(k, v)
                            where e.k <> 'late' and jsonb_typeof(e.v) = 'array')), 0)::int as x,
             string_agg(n.cls, '، ' order by length(n.cls), n.cls) as classes
        from new_rows n join old_rows o on o.id = n.id
       where n.status = 'sent' and o.status is distinct from 'sent'
       group by n.day, n.sent_by
    loop
      select coalesce(array_agg(s.id), '{}') into v_to from public.staff s
       where s.active and s.role = 'affairs' and s.id is distinct from r.sent_by;
      perform private.push_enqueue(v_to, jsonb_build_object(
        'title', 'وصل غياب ' || coalesce(private.ar_day(r.day), ''),
        'body', r.m || ' غائب'
                || case when r.l > 0 then ' · ' || r.l || ' متأخر' else '' end
                || case when r.x > 0 then ' · ' || r.x || case when r.x between 2 and 10 then ' مخالفات' else ' مخالفة' end else '' end
                || ' في ' || r.k || case when r.k = 1 then ' فصل: ' else ' فصول: ' end || r.classes
                || ' · اعتمده ' || coalesce((select s.name from public.staff s where s.id = r.sent_by), 'زميل'),
        'tag', 'abs-' || r.day, 'open', 'abs:' || r.day));
    end loop;
  exception when others then
    raise warning 'push_on_absence: % %', sqlstate, sqlerrm;
  end;
  return null;
end $$;
