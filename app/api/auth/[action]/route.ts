import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  adminClient,
  hashPasswordServer,
  loadServerState,
  randomHex,
  requestOrigin,
  sameText,
  serverPatch,
  sha256Hex,
  type ServerPatchOp,
} from "@/lib/server/supabase-admin";
import { ADMIN_BALANCE_CENTS, ADMIN_USER_ID, isAdminEmail, type NovaState, type StoredUser } from "@/lib/store/data";
import { formatSyMobile, registerSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * v36 · Sign-in on the server. The password is checked here and the session is created here (with
 * the service-role key), so a browser can never write its own session. Actions:
 *   POST /api/auth/login       { email, password, language }
 *   POST /api/auth/email-code  { email, language }              → 6-digit code by email (Resend)
 *   POST /api/auth/register    { ...form, emailTicket, emailCode } | { ...form, supabaseToken }
 *   POST /api/auth/google      { accessToken }
 *   POST /api/auth/logout      { token }
 * Without SUPABASE_SERVICE_ROLE_KEY every action answers 503 { fallback: true } and the browser
 * uses its built-in flow (local preview).
 */

const SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_FAILED = 3;
const MAX_DAILY = 3;
const ADMIN_MAX_FAILED = 5;
const ADMIN_PAUSE_MS = 15 * 60_000;
const CODE_TTL_MS = 10 * 60_000;
const CODE_GAP_MS = 55_000;
const NO_STORE = { "Cache-Control": "no-store" };

type Lang = "ar" | "en";
const TEXT = {
  ar: {
    wrong: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    remaining: (left: number) => `كلمة المرور غير صحيحة. محاولات متبقية قبل قفل الحساب: ${left}`,
    locked: "🔒 تم قفل هذا الحساب أمنياً بعد 3 محاولات خاطئة لكلمة المرور. يرجى التواصل مع الدعم الفني لفك القفل.",
    daily: "⚠️ لقد وصلت للحد الأقصى لتسجيل الدخول اليومي (3 مرات في اليوم). يرجى المحاولة غداً أو التواصل مع الدعم الفني.",
    blocked: "هذا الحساب موقوف.",
    pause: (minutes: number) => `محاولات كثيرة خاطئة. حاول مجدداً بعد ${minutes} دقيقة.`,
    exists: "يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بدلاً من ذلك.",
    email: "عنوان البريد الإلكتروني غير صالح.",
    wait: (seconds: number) => `انتظر ${seconds} ثانية قبل طلب رمز جديد.`,
    send: "تعذّر إرسال رمز التحقق إلى بريدك الآن. حاول بعد دقيقة.",
    code: "الرمز غير صحيح أو منتهي الصلاحية، حاول مجدداً",
    tries: "محاولات كثيرة. اطلب رمزاً جديداً.",
    verify: "يجب تأكيد البريد الإلكتروني بالرمز أولاً.",
    google: "تعذّر التحقق من حساب Google. حاول مجدداً.",
    store: "تعذّر الوصول إلى المتجر الآن. حاول بعد لحظات.",
  },
  en: {
    wrong: "Email or password is incorrect.",
    remaining: (left: number) => `Wrong password. Attempts left before the account is locked: ${left}`,
    locked: "🔒 This account has been locked after 3 failed password attempts. Please contact Live Support to unlock it.",
    daily: "⚠️ You have reached the maximum daily sign-in limit (3 logins per day). Please try again tomorrow or contact support.",
    blocked: "This account is blocked.",
    pause: (minutes: number) => `Too many wrong attempts. Try again in ${minutes} minutes.`,
    exists: "An account with that email already exists. Sign in instead.",
    email: "That email address isn't valid.",
    wait: (seconds: number) => `Wait ${seconds} seconds before asking for a new code.`,
    send: "We couldn't send the verification code right now. Try again in a minute.",
    code: "The code is wrong or has expired — try again",
    tries: "Too many attempts. Ask for a new code.",
    verify: "Confirm your email with the code first.",
    google: "Google sign-in could not be verified. Please try again.",
    store: "The store can't be reached right now. Try again in a moment.",
  },
};

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const fail = (error: string, status = 400) => json({ ok: false, error }, status);

function damascusDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Damascus", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

type Ctx = { params: Promise<{ action: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { action } = await params;
  if (!adminClient()) return json({ ok: false, fallback: true, error: "Server sign-in is not configured." }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Bad request.");
  }
  const lang: Lang = body.language === "en" ? "en" : "ar";
  const text = TEXT[lang];
  try {
    if (action === "login") return await login(request, body, text);
    if (action === "email-code") return await emailCode(body, text, lang);
    if (action === "register") return await register(request, body, text);
    if (action === "google") return await google(request, body, text);
    if (action === "logout") return await logout(body);
    return fail("Not found.", 404);
  } catch {
    return fail(text.store, 500);
  }
}

/* ------------------------------ sessions ------------------------------ */

async function sessionOps(state: NovaState, userId: string): Promise<{ token: string; ops: ServerPatchOp[] }> {
  const token = randomHex(24);
  const now = Date.now();
  const ops: ServerPatchOp[] = [
    {
      op: "upsert",
      key: "sessions",
      idKey: "id",
      value: { id: `ses_${randomHex(8)}`, userId, tokenHash: await sha256Hex(token), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_MS).toISOString() },
    },
  ];
  // Tidy up: expired sessions, and the oldest ones beyond 400.
  const live = state.sessions.filter((item) => Date.parse(item.expiresAt) > now);
  const drop = [...state.sessions.filter((item) => Date.parse(item.expiresAt) <= now), ...live.slice(0, Math.max(0, live.length - 399))].slice(0, 60);
  for (const item of drop) ops.push({ op: "delete", key: "sessions", idKey: "id", id: item.id });
  return { token, ops };
}

/* ------------------------------ login ------------------------------ */

async function login(request: Request, body: Record<string, unknown>, text: (typeof TEXT)["ar"]) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password || password.length > 200) return fail(text.wrong);
  const state = await loadServerState();
  if (!state) return fail(text.store, 503);
  const user = state.users.find((item) => item.email.toLowerCase() === email);
  if (!user) {
    await hashPasswordServer(password); // same time as a real check
    return fail(text.wrong);
  }
  const exempt = user.role === "ADMIN" || isAdminEmail(user.email);
  const now = Date.now();
  if (!exempt && user.isLocked) return fail(text.locked);
  const lastFail = Date.parse(String((user as { lastFailedLoginAt?: string }).lastFailedLoginAt ?? "")) || 0;
  if (exempt && (user.failedLoginAttempts ?? 0) >= ADMIN_MAX_FAILED && now - lastFail < ADMIN_PAUSE_MS) {
    return fail(text.pause(Math.ceil((ADMIN_PAUSE_MS - (now - lastFail)) / 60_000)));
  }
  const hashed = await hashPasswordServer(password, user.passwordSalt);
  if (!sameText(hashed.passwordHash, user.passwordHash)) {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lock = !exempt && attempts >= MAX_FAILED;
    await serverPatch([
      { op: "merge", key: "users", idKey: "id", id: user.id, value: { failedLoginAttempts: attempts, lastFailedLoginAt: new Date(now).toISOString(), ...(lock ? { isLocked: true } : {}) } },
    ]);
    if (exempt) return fail(text.wrong);
    return fail(lock ? text.locked : text.remaining(MAX_FAILED - attempts));
  }
  if (user.isBlocked) return fail(text.blocked);
  const today = damascusDay();
  const counters: Record<string, unknown> = {};
  if (!exempt) {
    if (user.lastLoginDate === today && (user.dailyLoginCount ?? 0) >= MAX_DAILY) return fail(text.daily);
    counters.dailyLoginCount = user.lastLoginDate === today ? (user.dailyLoginCount ?? 0) + 1 : 1;
    counters.lastLoginDate = today;
  }
  const origin = requestOrigin(request);
  const { token, ops } = await sessionOps(state, user.id);
  const saved = await serverPatch([
    {
      op: "merge",
      key: "users",
      idKey: "id",
      id: user.id,
      value: {
        ...counters,
        failedLoginAttempts: 0,
        lastSeenAt: new Date(now).toISOString(),
        ...(origin.ip ? { lastIp: origin.ip } : {}),
        ...(origin.country ? { lastCountry: origin.country } : {}),
        ...(isAdminEmail(user.email) ? { role: "ADMIN" } : {}),
      },
    },
    ...ops,
  ]);
  if (!saved.ok) return fail(text.store, 503);
  return json({ ok: true, token, userId: user.id });
}

