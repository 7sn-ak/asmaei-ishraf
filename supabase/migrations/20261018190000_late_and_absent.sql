-- المتأخر يُسجَّل غائباً عادي (طلب 18 أكتوبر): الغياب والتأخير يجتمعان للطالب في اليوم نفسه، بأي ترتيب.
-- مخالفات الزي والشعر: الغائب لا تُسجَّل عليه مخالفة إلا إذا سُجّل متأخراً ذلك اليوم (أي حضر).
-- تعديل دوال فقط (create or replace)، فتبقى صلاحياتها كما هي.

-- ===== التأخير: لا يُرفض لأن الطالب غائب =====
create or replace function public.save_late(p_day date, p_cls text, p_ids uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_cls text := btrim(coalesce(p_cls, ''));
  v_ids uuid[] := array(select distinct x from unnest(coalesce(p_ids, '{}')) x where x is not null);
  v_old jsonb;
  v_list jsonb;
  v_id uuid;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (v_role = any (private.recorder_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_cls = '' or length(v_cls) > 20 then raise exception 'bad_class' using errcode = '22023'; end if;
  if p_day is null or p_day < current_date - 7 or p_day > current_date then raise exception 'bad_day' using errcode = '22023'; end if;
  if extract(isodow from p_day) in (5, 6) then raise exception 'weekend' using errcode = '22023'; end if;
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

-- ===== الغياب: لا يُرفض لأن الطالب متأخر =====
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

-- ===== المخالفات (المشرف العام): الغائب الذي لم يُسجَّل متأخراً ذلك اليوم لا تُسجَّل عليه مخالفة =====
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
  -- الغائبون ذلك اليوم عدا من سُجّل متأخراً (حضر بعد أخذ الغياب)
  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into v_absent
    from public.absence_sheets a, jsonb_array_elements(a.absent) e
   where a.day = p_day and a.cls = v_cls
     and not exists (select 1 from public.late_sheets l, jsonb_array_elements(l.late) x
                      where l.day = p_day and l.cls = v_cls and x ->> 'id' = e ->> 'id');
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
