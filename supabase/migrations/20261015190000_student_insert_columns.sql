-- معرّف الطالب يولّده الخادم دائماً: لا يقدر أحد من المتصفح يختار معرّفاً (مثل بادئة البيانات التجريبية)
-- ولا يحدد «أضافه» باسم غيره. الإضافة تبقى للأعمدة التي يرسلها الموقع فقط.
revoke insert on public.students from anon, authenticated;
grant insert (name, cls, phone, notes) on public.students to authenticated;
