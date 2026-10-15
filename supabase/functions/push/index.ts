// وظيفة الإشعارات: ترسل ما في صندوق الإشعارات إلى أجهزة الطاقم (Web Push)، فتصل حتى والموقع مغلق.
// تنبّهها قاعدة البيانات عبر pg_net كلما أُضيف إشعار (private.push_kick في migrations).
//
// الأمان:
// - لا تقبل أي محتوى من الطلب: كل ما ترسله تقرؤه من قاعدة البيانات بالمفتاح السري (push_claim)،
//   فمن يستدعيها من أي مكان لا يضيف إشعاراً ولا يغيّره ولا يقرأ شيئاً.
// - مفتاح VAPID الخاص تولّده بنفسها أول مرة وتحفظه في app_secrets (لا يقرؤه المتصفح ولا يظهر في أي ملف).
//   المتصفح يأخذ المفتاح العام فقط عبر الدالة push_key.
// - الإرسال لخوادم الإشعارات المعروفة فقط، دون تتبع أي إعادة توجيه.
// - نص الإشعار مشفّر لكل جهاز، وخادم الإشعارات (Google أو Apple) لا يقرؤه.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { encrypt, newVapidKeys, okEndpoint, type VapidKeys, vapidSigner } from "./webpush.ts";

// جهة الاتصال في توقيع VAPID: رابط الموقع (لا بريد شخصي)
const SUBJECT = "https://7sn-ak.github.io/asmaei-ishraf/";
// يبقى الإشعار عند خادم الإشعارات يوماً كاملاً إذا كان الجهاز مغلقاً أو بلا إنترنت
const TTL = 24 * 3600;
const te = new TextEncoder();

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
const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = { outbox_id: number; sub_id: number; endpoint: string; p256dh: string; auth: string; payload: Record<string, unknown> | null };
type Outcome = "ok" | "gone" | "failed";

// مفتاح التوقيع: يُقرأ من app_secrets، ويُولَّد أول مرة فقط
let signer: Promise<(endpoint: string) => Promise<string>> | null = null;
async function loadSigner() {
  const read = async (): Promise<VapidKeys | null> => {
    const { data, error } = await db.from("app_secrets").select("value").eq("key", "vapid").maybeSingle();
    if (error) throw error;
    return data ? JSON.parse(data.value) as VapidKeys : null;
  };
  let keys = await read();
  if (!keys) {
    // إذا سبقتنا نسخة أخرى من الوظيفة يبقى مفتاحها هي (لا يُستبدل مفتاح محفوظ أبداً)
    const fresh = await newVapidKeys();
    const { error } = await db.from("app_secrets")
      .upsert({ key: "vapid", value: JSON.stringify(fresh) }, { onConflict: "key", ignoreDuplicates: true });
    if (error) throw error;
    keys = await read();
    if (!keys) throw new Error("vapid_missing");
  }
  return vapidSigner(keys, SUBJECT);
}

async function send(sign: (endpoint: string) => Promise<string>, r: Row): Promise<Outcome> {
  if (!okEndpoint(r.endpoint)) return "gone";
  const host = new URL(r.endpoint).host;
  try {
    const p = r.payload ?? {};
    const msg = { title: String(p.title ?? ""), body: String(p.body ?? ""), tag: String(p.tag ?? ""), open: String(p.open ?? ""), t: Date.now() };
    const body = await encrypt(te.encode(JSON.stringify(msg)), r.p256dh, r.auth);
    const res = await fetch(r.endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "TTL": String(TTL),
        "Urgency": "high",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Authorization": await sign(r.endpoint),
      },
      body,
    });
    const status = res.status;
    const text = status >= 300 ? (await res.text()).slice(0, 200) : "";
    if (status < 300) await res.body?.cancel();
    if (status >= 200 && status < 300) return "ok";
    // انتهى الاشتراك (أُلغي من الجهاز أو حُذف التطبيق)
    if (status === 404 || status === 410) return "gone";
    console.warn(`push ${host} ${status} ${text}`);
    return "failed";
  } catch (e) {
    console.warn(`push ${host} error: ${e instanceof Error ? e.message : String(e)}`);
    return "failed";
  }
}

async function drain() {
  const sign = await (signer ??= loadSigner().catch((e) => {
    signer = null;
    throw e;
  }));
  const total = { sent: 0, gone: 0, failed: 0 };
  for (let round = 0; round < 10; round++) {
    const { data, error } = await db.rpc("push_claim", { p_limit: 100 });
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    if (!rows.length) break;
    const outcomes = await Promise.all(rows.map((r) => send(sign, r)));
    const ok: number[] = [], gone: number[] = [], failed: number[] = [];
    rows.forEach((r, i) => {
      const o = outcomes[i];
      (o === "ok" ? ok : o === "gone" ? gone : failed).push(r.sub_id);
      if (o === "ok") total.sent++; else total[o]++;
    });
    const done = [...new Set(rows.map((r) => r.outbox_id))];
    const { error: e2 } = await db.rpc("push_result", { p_done: done, p_ok: ok, p_gone: gone, p_failed: failed });
    if (e2) throw e2;
  }
  return total;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  try {
    return Response.json(await drain());
  } catch (e) {
    console.error("push", e);
    return Response.json({ error: "server_error" }, { status: 500 });
  }
});
