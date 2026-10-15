// إنشاء حساب المسؤول الأول. تعمل مرة واحدة فقط:
// - ترفض الطلب إذا وُجد مسؤول نشط
// - وتشترط رمز إعداد لمرة واحدة محفوظاً في app_secrets (key = 'setup_code')، ويُحذف بعد الاستخدام
// لإنشاء رمز جديد من محرر SQL في Supabase:
//   insert into public.app_secrets (key, value) values ('setup_code', 'رمز-عشوائي-طويل');
import {
  adminClient, cleanName, cleanUsername, cors, emailFor, json, okPassword, readBody, ROLES, USERNAME_RE,
} from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await readBody(req);
  if (!body) return json({ error: "bad_json" }, 400);
  const name = cleanName(body.name);
  const username = cleanUsername(body.username);
  const role = String(body.role ?? "");
  if (name.length < 2) return json({ error: "name_required" }, 400);
  if (!USERNAME_RE.test(username)) return json({ error: "bad_username" }, 400);
  if (!okPassword(body.password)) return json({ error: "weak_password" }, 400);
  if (!ROLES.includes(role)) return json({ error: "bad_role" }, 400);

  const db = adminClient();
  const { count, error: countErr } = await db.from("staff")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true).eq("active", true);
  if (countErr) return json({ error: countErr.message }, 500);
  if ((count ?? 0) > 0) return json({ error: "already_set_up" }, 409);

  const code = String(body.code ?? "").trim();
  const { data: secret } = await db.from("app_secrets").select("value").eq("key", "setup_code").maybeSingle();
  if (!secret || !code || secret.value !== code) return json({ error: "bad_setup_code" }, 403);

  const { data, error } = await db.auth.admin.createUser({
    email: emailFor(username),
    password: body.password as string,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) return json({ error: error?.message ?? "create_failed" }, 400);

  const { error: staffErr } = await db.from("staff")
    .insert({ id: data.user.id, name, username, role, is_admin: true });
  if (staffErr) {
    await db.auth.admin.deleteUser(data.user.id);
    return json({ error: staffErr.message }, 400);
  }
  await db.from("app_secrets").delete().eq("key", "setup_code");
  return json({ ok: true });
});
