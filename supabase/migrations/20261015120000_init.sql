-- سجل الإشراف — مدرسة الأصمعي
-- الإصدار الأول من قاعدة البيانات: الطاقم، الطلاب، الإجراءات وسجلها، تفضيلات الإشعارات.
-- أي تعديل لاحق يكون في ملف migration جديد بتاريخ أحدث، ولا يُعدَّل هذا الملف بعد نشره.

-- ===== صلاحيات الأدوار =====
-- غيّر هذه القوائم إذا تغيّرت صلاحيات الأدوار، وعدّل الثوابت المقابلة في site/js/core.js
create or replace function public.approver_roles() returns text[]
language sql immutable set search_path = '' as $$ select array['principal','vp','head']::text[] $$;      -- يعتمدون الفصل
create or replace function public.overseer_roles() returns text[]
language sql immutable set search_path = '' as $$ select array['principal','vp','head']::text[] $$;      -- يحذفون أي قيد ويرون كل التقارير
create or replace function public.manager_roles() returns text[]
language sql immutable set search_path = '' as $$ select array['principal','vp','head','affairs']::text[] $$; -- يديرون قوائم الطلاب

-- ===== الجداول =====
create table public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  username text not null unique check (username ~ '^[a-z0-9._-]{3,30}$'),
  role text not null check (role in ('supervisor','head','vp','principal','affairs')),
  is_admin boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  cls text not null default '',
  phone text not null default '',
  notes text not null default '',
  created_by uuid default auth.uid() references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index students_cls_idx on public.students (cls);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete set null,
  student_name text not null,
  cls text not null default '',
  type text not null check (type in ('pledge','report','summon','suspend')),
  status text not null,
  violation text not null check (length(btrim(violation)) > 0),
  details text not null default '',
  date date not null,
  summon_date date,
  summon_time time,
  suspend_days int check (suspend_days between 1 and 30),
  suspend_from date,
  suspend_to date,
  report_to text check (report_to in ('supervisor','head','vp','principal','affairs')),
  created_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index actions_created_idx on public.actions (created_at desc);
create index actions_student_idx on public.actions (student_id);

create table public.action_log (
  id bigint generated always as identity primary key,
  action_id uuid not null references public.actions(id) on delete cascade,
  at timestamptz not null default now(),
  by uuid references public.staff(id) on delete set null,
  ev text not null check (ev in ('created','status','resched')),
  to_status text,
  note text not null default ''
);
create index action_log_action_idx on public.action_log (action_id);
create index action_log_at_idx on public.action_log (at desc);

create table public.prefs (
  user_id uuid primary key default auth.uid() references public.staff(id) on delete cascade,
  notify boolean not null default false,
  sound boolean not null default false,
  types jsonb not null default '{"pledge":true,"report":true,"summon":true,"suspend":true}'::jsonb,
  last_seen timestamptz not null default now()
);

-- ===== من المستخدم الحالي؟ =====
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.staff where id = auth.uid() and active
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where id = auth.uid() and active)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where id = auth.uid() and active and is_admin)
$$;
-- هل يحتاج الموقع إنشاء حساب المسؤول الأول؟ (تُستدعى قبل تسجيل الدخول)
create or replace function public.setup_needed() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.staff where is_admin and active)
$$;

-- ===== قواعد الحماية =====
alter table public.staff enable row level security;
alter table public.students enable row level security;
alter table public.actions enable row level security;
alter table public.action_log enable row level security;
alter table public.prefs enable row level security;

-- الطاقم: يقرؤه أعضاء الطاقم فقط، والكتابة عبر وظيفة admin-users على الخادم
create policy staff_read on public.staff for select to authenticated using (public.is_staff());

-- الطلاب
create policy students_read on public.students for select to authenticated using (public.is_staff());
create policy students_insert on public.students for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy students_update on public.students for update to authenticated
  using (public.my_role() = any (public.manager_roles()) or public.is_admin())
  with check (public.my_role() = any (public.manager_roles()) or public.is_admin());
create policy students_delete on public.students for delete to authenticated
  using (public.my_role() = any (public.manager_roles()) or public.is_admin());

-- الإجراءات: الإضافة والتحديث عبر الدوال أدناه فقط، والحذف لصاحب القيد أو المشرف العام والوكيل والمدير
create policy actions_read on public.actions for select to authenticated using (public.is_staff());
create policy actions_delete on public.actions for delete to authenticated
  using (public.is_staff() and (created_by = auth.uid() or public.my_role() = any (public.overseer_roles()) or public.is_admin()));

create policy action_log_read on public.action_log for select to authenticated using (public.is_staff());

create policy prefs_own on public.prefs for all to authenticated
  using (user_id = auth.uid() and public.is_staff())
  with check (user_id = auth.uid() and public.is_staff());

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end $$;
create trigger students_touch before update on public.students
  for each row execute function public.touch_updated_at();

