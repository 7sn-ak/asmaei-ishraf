// Web Push بأدوات التشفير المدمجة (Web Crypto) دون أي مكتبة خارجية:
//   RFC 8291: تشفير نص الإشعار لكل جهاز (aes128gcm)، فخادم الإشعارات لا يقرؤه.
//   RFC 8292: توقيع VAPID، فلا يرسل لأجهزتنا إلا من يملك المفتاح الخاص.

const te = new TextEncoder();
// بايتات على ArrayBuffer عادي (ما تقبله Web Crypto و fetch)
type Bytes = Uint8Array<ArrayBuffer>;
const utf8 = (s: string): Bytes => new Uint8Array(te.encode(s));

export function b64u(data: Uint8Array | ArrayBuffer): string {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// يقبل base64url وbase64 العادي، بحشو أو بدونه
export function fromB64u(s: string): Bytes {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

// تشفير نص الإشعار لجهاز واحد، بمفتاحيه من المتصفح (p256dh و auth)
export async function encrypt(plain: Uint8Array, p256dh: string, authSecret: string): Promise<Bytes> {
  const ua = fromB64u(p256dh), secret = fromB64u(authSecret);
  if (ua.length !== 65 || ua[0] !== 4 || secret.length !== 16) throw new Error("bad_keys");
  if (plain.length > 3000) throw new Error("too_long");
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(secret, shared, concat(utf8("WebPush: info\0"), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // سجل واحد: النص ثم 0x02 (آخر سجل)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plain, new Uint8Array([2]))));
  // الرأس: salt (16) | حجم السجل 4096 (4) | طول المفتاح 65 (1) | المفتاح العام المؤقت (65)
  const head = new Uint8Array(21);
  head.set(salt, 0);
  new DataView(head.buffer).setUint32(16, 4096);
  head[20] = 65;
  return concat(head, asPub, ct);
}

export type VapidKeys = { public: string; jwk: JsonWebKey };

// زوج مفاتيح VAPID جديد (يُولَّد مرة واحدة ويُحفظ في قاعدة البيانات)
export async function newVapidKeys(): Promise<VapidKeys> {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { public: b64u(pub), jwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d } };
}

// يرجع دالة تعطي رأس Authorization لكل خادم إشعارات، وتعيد استخدامه حتى يقترب انتهاؤه
export async function vapidSigner(keys: VapidKeys, subject: string): Promise<(endpoint: string) => Promise<string>> {
  const { kty, crv, x, y, d } = keys.jwk;
  const key = await crypto.subtle.importKey("jwk", { kty, crv, x, y, d }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const cache = new Map<string, { header: string; exp: number }>();
  return async (endpoint: string) => {
    const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
    const hit = cache.get(aud);
    if (hit && hit.exp - now > 3600) return hit.header;
    const exp = now + 12 * 3600;
    const unsigned = b64u(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" }))) + "." +
      b64u(utf8(JSON.stringify({ aud, exp, sub: subject })));
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(unsigned));
    const header = `vapid t=${unsigned}.${b64u(sig)}, k=${keys.public}`;
    cache.set(aud, { header, exp });
    return header;
  };
}

// خوادم الإشعارات المعروفة فقط: Google (Chrome وأندرويد)، Apple (آيفون وماك)، Mozilla (Firefox)، Microsoft (Edge)
const HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/;
export function okEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && u.port === "" && !u.username && !u.password && HOSTS.test(u.hostname);
  } catch (_e) {
    return false;
  }
}
