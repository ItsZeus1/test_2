import { NextResponse } from "next/server";

import { adminClient, adminFromToken, loadServerState } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  token?: unknown;
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
};

/** Saves an admin device's push address. Only a valid, unexpired ADMIN session may subscribe. */
export async function POST(request: Request) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503 });
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ ok: false, error: "Invalid subscription." }, { status: 400 });
  }
  const state = await loadServerState();
  const admin = state ? await adminFromToken(state, body.token) : null;
  if (!admin) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint, p256dh, auth, user_id: admin.id, user_email: admin.email }, { onConflict: "endpoint" });
  if (error) {
    return NextResponse.json({ ok: false, error: `Run migrations/0003_push.sql in Supabase (${error.message}).` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
