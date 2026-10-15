// وظيفة الخادم الوحيدة للموقع: إعداد المسؤول الأول، وإدارة حسابات الطاقم.
// ملف واحد مستقل حتى يسهل نشره وتعديله.
//
// العمليات (POST بجسم JSON فيه op):
//   status    → هل يحتاج الموقع إعداد المسؤول الأول؟ (بدون تسجيل دخول)
//   setup     → إنشاء المسؤول الأول برمز إعداد لمرة واحدة (بدون تسجيل دخول)
//   create    → إضافة عضو للطاقم (للمسؤولين)
//   update    → تعديل الاسم أو الدور أو الإدارة أو الإيقاف (للمسؤولين)
//   password  → تعيين كلمة سر جديدة لعضو (للمسؤولين)
//
// رمز الإعداد يُحفظ في public.app_secrets (key = 'setup_code') ويُحذف بعد الاستخدام. لإنشاء رمز جديد:
//   insert into public.app_secrets (key, value) values ('setup_code', 'رمز-عشوائي-طويل');
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

// يجب أن يطابق USER_DOMAIN في site/js/config.js
// اسم المستخدم يتحول داخلياً إلى بريد وهمي لا يُرسل إليه شيء: khaled → khaled@staff.asmaei.invalid
const USER_DOMAIN = "staff.asmaei.invalid";
const ROLES = ["supervisor", "head", "vp", "principal", "affairs"];
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const FOREVER = "876000h"; // مدة إيقاف الحساب: يمنع الدخول حتى يُعاد تفعيله

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (typeof first === "string" && first) return first;
  } catch (_e) {
    // المشاريع القديمة تستخدم المفتاح السابق
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("missing_service_key");
  return legacy;
}
const adminClient = (): SupabaseClient =>
  createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const emailFor = (username: string) => `${username}@${USER_DOMAIN}`;
const cleanName = (n: unknown) => (typeof n === "string" ? n.trim().replace(/\s+/g, " ") : "");
const cleanUsername = (u: unknown) => (typeof u === "string" ? u.trim().toLowerCase() : "");
const okPassword = (p: unknown): p is string => typeof p === "string" && p.length >= 8 && p.length <= 72;

async function adminCount(db: SupabaseClient): Promise<number> {
  const { count, error } = await db.from("staff").select("id", { count: "exact", head: true })
    .eq("is_admin", true).eq("active", true);
  if (error) throw error;
  return count ?? 0;
}

async function createAccount(db: SupabaseClient, name: string, username: string, password: string, role: string, isAdmin: boolean) {
  const { data: taken } = await db.from("staff").select("id").eq("username", username).maybeSingle();
  if (taken) return json({ error: "username_taken" }, 409);
  const { data, error } = await db.auth.admin.createUser({
    email: emailFor(username), password, email_confirm: true, user_metadata: { name },
  });
  if (error || !data.user) {
    const dup = /already|exists|registered/i.test(error?.message ?? "");
    return json({ error: dup ? "username_taken" : (error?.message ?? "create_failed") }, dup ? 409 : 400);
  }
  const { error: staffErr } = await db.from("staff").insert({ id: data.user.id, name, username, role, is_admin: isAdmin });
  if (staffErr) {
    await db.auth.admin.deleteUser(data.user.id);
    return json({ error: staffErr.message }, 400);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try {
    const b = await req.json();
    if (!b || typeof b !== "object") return json({ error: "bad_json" }, 400);
    body = b as Record<string, unknown>;
  } catch (_e) {
    return json({ error: "bad_json" }, 400);
  }

  const db = adminClient();
  const op = String(body.op ?? "");

  try {
    // ----- بدون تسجيل دخول -----
    if (op === "status") return json({ needed: (await adminCount(db)) === 0 });

    if (op === "setup") {
      const name = cleanName(body.name), username = cleanUsername(body.username), role = String(body.role ?? "");
      if (name.length < 2) return json({ error: "name_required" }, 400);
      if (!USERNAME_RE.test(username)) return json({ error: "bad_username" }, 400);
      if (!okPassword(body.password)) return json({ error: "weak_password" }, 400);
      if (!ROLES.includes(role)) return json({ error: "bad_role" }, 400);
      if ((await adminCount(db)) > 0) return json({ error: "already_set_up" }, 409);
      const code = String(body.code ?? "").trim();
      const { data: secret } = await db.from("app_secrets").select("value").eq("key", "setup_code").maybeSingle();
      if (!secret || !code || secret.value !== code) return json({ error: "bad_setup_code" }, 403);
      const fail = await createAccount(db, name, username, body.password as string, role, true);
      if (fail) return fail;
      await db.from("app_secrets").delete().eq("key", "setup_code");
      return json({ ok: true });
    }

    // ----- للمسؤولين فقط -----
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: who, error: whoErr } = await db.auth.getUser(token);
    if (whoErr || !who.user) return json({ error: "unauthorized" }, 401);
    const { data: me } = await db.from("staff").select("id,is_admin,active").eq("id", who.user.id).maybeSingle();
    if (!me || !me.active || !me.is_admin) return json({ error: "forbidden" }, 403);

    if (op === "create") {
      const name = cleanName(body.name), username = cleanUsername(body.username), role = String(body.role ?? "");
      if (name.length < 2) return json({ error: "name_required" }, 400);
      if (!USERNAME_RE.test(username)) return json({ error: "bad_username" }, 400);
      if (!okPassword(body.password)) return json({ error: "weak_password" }, 400);
      if (!ROLES.includes(role)) return json({ error: "bad_role" }, 400);
      const fail = await createAccount(db, name, username, body.password as string, role, body.is_admin === true);
      return fail ?? json({ ok: true });
    }

    const id = String(body.id ?? "");
    if (!id) return json({ error: "id_required" }, 400);
    const { data: target } = await db.from("staff").select("id,active").eq("id", id).maybeSingle();
    if (!target) return json({ error: "not_found" }, 404);

    if (op === "update") {
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = cleanName(body.name);
        if (name.length < 2) return json({ error: "name_required" }, 400);
        patch.name = name;
      }
      if (body.role !== undefined) {
        if (!ROLES.includes(String(body.role))) return json({ error: "bad_role" }, 400);
        patch.role = String(body.role);
      }
      if (body.is_admin !== undefined) patch.is_admin = body.is_admin === true;
      if (body.active !== undefined) patch.active = body.active === true;
      if (id === me.id && (patch.is_admin === false || patch.active === false)) return json({ error: "cannot_lock_self" }, 400);
      if (!Object.keys(patch).length) return json({ ok: true });
      const { error } = await db.from("staff").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 400);
      if (patch.active !== undefined && patch.active !== target.active) {
        const { error: banErr } = await db.auth.admin.updateUserById(id, { ban_duration: patch.active ? "none" : FOREVER });
        if (banErr) return json({ error: banErr.message }, 400);
      }
      return json({ ok: true });
    }

    if (op === "password") {
      if (!okPassword(body.password)) return json({ error: "weak_password" }, 400);
      const { error } = await db.auth.admin.updateUserById(id, { password: body.password as string });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "bad_op" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
