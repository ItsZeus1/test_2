import { NextResponse } from "next/server";

import { CLOUD_ROW_ID, CLOUD_TABLE, type NovaState } from "@/lib/store/data";
import { adminClient, loadServerState } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 2 * 60_000;
const MAX_ATTEMPTS = 5;

const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

/** Code hash (never the code itself) — salted with the email and a server secret. */
async function codeHash(email: string, code: string): Promise<string> {
  const pepper = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").slice(-24);
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${email}|${code}|${pepper}`)));
}

/** Same PBKDF2 scheme the app uses (100 000 × SHA-256, 16-byte salt). */
async function hashPassword(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" }, key, 256);
  return { passwordHash: hex(bits), passwordSalt: hex(salt) };
}

function emailHtml(code: string, ar: boolean): string {
  const digits = code.split("").map((d) => `<span style="display:inline-block;width:42px;height:52px;line-height:52px;margin:0 3px;border-radius:12px;background:#F8FAFC;border:1px solid #CBD5E1;font:800 26px/52px 'Courier New',monospace;color:#0F172A">${d}</span>`).join("");
  const title = ar ? "رمز إعادة تعيين كلمة المرور" : "Your password reset code";
  const lead = ar ? "استخدم هذا الرمز لإعادة تعيين كلمة مرور حسابك في زوفا شارج. صالح لمدة 10 دقائق." : "Use this code to reset your ZovaCharge password. It is valid for 10 minutes.";
  const foot = ar ? "إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة — حسابك بأمان." : "If you didn't request this code, ignore this email — your account is safe.";
  return `<!doctype html><html dir="${ar ? "rtl" : "ltr"}"><body style="margin:0;background:#E2E8F0;font-family:Tahoma,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
  <table width="100%" style="max-width:480px;background:#FFFFFF;border-radius:28px;border:1px solid #CBD5E1;overflow:hidden">
    <tr><td style="background:linear-gradient(90deg,#0F172A,#1E3A8A,#0284C7);padding:20px 24px;color:#FFFFFF;font-weight:800;font-size:18px">ZovaCharge · زوفا شارج</td></tr>
    <tr><td style="padding:28px 24px;color:#0F172A">
      <h1 style="margin:0 0 8px;font-size:20px">${title}</h1>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6">${lead}</p>
      <div dir="ltr" style="text-align:center;margin:8px 0 20px">${digits}</div>
      <p style="margin:0;color:#64748B;font-size:12px">${foot}</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

async function sendEmail(to: string, code: string, ar: boolean): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "ZovaCharge Security <security@zovacharge.com>",
      to: [to],
      subject: ar ? `رمز التحقق: ${code} — زوفا شارج` : `Your ZovaCharge code: ${code}`,
      html: emailHtml(code, ar),
    }),
  }).catch(() => null);
  return Boolean(response?.ok);
}

/** Writes a changed store back with a version bump (clients pull it like any other update). */
async function saveState(next: NovaState, expectedVersion: number): Promise<boolean> {
  const supabase = adminClient();
  if (!supabase) return false;
  const updatedAt = new Date().toISOString();
  const payload = { ...next, version: expectedVersion + 1, updatedAt };
  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .update({ version: payload.version, payload, updated_at: updatedAt })
    .eq("id", CLOUD_ROW_ID)
    .eq("version", expectedVersion)
    .select("id");
  return !error && Array.isArray(data) && data.length === 1;
}

/**
 * Password reset by 6-digit email code (Resend).
 *  { action: "send", email, lang }                  → always answers ok (no account probing)
 *  { action: "verify", email, code, newPassword }   → checks code + expiry, sets the new password
 * Codes are generated, hashed and checked on the server only (table: password_resets).
 */
export async function POST(request: Request) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Password reset is not configured on the server." }, { status: 503 });
  let body: { action?: unknown; email?: unknown; lang?: unknown; code?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 160) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });

  if (body.action === "send") {
    const ar = body.lang !== "en";
    const state = await loadServerState();
    const user = state?.users.find((item) => item.email.toLowerCase() === email && !item.isBlocked);
    if (!user) return NextResponse.json({ ok: true }); // same answer either way
    const { data: existing } = await supabase.from("password_resets").select("created_at").eq("email", email).maybeSingle();
    if (existing && Date.now() - Date.parse(existing.created_at as string) < RESEND_COOLDOWN_MS) {
      return NextResponse.json({ ok: true, cooldown: true });
    }
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const { error } = await supabase.from("password_resets").upsert(
      { email, code_hash: await codeHash(email, code), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(), attempts: 0, created_at: new Date().toISOString() },
      { onConflict: "email" },
    );
    if (error) return NextResponse.json({ ok: false, error: `Run migrations/novacharge.sql part 6 (${error.message}).` }, { status: 500 });
    const sent = await sendEmail(email, code, ar);
    return NextResponse.json({ ok: true, emailed: sent });
  }

  if (body.action === "verify") {
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (code.length !== 6) return NextResponse.json({ ok: false, error: "Enter the 6-digit code." }, { status: 400 });
    if (newPassword.length < 8 || newPassword.length > 128) return NextResponse.json({ ok: false, error: "Use at least 8 characters for the new password." }, { status: 400 });
    const { data: row } = await supabase.from("password_resets").select("code_hash,expires_at,attempts").eq("email", email).maybeSingle();
    if (!row || Date.parse(row.expires_at as string) < Date.now()) {
      return NextResponse.json({ ok: false, error: "The code has expired. Request a new one." }, { status: 400 });
    }
    if ((row.attempts as number) >= MAX_ATTEMPTS) {
      return NextResponse.json({ ok: false, error: "Too many attempts. Request a new code." }, { status: 429 });
    }
    if ((await codeHash(email, code)) !== row.code_hash) {
      await supabase.from("password_resets").update({ attempts: (row.attempts as number) + 1 }).eq("email", email);
      return NextResponse.json({ ok: false, error: "The code is incorrect." }, { status: 400 });
    }
    // Code is valid: set the new password (retry on concurrent saves), sign out other sessions.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data: current } = await supabase.from(CLOUD_TABLE).select("version,payload").eq("id", CLOUD_ROW_ID).maybeSingle();
      if (!current) break;
      const state = current.payload as NovaState;
      const user = state.users.find((item) => item.email.toLowerCase() === email);
      if (!user) break;
      const hashed = await hashPassword(newPassword);
      user.passwordHash = hashed.passwordHash;
      user.passwordSalt = hashed.passwordSalt;
      state.sessions = state.sessions.filter((session) => session.userId !== user.id);
      if (await saveState(state, current.version as number)) {
        await supabase.from("password_resets").delete().eq("email", email);
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ ok: false, error: "Could not update the password right now. Please try again." }, { status: 409 });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
