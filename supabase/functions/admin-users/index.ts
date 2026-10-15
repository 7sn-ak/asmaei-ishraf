// إدارة حسابات الطاقم: إضافة، تعديل، إيقاف وتفعيل، تغيير كلمة السر. للمسؤولين فقط.
import {
  adminClient, cleanName, cleanUsername, cors, emailFor, json, okPassword, readBody, ROLES, USERNAME_RE,
} from "../_shared/common.ts";

const FOREVER = "876000h"; // إيقاف الحساب: يمنع تسجيل الدخول حتى يُعاد تفعيله

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const db = adminClient();
  const { data: who, error: whoErr } = await db.auth.getUser(token);
  if (whoErr || !who.user) return json({ error: "unauthorized" }, 401);
  const { data: me } = await db.from("staff").select("id,is_admin,active").eq("id", who.user.id).maybeSingle();
  if (!me || !me.active || !me.is_admin) return json({ error: "forbidden" }, 403);

  const body = await readBody(req);
  if (!body) return json({ error: "bad_json" }, 400);

  if (body.op === "create") {
    const name = cleanName(body.name);
    const username = cleanUsername(body.username);
    const role = String(body.role ?? "");
    if (name.length < 2) return json({ error: "name_required" }, 400);
    if (!USERNAME_RE.test(username)) return json({ error: "bad_username" }, 400);
    if (!okPassword(body.password)) return json({ error: "weak_password" }, 400);
    if (!ROLES.includes(role)) return json({ error: "bad_role" }, 400);
    const { data: taken } = await db.from("staff").select("id").eq("username", username).maybeSingle();
    if (taken) return json({ error: "username_taken" }, 409);
    const { data, error } = await db.auth.admin.createUser({
      email: emailFor(username), password: body.password as string, email_confirm: true, user_metadata: { name },
    });
    if (error || !data.user) {
      const taken2 = /already|exists|registered/i.test(error?.message ?? "");
      return json({ error: taken2 ? "username_taken" : (error?.message ?? "create_failed") }, taken2 ? 409 : 400);
    }
    const { error: staffErr } = await db.from("staff")
      .insert({ id: data.user.id, name, username, role, is_admin: body.is_admin === true });
    if (staffErr) {
      await db.auth.admin.deleteUser(data.user.id);
      return json({ error: staffErr.message }, 400);
    }
    return json({ ok: true, id: data.user.id });
  }

  const id = String(body.id ?? "");
  if (!id) return json({ error: "id_required" }, 400);
  const { data: target } = await db.from("staff").select("id,active").eq("id", id).maybeSingle();
  if (!target) return json({ error: "not_found" }, 404);

  if (body.op === "update") {
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
    if (id === me.id && (patch.is_admin === false || patch.active === false)) {
      return json({ error: "cannot_lock_self" }, 400);
    }
    if (!Object.keys(patch).length) return json({ ok: true });
    const { error } = await db.from("staff").update(patch).eq("id", id);
    if (error) return json({ error: error.message }, 400);
    if (patch.active !== undefined && patch.active !== target.active) {
      const { error: banErr } = await db.auth.admin.updateUserById(id, {
        ban_duration: patch.active ? "none" : FOREVER,
      });
      if (banErr) return json({ error: banErr.message }, 400);
    }
    return json({ ok: true });
  }

  if (body.op === "password") {
    if (!okPassword(body.password)) return json({ error: "weak_password" }, 400);
    const { error } = await db.auth.admin.updateUserById(id, { password: body.password as string });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "bad_op" }, 400);
});