/* ------------------------------ email codes (Resend) ------------------------------ */

function codeSecret(): string {
  return createHmac("sha256", process.env.EMAIL_CODE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "zovacharge").update("zova-email-code").digest("hex");
}

function sign(id: string, email: string, code: string, exp: number): string {
  return createHmac("sha256", codeSecret()).update(`${id}|${email}|${code}|${exp}`).digest("hex");
}

type Ticket = { id: string; email: string; exp: number; sig: string };

function readTicket(value: unknown): Ticket | null {
  try {
    const parsed = JSON.parse(Buffer.from(String(value ?? ""), "base64url").toString("utf8")) as Ticket;
    return typeof parsed.id === "string" && typeof parsed.email === "string" && typeof parsed.exp === "number" && typeof parsed.sig === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function emailHtml(code: string, lang: Lang): string {
  const ar = lang === "ar";
  return `<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${ar ? "rtl" : "ltr"}"><body style="margin:0;background:#f8fafc;font-family:Tahoma,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:24px;border:1px solid #e2e8f0">
<tr><td style="padding:28px 24px 8px;text-align:center">
<div style="display:inline-block;padding:8px 14px;border-radius:999px;background:#e0f2fe;color:#0369a1;font-weight:700;font-size:13px">ZovaCharge · زوفا شارج</div>
<h1 style="margin:18px 0 6px;font-size:20px">${ar ? "رمز تأكيد بريدك الإلكتروني" : "Your email confirmation code"}</h1>
<p style="margin:0;color:#475569;font-size:14px;line-height:1.7">${ar ? "اكتب هذا الرمز في صفحة إنشاء الحساب. صالح لمدة 10 دقائق." : "Type this code on the sign-up page. It is valid for 10 minutes."}</p>
</td></tr>
<tr><td style="padding:18px 24px" align="center">
<div dir="ltr" style="display:inline-block;padding:16px 22px;border-radius:16px;background:#0f172a;color:#f8fafc;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px">${code}</div>
</td></tr>
<tr><td style="padding:4px 24px 26px;text-align:center;color:#64748b;font-size:12px;line-height:1.7">
${ar ? "إذا لم تطلب هذا الرمز فتجاهل هذه الرسالة. لن نطلب منك هذا الرمز عبر الهاتف أو الدردشة أبداً." : "If you didn't ask for this code, ignore this email. We will never ask you for it by phone or chat."}
</td></tr></table></td></tr></table></body></html>`;
}

async function emailCode(body: Record<string, unknown>, text: (typeof TEXT)["ar"], lang: Lang) {
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return fail(text.email);
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  // Not set up yet: the browser falls back to Supabase's own confirmation email.
  if (!key || !from) return json({ ok: false, fallback: true });
  const state = await loadServerState();
  if (!state) return fail(text.store, 503);
  if (state.users.some((user) => user.email.toLowerCase() === email)) return fail(text.exists);
  const supabase = adminClient();
  // One code per minute per email (only once SQL part 10 created the table; otherwise no limit).
  const recent = supabase ? await supabase.from("email_codes").select("created_at").eq("email", email).order("created_at", { ascending: false }).limit(1) : null;
  const last = recent && !recent.error ? Date.parse(String((recent.data?.[0] as { created_at?: string } | undefined)?.created_at ?? "")) || 0 : 0;
  if (last && Date.now() - last < CODE_GAP_MS) return fail(text.wait(Math.ceil((CODE_GAP_MS - (Date.now() - last)) / 1000)));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = randomHex(12);
  const exp = Date.now() + CODE_TTL_MS;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: lang === "ar" ? `رمز التحقق: ${code} · ZovaCharge` : `Your code: ${code} · ZovaCharge`,
      html: emailHtml(code, lang),
      text: lang === "ar" ? `رمز التحقق الخاص بك في زوفا شارج: ${code} (صالح 10 دقائق)` : `Your ZovaCharge code: ${code} (valid for 10 minutes)`,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response || !response.ok) return fail(text.send, 502);
  if (supabase) await supabase.from("email_codes").insert({ ticket: id, email });
  const ticket = Buffer.from(JSON.stringify({ id, email, exp, sig: sign(id, email, code, exp) } satisfies Ticket)).toString("base64url");
  return json({ ok: true, ticket });
}

/** Ticket + code from our own email, or a Supabase token whose email Supabase has confirmed. */
async function emailProven(email: string, body: Record<string, unknown>, text: (typeof TEXT)["ar"]): Promise<string | null> {
  const ticket = readTicket(body.emailTicket);
  if (ticket) {
    const code = String(body.emailCode ?? "").replace(/\D/g, "");
    if (ticket.email !== email || ticket.exp < Date.now() || code.length !== 6) return text.code;
    const supabase = adminClient();
    if (supabase) {
      const row = await supabase.from("email_codes").select("attempts").eq("ticket", ticket.id).maybeSingle();
      if (!row.error && row.data) {
        const attempts = Number((row.data as { attempts?: number }).attempts ?? 0);
        if (attempts >= 5) return text.tries;
        await supabase.from("email_codes").update({ attempts: attempts + 1 }).eq("ticket", ticket.id);
      }
    }
    const expected = Buffer.from(sign(ticket.id, email, code, ticket.exp), "hex");
    const given = Buffer.from(ticket.sig, "hex");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return text.code;
    if (supabase) await supabase.from("email_codes").delete().eq("ticket", ticket.id);
    return null;
  }
  const token = String(body.supabaseToken ?? "");
  if (token) {
    const { data, error } = await adminClient()!.auth.getUser(token);
    if (!error && data.user?.email?.toLowerCase() === email && data.user.email_confirmed_at) return null;
    return text.code;
  }
  return text.verify;
}

function uniqueUsername(state: NovaState, email: string): string {
  const base = (email.split("@")[0] ?? "user").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16) || "user";
  const taken = new Set(state.users.map((user) => user.username.toLowerCase()));
  let candidate = base;
  for (let attempt = 2; taken.has(candidate); attempt += 1) candidate = `${base}${attempt}`;
  return candidate;
}

