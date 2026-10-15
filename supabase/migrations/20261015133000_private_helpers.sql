-- تشديد: الدوال المساعدة تنتقل إلى مخطط خاص (private) لا يمكن استدعاؤه من الإنترنت،
-- ومنها setup_needed، لأن وظيفة الخادم staff صارت تتولى فحص الإعداد.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter function public.my_role() set schema private;
alter function public.is_staff() set schema private;
alter function public.is_admin() set schema private;
alter function public.approver_roles() set schema private;
alter function public.overseer_roles() set schema private;
alter function public.manager_roles() set schema private;
alter function public.setup_needed() set schema private;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- الدوال التي تستدعي المساعدات بالاسم تُعاد كتابتها لتشير إلى private
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
      case when p_type = 'report' then coalesce(p_report_to, 'vp') end,
      auth.uid())
    returning id into v_id;

  insert into public.action_log (action_id, by, ev, to_status) values (v_id, auth.uid(), 'created', v_status);
  return v_id;
end $$;

create or replace function public.move_action(p_id uuid, p_to text, p_note text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
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
  if a.type = 'suspend' and not (v_role = any (private.approver_roles())) then
    raise exception 'not_approver' using errcode = '42501';
  end if;
  if a.status = p_to then return; end if;
  update public.actions set status = p_to, updated_at = now() where id = p_id;
  insert into public.action_log (action_id, by, ev, to_status, note)
    values (p_id, auth.uid(), 'status', p_to, coalesce(btrim(p_note), ''));
end $$;

create or replace function public.resched_action(p_id uuid, p_date date, p_time time, p_note text default '')
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := private.my_role();
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

-- app_secrets: لا يقرؤها إلا الخادم. سياسة صريحة ترفض الجميع توضح أن هذا مقصود
create policy app_secrets_server_only on public.app_secrets for all to anon, authenticated using (false) with check (false);
