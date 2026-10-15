// أدوات مشتركة بين وظائف الخادم.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

// يجب أن يطابق USER_DOMAIN في site/js/config.js
// اسم المستخدم يتحول داخلياً إلى بريد وهمي لا يُرسل إليه شيء: khaled → khaled@staff.asmaei.invalid
export const USER_DOMAIN = "staff.asmaei.invalid";
export const ROLES = ["supervisor", "head", "vp", "principal", "affairs"];
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;

export const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

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

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const emailFor = (username: string) => `${username}@${USER_DOMAIN}`;
export const cleanName = (n: unknown) => (typeof n === "string" ? n.trim().replace(/\s+/g, " ") : "");
export const cleanUsername = (u: unknown) => (typeof u === "string" ? u.trim().toLowerCase() : "");
export const okPassword = (p: unknown): p is string => typeof p === "string" && p.length >= 6 && p.length <= 72;

export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch (_e) {
    return null;
  }
}