async function register(request: Request, body: Record<string, unknown>, text: (typeof TEXT)["ar"]) {
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const email = parsed.data.email.trim().toLowerCase();
  const state = await loadServerState();
  if (!state) return fail(text.store, 503);
  if (state.users.some((user) => user.email.toLowerCase() === email)) return fail(text.exists);
  const problem = await emailProven(email, body, text);
  if (problem) return fail(problem);
  const hashed = await hashPasswordServer(parsed.data.password);
  const now = new Date().toISOString();
  const admin = isAdminEmail(email);
  const origin = requestOrigin(request);
  const user: StoredUser = {
    id: admin ? ADMIN_USER_ID : `usr_${randomHex(8)}`,
    name: parsed.data.name,
    username: uniqueUsername(state, email),
    email,
    phone: formatSyMobile(parsed.data.phone),
    avatarUrl: "",
    passwordHash: hashed.passwordHash,
    passwordSalt: hashed.passwordSalt,
    role: admin ? "ADMIN" : "NORMAL",
    currency: admin ? "USD" : parsed.data.currency,
    balanceCents: admin ? ADMIN_BALANCE_CENTS : 0,
    isBlocked: false,
    authProvider: "password",
    emailVerified: true,
    lastIp: origin.ip || null,
    lastCountry: origin.country || null,
    lastSeenAt: now,
    createdAt: now,
  };
  const { token, ops } = await sessionOps(state, user.id);
  const saved = await serverPatch([{ op: "upsert", key: "users", idKey: "id", value: user as unknown as Record<string, unknown>, at: "end" }, ...ops]);
  if (!saved.ok) return fail(text.store, 503);
  return json({ ok: true, token, userId: user.id });
}

