-- الأجنحة: جناح الثاني عشر، جناح الحادي عشر، جناح العاشر، جناح الإسلامية.
-- لكل جناح فصوله، ويُوزَّع المشرفون على الأجنحة (كل مشرف في جناح واحد، وفي الجناح مشرف أو أكثر).
-- المشرف يرى في الرئيسية إجراءات فصول جناحه، وتصله إشعاراتها، ويسجل غيابها اليومي.
-- يحل هذا محل تحديد الفصول لكل مشرف: العمود staff.classes والدالة set_staff_classes لم يعودا مستخدمين.
-- يحدد الأجنحة (الاسم والفصول والمشرفين) مسؤول الموقع والمشرف العام والوكيل والمدير.

-- ===== الأجنحة =====
create table public.wings (
  id int generated always as identity primary key,
  name text not null unique check (length(btrim(name)) between 2 and 40),
  sort int not null default 0,
  classes text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.wings enable row level security;
create policy wings_read on public.wings for select to authenticated using (private.is_staff());
revoke insert, update, delete, truncate on public.wings from anon, authenticated;
alter publication supabase_realtime add table public.wings;

insert into public.wings (name, sort) values
  ('جناح الثاني عشر', 1), ('جناح الحادي عشر', 2), ('جناح العاشر', 3), ('جناح الإسلامية', 4);

-- جناح كل مشرف
alter table public.staff add column wing_id int references public.wings(id) on delete set null;

-- ===== حفظ جناح: اسمه وفصوله ومشرفوه =====
-- الفصل في جناح واحد، والمشرف في جناح واحد: ما يُختار هنا يُنقل من جناحه السابق.
create or replace function public.set_wing(p_id int, p_name text, p_classes text[], p_supervisors uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_list text[];
  v_sup uuid[] := array(select distinct x from unnest(coalesce(p_supervisors, '{}')) x where x is not null);
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (private.is_admin() or v_role = any (private.overseer_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform 1 from public.wings where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if length(v_name) < 2 or length(v_name) > 40 then raise exception 'name_required' using errcode = '22023'; end if;
  if exists (select 1 from public.wings where id <> p_id and name = v_name) then raise exception 'name_taken' using errcode = '22023'; end if;
  select coalesce(array_agg(c order by c), '{}') into v_list
    from (select distinct btrim(x) as c from unnest(coalesce(p_classes, '{}')) x) t where c <> '';
  if cardinality(v_list) > 60 or exists (select 1 from unnest(v_list) c where length(c) > 20) then
    raise exception 'bad_class' using errcode = '22023';
  end if;
  if (select count(*) from public.staff s where s.id = any (v_sup) and s.role = 'supervisor') <> cardinality(v_sup) then
    raise exception 'not_supervisor' using errcode = '22023';
  end if;
  -- الفصول المنقولة تخرج من أجنحتها السابقة
  update public.wings w set classes = array(select c from unnest(w.classes) c where not (c = any (v_list))), updated_at = now()
   where w.id <> p_id and w.classes && v_list;
  update public.wings set name = v_name, classes = v_list, updated_at = now() where id = p_id;
  update public.staff set wing_id = null where wing_id = p_id and not (id = any (v_sup));
  update public.staff set wing_id = p_id where id = any (v_sup) and wing_id is distinct from p_id;
end $$;

-- جناح مشرف واحد (من نافذة العضو). بدون جناح: null
create or replace function public.set_staff_wing(p_id uuid, p_wing int)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
  v_staff_role text;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  if not (private.is_admin() or v_role = any (private.overseer_roles())) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select role into v_staff_role from public.staff where id = p_id;
  if v_staff_role is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_wing is not null then
    if v_staff_role <> 'supervisor' then raise exception 'not_supervisor' using errcode = '22023'; end if;
    if not exists (select 1 from public.wings where id = p_wing) then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  update public.staff set wing_id = p_wing where id = p_id;
end $$;

revoke all on function public.set_wing(int, text, text[], uuid[]), public.set_staff_wing(uuid, int) from public, anon;
grant execute on function public.set_wing(int, text, text[], uuid[]), public.set_staff_wing(uuid, int) to authenticated;
-- الطريقة السابقة (فصول لكل مشرف) لم تعد مستخدمة
revoke execute on function public.set_staff_classes(uuid, text[]) from authenticated;

-- ===== الإشعارات: المشرف تصله فصول جناحه =====
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
        from public.staff s left join public.prefs p on p.user_id = s.id left join public.wings w on w.id = s.wing_id
       where s.active and s.id <> all (v_done)
         and coalesce(p.types -> a.type, 'true'::jsonb) not in ('false'::jsonb, 'null'::jsonb, '0'::jsonb, '""'::jsonb)
         and (s.role <> 'supervisor' or coalesce(cardinality(w.classes), 0) = 0 or v_cls = any (w.classes));
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
revoke all on function private.push_on_log() from public, anon, authenticated;