-- ===== أسرار التطبيق: لا يقرؤها إلا الخادم (مثل رمز الإعداد لمرة واحدة) =====
create table public.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- ===== سجل المحذوفات: من حذف ماذا ومتى (يقرؤه مسؤول الموقع فقط) =====
create table public.deleted_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_data jsonb not null,
  deleted_by uuid,
  deleted_at timestamptz not null default now()
);
alter table public.deleted_log enable row level security;
create policy deleted_log_admin_read on public.deleted_log for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.deleted_log from anon, authenticated;

create or replace function public.log_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.deleted_log (table_name, row_data, deleted_by) values (tg_table_name, to_jsonb(old), auth.uid());
  return old;
end $$;
create trigger actions_log_delete after delete on public.actions for each row execute function public.log_delete();
create trigger students_log_delete after delete on public.students for each row execute function public.log_delete();

-- ===== تسجيل إجراء =====
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
  v_role text := public.my_role();
  v_sid uuid := p_student_id;
  v_name text;
  v_cls text;
  v_status text;
  v_id uuid;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
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
    when 'report' then 'open'
    when 'summon' then 'scheduled'
    else case when v_role = any (public.approver_roles()) then 'approved' else 'pending' end
  end;

  insert into public.actions (student_id, student_name, cls, type, status, violation, details, date,
      summon_date, summon_time, suspend_days, suspend_from, suspend_to, report_to, created_by)
    values (v_sid, v_name, v_cls, p_type, v_status, btrim(p_violation), coalesce(p_details, ''), p_date,
      case when p_type = 'summon' then p_summon_date end,
      case when p_type = 'summon' then p_summon_time end,
      case when p_type = 'suspend' then p_suspend_days end,
      case when p_type = 'suspend' then p_suspend_from end,
      case when p_type = 'suspend' then p_suspend_to end,
      case when p_type = 'report' then coalesce(p_report_to, 'vp') end,
      auth.uid())
    returning id into v_id;

  insert into public.action_log (action_id, by, ev, to_status) values (v_id, auth.uid(), 'created', v_status);
  return v_id;
end $$;

-- ===== تغيير حالة إجراء =====
create or replace function public.move_action(p_id uuid, p_to text, p_note text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.my_role();
  a public.actions%rowtype;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  select * into a from public.actions where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (
       (a.type = 'pledge'  and p_to in ('open','signed'))
    or (a.type = 'report'  and p_to in ('open','reviewed'))
    or (a.type = 'summon'  and p_to in ('scheduled','attended','absent'))
    or (a.type = 'suspend' and p_to in ('pending','approved','rejected'))
  ) then raise exception 'bad_status' using errcode = '22023'; end if;
  if a.type = 'suspend' and not (v_role = any (public.approver_roles())) then
    raise exception 'not_approver' using errcode = '42501';
  end if;
  if a.status = p_to then return; end if;
  update public.actions set status = p_to, updated_at = now() where id = p_id;
  insert into public.action_log (action_id, by, ev, to_status, note)
    values (p_id, auth.uid(), 'status', p_to, coalesce(btrim(p_note), ''));
end $$;

-- ===== تغيير موعد استدعاء =====
create or replace function public.resched_action(p_id uuid, p_date date, p_time time, p_note text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.my_role();
  v_type text;
begin
  if v_role is null then raise exception 'not_staff' using errcode = '42501'; end if;
  select type into v_type from public.actions where id = p_id for update;
  if v_type is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_type <> 'summon' then raise exception 'not_summon' using errcode = '22023'; end if;
  if p_date is null then raise exception 'summon_date_required' using errcode = '22023'; end if;
  update public.actions set summon_date = p_date, summon_time = p_time, status = 'scheduled', updated_at = now()
    where id = p_id;
  insert into public.action_log (action_id, by, ev, to_status, note)
    values (p_id, auth.uid(), 'resched', 'scheduled', coalesce(btrim(p_note), ''));
end $$;

-- ===== من يستدعي الدوال =====
revoke all on function public.create_action(uuid, text, text, text, date, date, time, int, date, date, text, text, text) from public, anon;
revoke all on function public.move_action(uuid, text, text) from public, anon;
revoke all on function public.resched_action(uuid, date, time, text) from public, anon;
grant execute on function public.create_action(uuid, text, text, text, date, date, time, int, date, date, text, text, text) to authenticated;
grant execute on function public.move_action(uuid, text, text) to authenticated;
grant execute on function public.resched_action(uuid, date, time, text) to authenticated;
grant execute on function public.setup_needed() to anon, authenticated;

revoke truncate on public.staff, public.students, public.actions, public.action_log, public.prefs from anon, authenticated;
revoke update, delete on public.action_log from anon, authenticated;
revoke execute on function public.log_delete() from public, anon, authenticated;

-- ===== التحديث المباشر في الموقع =====
alter publication supabase_realtime add table public.staff, public.students, public.actions, public.action_log;
