-- الغياب اليومي: الجمعة والسبت عطلة نهاية الأسبوع، فلا يُسجَّل فيهما غياب ولا يُرسل (طلب 17 أكتوبر).
-- إلغاء الإرسال يبقى متاحاً لأي يوم لتصحيح ما سبق.

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
  if extract(isodow from p_day) in (5, 6) then raise exception 'weekend' using errcode = '22023'; end if;
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
  if extract(isodow from p_day) in (5, 6) then raise exception 'weekend' using errcode = '22023'; end if;
  update public.absence_sheets set status = 'sent', sent_at = now(), sent_by = auth.uid(), updated_at = now()
   where day = p_day and cls = any (coalesce(p_classes, '{}')) and status = 'draft';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
