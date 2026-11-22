import { NextResponse } from "next/server";

import { adminClient, loadServerState, userFromToken } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* v36: GET /api/push/status and POST /api/push/subscribe share one file (same URLs). */
type Ctx = { params: Promise<{ action: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { action } = await params;
  if (action === "status") return statusGet();
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}

export async function POST(request: Request, { params }: Ctx) {
  const { action } = await params;
  if (action === "subscribe") return subscribePost(request);
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}

/** Which pieces of the push setup exist on the server (booleans only, never the values). */
function statusGet() {
  return NextResponse.json({
    publicKey: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()),
    privateKey: Boolean(process.env.VAPID_PRIVATE_KEY?.trim()),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  });
}

type Body = {
  token?: unknown;
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
};

/** Saves a device's push address for the signed-in user (admins get admin alerts, customers get their own order/top-up results). */
async function subscribePost(request: Request) {
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
  const admin = state ? await userFromToken(state, body.token) : null;
  if (!admin) return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 403 });

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint, p256dh, auth, user_id: admin.id, user_email: admin.email }, { onConflict: "endpoint" });
  if (error) {
    return NextResponse.json({ ok: false, error: `Run migrations/novacharge.sql (part 2) in Supabase (${error.message}).` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
