import { NextResponse } from "next/server";

import { claimEvent, pushConfigured, sendToAdmins } from "@/lib/server/push";
import { loadServerState } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRESH_MS = 15 * 60_000;
const METHOD: Record<string, string> = { SHAMCASH: "شام كاش", SYRIATEL_CASH: "سيريتل كاش", MTN_CASH: "MTN كاش" };

function amount(cents: number, currency?: string) {
  return currency === "SYP" ? `${Math.round(cents / 100).toLocaleString("en-US")} SYP` : `$${(cents / 100).toFixed(2)}`;
}

/**
 * Called by the customer's browser right after a new top-up request or support message is saved.
 * The server re-reads Supabase and only alerts for an event that really exists, is recent,
 * and has not been announced yet, so the endpoint cannot be used to spam the admin.
 */
export async function POST(request: Request) {
  if (!pushConfigured()) return NextResponse.json({ ok: true, skipped: "push not configured" });
  let body: { kind?: unknown; id?: unknown; messageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if ((body.kind !== "topup" && body.kind !== "support" && body.kind !== "manual") || typeof body.id !== "string" || body.id.length > 120) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // The upload can land a moment after the browser calls us: retry briefly.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = await loadServerState();
    if (state) {
      if (body.kind === "topup") {
        const item = state.balanceRequests.find((row) => row.id === body.id);
        if (item && item.status === "PROCESSING" && Date.now() - Date.parse(item.createdAt) < FRESH_MS) {
          if (!(await claimEvent(`topup:${item.id}`))) return NextResponse.json({ ok: true, duplicate: true });
          const result = await sendToAdmins({
            title: "💰 طلب شحن جديد!",
            body: `${item.username} · ${amount(item.cents, item.currency)} · ${METHOD[item.method ?? "SHAMCASH"]}`,
            url: "/admin#topup-queue",
            tag: `topup-${item.id}`,
          });
          return NextResponse.json({ ok: true, ...result });
        }
      } else if (body.kind === "manual") {
        const order = state.orders.find((row) => row.id === body.id);
        if (order && order.status === "PENDING_MANUAL" && Date.now() - Date.parse(order.createdAt) < FRESH_MS) {
          if (!(await claimEvent(`manual:${order.id}`))) return NextResponse.json({ ok: true, duplicate: true });
          const user = state.users.find((row) => row.id === order.userId);
          const result = await sendToAdmins({
            title: "🌐 طلب خدمة يدوية جديد!",
            body: `${user?.name ?? "?"} · ${order.serviceName} · ${order.packageName} · ${order.targetId}`,
            url: "/admin#manual-queue",
            tag: `manual-${order.id}`,
          });
          return NextResponse.json({ ok: true, ...result });
        }
      } else {
        const ticket = (state.supportTickets ?? []).find((row) => row.id === body.id);
        const last = ticket?.messages[ticket.messages.length - 1];
        if (
          ticket &&
          last &&
          last.sender === "USER" &&
          (typeof body.messageId !== "string" || last.id === body.messageId) &&
          Date.now() - Date.parse(last.createdAt) < FRESH_MS
        ) {
          if (!(await claimEvent(`msg:${last.id}`))) return NextResponse.json({ ok: true, duplicate: true });
          const result = await sendToAdmins({
            title: "💬 رسالة دعم جديدة!",
            body: `${ticket.userName}: ${last.text.slice(0, 120)}`,
            url: "/admin#support-inbox",
            tag: `msg-${ticket.id}`,
          });
          return NextResponse.json({ ok: true, ...result });
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return NextResponse.json({ ok: true, skipped: "event not found" });
}
