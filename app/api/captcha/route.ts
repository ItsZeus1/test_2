import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v27 — verifies a Cloudflare Turnstile token (sign-in / sign-up security check).
 * Needs TURNSTILE_SECRET_KEY (or SUPABASE_CAPTCHA_SECRET_KEY) in Vercel; the matching site key is
 * NEXT_PUBLIC_SUPABASE_CAPTCHA_SITE_KEY. Without a secret the widget's token is accepted as-is,
 * so the form keeps working while you finish the setup.
 */
export async function POST(request: Request) {
  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token.slice(0, 2048) : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
  const secret = (process.env.TURNSTILE_SECRET_KEY ?? process.env.SUPABASE_CAPTCHA_SECRET_KEY ?? "").trim();
  if (!secret) return NextResponse.json({ ok: true, verified: false });
  const form = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) form.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const result = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    return NextResponse.json({ ok: result.success === true, verified: true, errors: result["error-codes"] ?? [] });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not reach Cloudflare." }, { status: 502 });
  }
}
