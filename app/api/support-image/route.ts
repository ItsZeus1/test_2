import { NextResponse } from "next/server";

import { adminClient, loadServerStateWhere, userFromToken } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ~120 KB of image ≈ 160 K base64 characters; anything larger is refused. */
const MAX_DATA_URL = 175_000;
const DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { action?: unknown; token?: unknown; guestKey?: unknown; ticketId?: unknown; data?: unknown; id?: unknown };

/**
 * Support-chat photos, kept out of the public store row.
 *  - upload: signed-in user (own ticket or a new one), admin (any ticket) or a guest holding the
 *            recovery ticket's private key.
 *  - get:    the admin, the uploader, the ticket owner, or that guest.
 */
export async function POST(request: Request) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503 });
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  // A ticket created a moment ago may still be uploading: wait briefly for it to land.
  const wantTicket = typeof body.ticketId === "string" && body.ticketId ? body.ticketId : null;
  const state = await loadServerStateWhere((current) => !wantTicket || (current.supportTickets ?? []).some((ticket) => ticket.id === wantTicket), wantTicket ? 4 : 1);
  if (!state) return NextResponse.json({ ok: false, error: "Store not found." }, { status: 503 });
  const user = await userFromToken(state, body.token);
  const isAdmin = user?.role === "ADMIN";
  const tickets = state.supportTickets ?? [];
  const guestTicket = (ticketId: unknown) =>
    typeof ticketId === "string" && typeof body.guestKey === "string" && body.guestKey.length >= 16
      ? tickets.find((ticket) => ticket.id === ticketId && ticket.guest === true && ticket.guestKey === body.guestKey)
      : undefined;

  if (body.action === "upload") {
    if (typeof body.data !== "string" || body.data.length > MAX_DATA_URL) {
      return NextResponse.json({ ok: false, error: "The photo is too large." }, { status: 413 });
    }
    const match = DATA_URL.exec(body.data);
    if (!match) return NextResponse.json({ ok: false, error: "Only JPEG, WebP or PNG photos are accepted." }, { status: 415 });
    const ticketId = wantTicket;
    if (ticketId && !tickets.some((ticket) => ticket.id === ticketId)) {
      return NextResponse.json({ ok: false, error: "Ticket not found." }, { status: 404 });
    }
    let allowed = false;
    if (isAdmin) allowed = Boolean(ticketId);
    else if (user) allowed = !ticketId || tickets.some((ticket) => ticket.id === ticketId && ticket.userId === user.id);
    else allowed = Boolean(guestTicket(ticketId));
    if (!allowed) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
    const { data, error } = await supabase
      .from("support_images")
      .insert({ owner_user_id: user?.id ?? null, ticket_id: ticketId, mime: match[1], data: body.data })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ ok: false, error: `Photo storage is not set up — run migrations/novacharge.sql part 6 (${error.message}).` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: (data as { id: string }).id });
  }

  if (body.action === "get") {
    if (typeof body.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ ok: false, error: "Bad photo id." }, { status: 400 });
    const { data, error } = await supabase.from("support_images").select("owner_user_id,ticket_id,data").eq("id", body.id).maybeSingle();
    if (error || !data) return NextResponse.json({ ok: false, error: "Photo not found." }, { status: 404 });
    const row = data as { owner_user_id: string | null; ticket_id: string | null; data: string };
    const ownsTicket = Boolean(user && row.ticket_id && tickets.some((ticket) => ticket.id === row.ticket_id && ticket.userId === user.id));
    const allowed = isAdmin || (user !== null && row.owner_user_id === user.id) || ownsTicket || Boolean(guestTicket(row.ticket_id));
    if (!allowed) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
    return NextResponse.json({ ok: true, data: row.data }, { headers: { "Cache-Control": "private, max-age=86400" } });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
