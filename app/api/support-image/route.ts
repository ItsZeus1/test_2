import { NextResponse } from "next/server";

import { adminClient, loadServerStateWhere, userFromToken } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ~120 KB of image ≈ 160 K base64 characters; anything larger is refused. */
const MAX_DATA_URL = 175_000;
const DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { action?: unknown; token?: unknown; guestKey?: unknown; ticketId?: unknown; data?: unknown; id?: unknown; kind?: unknown; term?: unknown; url?: unknown };

/* ------------------------------ v32: official artwork lookup ------------------------------ */

type StoreApp = { trackName?: string; artworkUrl512?: string; artworkUrl100?: string };

/** Lowercase, Latin/Arabic letters and digits only — for comparing app names. */
const plain = (value: string) =>
  value
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[^a-z0-9\u0621-\u064a]+/g, " ")
    .trim();

/** How well an App Store title matches what we searched for (0 = unrelated). */
function matchScore(title: string, term: string): number {
  const a = plain(title);
  const b = plain(term);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.startsWith(b) || a.includes(b)) return 80;
  const words = b.split(" ").filter((word) => word.length > 1);
  const hits = words.filter((word) => a.includes(word)).length;
  return words.length ? Math.round((hits / words.length) * 60) : 0;
}

/**
 * Finds the game / app in Apple's public App Store search (US, then UAE and Saudi stores)
 * and returns its official icon at 1024 px. Admin-only; the browser compresses it to WebP.
 */
async function officialArtwork(term: string): Promise<{ url: string; matched: string } | null> {
  let best: { url: string; matched: string; score: number } | null = null;
  for (const country of ["us", "ae", "sa"]) {
    try {
      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&limit=8&country=${country}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { results?: StoreApp[] };
      for (const app of data.results ?? []) {
        const art = app.artworkUrl512 ?? app.artworkUrl100;
        if (!art || !app.trackName) continue;
        const score = matchScore(app.trackName, term);
        if (!best || score > best.score) best = { url: art.replace(/\/\d+x\d+bb\.(png|jpg|webp)$/i, "/1024x1024bb.jpg"), matched: app.trackName, score };
      }
    } catch {
      /* try the next store */
    }
    if (best && best.score >= 80) break;
  }
  return best && best.score >= 40 ? { url: best.url, matched: best.matched } : null;
}

/** Downloads an image (https only, ≤ 4 MB) and returns it as a data URL for the admin's browser. */
async function imageAsDataUrl(url: string): Promise<string | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !/^image\/(png|jpe?g|webp|gif)/i.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 3 * 1024 * 1024) return null; // stays under the 4.5 MB response limit as base64
    return `data:${type.split(";")[0]};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

/** v29: public bucket for store media (banners, service icons, group covers, avatars). */
const MEDIA_BUCKET = "zovacharge-media";
/** Compressed WebP from the browser is ~20–150 KB; refuse anything near 1 MB. */
const MAX_MEDIA_DATA_URL = 900_000;
const MEDIA_KINDS = new Set(["banner", "service", "group", "avatar"]);

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
  // v32 — official artwork: search the App Store by name (or fetch a given https URL) for the admin.
  if (body.action === "artwork") {
    if (!isAdmin) return NextResponse.json({ ok: false, error: "Admin only." }, { status: 403 });
    const term = typeof body.term === "string" ? body.term.trim().slice(0, 80) : "";
    const direct = typeof body.url === "string" ? body.url.trim().slice(0, 500) : "";
    const found = direct ? { url: direct, matched: "" } : term ? await officialArtwork(term) : null;
    if (!found) return NextResponse.json({ ok: false, error: "No official artwork found." }, { status: 404 });
    const dataUrl = await imageAsDataUrl(found.url);
    if (!dataUrl) return NextResponse.json({ ok: false, error: "The artwork could not be downloaded." }, { status: 502 });
    return NextResponse.json({ ok: true, dataUrl, matched: found.matched });
  }

  // v29 — media upload: compressed image → public Storage bucket → short CDN URL.
  if (body.action === "media") {
    const kind = typeof body.kind === "string" && MEDIA_KINDS.has(body.kind) ? body.kind : "";
    const allowed = kind === "avatar" ? Boolean(user) : Boolean(kind) && isAdmin;
    if (!allowed) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
    if (typeof body.data !== "string" || body.data.length > MAX_MEDIA_DATA_URL) {
      return NextResponse.json({ ok: false, error: "The image is too large." }, { status: 413 });
    }
    const match = DATA_URL.exec(body.data);
    if (!match) return NextResponse.json({ ok: false, error: "Only JPEG, WebP or PNG images are accepted." }, { status: 415 });
    const mime = match[1];
    const ext = mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg";
    const bytes = Buffer.from(match[2], "base64");
    const path = `${kind}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const put = () => supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mime, cacheControl: "31536000", upsert: false });
    let uploaded = await put();
    if (uploaded.error && /bucket/i.test(uploaded.error.message)) {
      // First upload ever: create the public bucket, then retry once.
      await supabase.storage.createBucket(MEDIA_BUCKET, { public: true, fileSizeLimit: 2 * 1024 * 1024 });
      uploaded = await put();
    }
    if (uploaded.error) return NextResponse.json({ ok: false, error: `Media storage: ${uploaded.error.message}` }, { status: 500 });
    const url = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
    return NextResponse.json({ ok: true, url });
  }

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
