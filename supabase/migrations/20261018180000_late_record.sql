-- التأخير الصباحي (طلب 18 أكتوبر): خانة منفصلة عن الغياب عند مشرف الجناح. لا يُرسل لشؤون الطلبة ولا لأحد،
-- ويُحفظ في سجل الطالب. ورقة الغياب صارت للغياب فقط. الغائب لا يُسجَّل متأخراً في اليوم نفسه، والعكس.

-- ===== ورقة الغياب: الغياب فقط =====
-- لا أنواع مع الغياب: save_daily تقبل الأنواع فارغة (من نسخ الموقع السابقة) وترفض غير الفارغة
create or replace function private.mark_kinds() returns text[]
language sql immutable set search_path = '' as $$ select '{}'::text[] $$;

-- ===== التأخير: ورقة لكل فصل في كل يوم =====
create table public.late_sheets (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  cls text not null check (length(btrim(cls)) between 1 and 20),
  -- [{id, name, by, at}]: الطالب، ومن سجّل تأخيره ومتى (بالملّي ثانية)، نسخة من الاسم وقت التسجيل
  late jsonb not null default '[]'::jsonb check (jsonb_typeof(late) = 'array'),
  created_by uuid references public.staff(id) on delete set null,
  updated_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (day, cls)
);
alter table public.late_sheets enable row level security;
create policy late_read on public.late_sheets for select to authenticated using (private.is_staff());
revoke insert, update, delete, truncate on public.late_sheets from anon, authenticated;
alter publication supabase_realtime add table public.late_sheets;

-- حفظ المتأخرين في فصل (المشرف والإدارة). من بقي في القائمة يبقى معه من سجّله ومتى.
create or replace function public.save_late(p_day date, p_cls text, p_ids uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_cls text := btrim(coalesce(p_cls, ''));
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_ids, '{}')) x where x is not null);
  v_old jsonb;
  v_absent uuid[];
  v_list jsonb;
  v_id uuid;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (v_role = any (private.recorder_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_cls = '' or length(v_cls) > 20 then raise exception 'bad_class' using errcode = '22023'; end if;
  if p_day is null or p_day < current_date - 7 or p_day > current_date then raise exception 'bad_day' using errcode = '22023'; end if;
  if extract(isodow from p_day) in (5, 6) then raise exception 'weekend' using errcode = '22023'; end if;
  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into v_absent
    from public.absence_sheets a, jsonb_array_elements(a.absent) e where a.day = p_day and a.cls = v_cls;
  if v_ids && v_absent then raise exception 'absent_marked' using errcode = '22023'; end if;
  select late into v_old from public.late_sheets where day = p_day and cls = v_cls for update;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name,
           'by', coalesce(o.e -> 'by', to_jsonb(auth.uid())), 'at', coalesce(o.e -> 'at', to_jsonb((extract(epoch from now()) * 1000)::bigint)))
           order by s.name), '[]'::jsonb) into v_list
    from public.students s
    left join lateral (select e from jsonb_array_elements(coalesce(v_old, '[]'::jsonb)) e where e ->> 'id' = s.id::text limit 1) o on true
   where s.cls = v_cls and s.id = any (v_ids);
  if jsonb_array_length(v_list) <> cardinality(v_ids) then raise exception 'student_not_in_class' using errcode = '22023'; end if;
  insert into public.late_sheets (day, cls, late, created_by, updated_by)
    values (p_day, v_cls, v_list, auth.uid(), auth.uid())
  on conflict (day, cls) do update set late = excluded.late, updated_by = auth.uid(), updated_at = now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.save_late(date, text, uuid[]) from public, anon;
grant execute on function public.save_late(date, text, uuid[]) to authenticated;

-- ===== الغياب: لا يُسجَّل غائباً من سُجّل متأخراً في اليوم نفسه =====
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
  v_late uuid[];
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
  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into v_late
    from public.late_sheets l, jsonb_array_elements(l.late) e where l.day = p_day and l.cls = v_cls;
  if v_ids && v_late then raise exception 'late_marked' using errcode = '22023'; end if;
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

-- ===== إشعار شؤون الطلبة عند اعتماد الغياب: الغياب فقط (كما كان قبل الجولة اليومية) =====
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

-- ===== نقل ما سُجّل من تأخير في ورقة الغياب (النسخة السابقة) إلى سجل التأخير =====
insert into public.late_sheets (day, cls, late, created_by, updated_by, created_at, updated_at)
select a.day, a.cls,
       (select coalesce(jsonb_agg(e || jsonb_build_object('by', to_jsonb(a.updated_by), 'at', to_jsonb((extract(epoch from a.updated_at) * 1000)::bigint))), '[]'::jsonb)
          from jsonb_array_elements(a.marks -> 'late') e),
       a.updated_by, a.updated_by, a.updated_at, a.updated_at
  from public.absence_sheets a
 where jsonb_typeof(a.marks -> 'late') = 'array' and jsonb_array_length(a.marks -> 'late') > 0
on conflict (day, cls) do nothing;
