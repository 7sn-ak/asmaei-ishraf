-- حذف البيانات التجريبية كلها (التي أضافها supabase/seed_demo.sql) قبل التشغيل الفعلي:
-- الطلاب والقيود التي تبدأ معرّفاتها بـ dd000000-، وأي قيد سُجّل على طالب تجريبي أثناء التجربة،
-- وسير هذه القيود، وآثارها في سجل المحذوفات. لا يلمس أي طالب أو قيد آخر.
-- يُشغَّل من محرر SQL في Supabase عند طلب مسؤول الموقع. ويبقى في سجل المحذوفات سطر واحد يوضح ما حُذف.
-- ملف تشغيل يدوي؛ لا يدخل ضمن migrations.
do $clear$
declare
  v_actions int;
  v_students int;
begin
  -- القيود أولاً، قبل أن يصير student_id فارغاً بحذف الطالب
  with d as (
    delete from public.actions
     where id::text like 'dd000000-%' or student_id::text like 'dd000000-%'
    returning 1
  ) select count(*) into v_actions from d;
  with d as (
    delete from public.students where id::text like 'dd000000-%' returning 1
  ) select count(*) into v_students from d;
  delete from public.deleted_log
   where table_name in ('actions', 'students')
     and (row_data->>'id' like 'dd000000-%' or row_data->>'student_id' like 'dd000000-%');
  if v_actions + v_students > 0 then
    insert into public.deleted_log (table_name, row_data, deleted_by)
      values ('demo', jsonb_build_object('actions', v_actions, 'students', v_students),
              (select id from public.staff where is_admin and active order by created_at limit 1));
  end if;
  raise notice 'حُذف من البيانات التجريبية: % إجراء و% طالب', v_actions, v_students;
end $clear$;