/* ------------------------------ Google ------------------------------ */

async function google(request: Request, body: Record<string, unknown>, text: (typeof TEXT)["ar"]) {
  const accessToken = String(body.accessToken ?? "");
  if (!accessToken || accessToken.length > 8192) return fail(text.google);
  const { data, error } = await adminClient()!.auth.getUser(accessToken);
  const email = data.user?.email?.toLowerCase() ?? "";
  if (error || !email) return fail(text.google);
  const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  const state = await loadServerState();
  if (!state) return fail(text.store, 503);
  const origin = requestOrigin(request);
  const now = new Date().toISOString();
  const today = damascusDay();
  let user = state.users.find((item) => item.email.toLowerCase() === email);
  const ops: ServerPatchOp[] = [];
  let isNew = false;
  if (!user) {
    isNew = true;
    const admin = isAdminEmail(email);
    const hashed = await hashPasswordServer(randomHex(24)); // nobody knows it: this account signs in with Google
    user = {
      authProvider: "google",
      emailVerified: true,
      id: admin ? ADMIN_USER_ID : `usr_${randomHex(8)}`,
      name: String(meta.full_name ?? meta.name ?? email.split("@")[0]).slice(0, 60),
      username: uniqueUsername(state, email),
      email,
      phone: "",
      avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : "",
      passwordHash: hashed.passwordHash,
      passwordSalt: hashed.passwordSalt,
      role: admin ? "ADMIN" : "NORMAL",
      currency: "USD",
      balanceCents: admin ? ADMIN_BALANCE_CENTS : 0,
      isBlocked: false,
      lastIp: origin.ip || null,
      lastCountry: origin.country || null,
      lastSeenAt: now,
      createdAt: now,
      ...(admin ? {} : { dailyLoginCount: 1, lastLoginDate: today }),
    };
    ops.push({ op: "upsert", key: "users", idKey: "id", value: user as unknown as Record<string, unknown>, at: "end" });
  } else {
    if (user.isBlocked) return fail(text.blocked);
    const exempt = user.role === "ADMIN" || isAdminEmail(user.email);
    if (!exempt && user.isLocked) return fail(text.locked);
    const changes: Record<string, unknown> = { lastSeenAt: now, emailVerified: true };
    if (!exempt) {
      if (user.lastLoginDate === today && (user.dailyLoginCount ?? 0) >= MAX_DAILY) return fail(text.daily);
      changes.dailyLoginCount = user.lastLoginDate === today ? (user.dailyLoginCount ?? 0) + 1 : 1;
      changes.lastLoginDate = today;
    }
    if (!user.avatarUrl && typeof meta.avatar_url === "string") changes.avatarUrl = meta.avatar_url;
    if (origin.ip) changes.lastIp = origin.ip;
    if (origin.country) changes.lastCountry = origin.country;
    if (isAdminEmail(user.email)) changes.role = "ADMIN";
    ops.push({ op: "merge", key: "users", idKey: "id", id: user.id, value: changes });
  }
  const session = await sessionOps(state, user.id);
  const saved = await serverPatch([...ops, ...session.ops]);
  if (!saved.ok) return fail(text.store, 503);
  return json({ ok: true, token: session.token, userId: user.id, isNew });
}

/* ------------------------------ logout ------------------------------ */

async function logout(body: Record<string, unknown>) {
  const token = String(body.token ?? "");
  if (token.length < 16 || token.length > 200) return json({ ok: true });
  const state = await loadServerState();
  const hash = await sha256Hex(token);
  const session = state?.sessions.find((item) => item.tokenHash === hash);
  if (session) await serverPatch([{ op: "delete", key: "sessions", idKey: "id", id: session.id }]);
  return json({ ok: true });
}
