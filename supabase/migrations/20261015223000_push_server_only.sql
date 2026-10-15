-- جدولا الإشعارات لا يصل إليهما أحد من الإنترنت، ولا يُقرآن ولا يُكتب فيهما إلا عبر دوال الإشعارات.
-- سياسة صريحة ترفض الجميع توضح أن هذا مقصود (مثل app_secrets).
create policy push_subs_server_only on private.push_subs for all to anon, authenticated using (false) with check (false);
create policy push_outbox_server_only on private.push_outbox for all to anon, authenticated using (false) with check (false);
