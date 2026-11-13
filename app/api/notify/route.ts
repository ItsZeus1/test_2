import { NextResponse } from "next/server";

import { claimEvent, pushConfigured, sendToUsers } from "@/lib/server/push";
import { adminIds, loadServerState, userFromToken } from "@/lib/server/supabase-admin";

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
  let body: { kind?: unknown; id?: unknown; messageId?: unknown; token?: unknown; since?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  // Background catch-up for the service worker: this user's own events since `since`.
  if (body.kind === "catch-up") return catchUp(body.token, body.since);
  if (!pushConfigured()) return NextResponse.json({ ok: true, skipped: "push not configured" });
  const KINDS = ["topup", "support", "recovery", "manual", "topup_result", "order_result"];
  if (typeof body.kind !== "string" || !KINDS.includes(body.kind) || typeof body.id !== "string" || body.id.length > 120) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // The upload can land a moment after the browser calls us: retry briefly.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = await loadServerState();
    if (state) {
      if (body.kind === "topup_result") {
        // Customer: their wallet request was approved or rejected.
        const item = state.balanceRequests.find((row) => row.id === body.id);
        if (item && item.status !== "PROCESSING" && item.resolvedAt && Date.now() - Date.parse(item.resolvedAt) < FRESH_MS) {
          if (!(await claimEvent(`topup_result:${item.id}`))) return NextResponse.json({ ok: true, duplicate: true });
          const approved = item.status === "APPROVED";
          const result = await sendToUsers([item.userId], {
            title: approved ? "تمت الموافقة وإضافة الرصيد" : "تم رفض طلب الشحن",
            body: `${amount(item.cents, item.currency)}${item.receiptNumber ? ` · #${item.receiptNumber}` : ""}`,
            url: "/wallet",
            tag: `topup-result-${item.id}`,
          });
          return NextResponse.json({ ok: true, ...result });
        }
      } else if (body.kind === "order_result") {
        // Customer: their manual order was completed or declined & refunded.
        const order = state.orders.find((row) => row.id === body.id);
        if (order && (order.status === "COMPLETED" || order.status === "DECLINED" || order.status === "CANCELLED_BY_ADMIN") && order.resolvedAt && Date.now() - Date.parse(order.resolvedAt) < FRESH_MS) {
          if (!(await claimEvent(`order_result:${order.id}`))) return NextResponse.json({ ok: true, duplicate: true });
          const done = order.status === "COMPLETED";
          const result = await sendToUsers([order.userId], {
            title: done ? "تم تنفيذ طلب الشحن بنجاح" : order.status === "CANCELLED_BY_ADMIN" ? "تم إلغاء الطلب وإعادة الرصيد للمحفظة" : "تم رفض الطلب وإعادة الرصيد للمحفظة",
            body: `${order.serviceName} · ${order.packageName}${order.receiptNumber ? ` · #${order.receiptNumber}` : ""}`,
            url: "/orders",
            tag: `order-result-${order.id}`,
          });
          return NextResponse.json({ ok: true, ...result });
        }
      } else if (body.kind === "topup") {
        const item = state.balanceRequests.find((row) => row.id === body.id);
        if (item && item.status === "PROCESSING" && Date.now() - Date.parse(item.createdAt) < FRESH_MS) {
          if (!(await claimEvent(`topup:${item.id}`))) return NextResponse.json({ ok: true, duplicate: true });
          const result = await sendToUsers(adminIds(state), {
            title: "طلب شحن جديد!",
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
          const result = await sendToUsers(adminIds(state), {
            title: "طلب خدمة يدوية جديد!",
            body: `${user?.name ?? "?"} · ${order.serviceName} · ${order.packageName} · ${order.targetId}`,
            url: "/admin#manual-queue",
            tag: `manual-${order.id}`,
          });
          return NextResponse.json({ ok: true, ...result });
        }
      } else {
        const ticket = (state.supportTickets ?? []).find((row) => row.id === body.id);
        // The auto-reply follows the customer's message, so find their message by id (or the last human one).
        const human = (ticket?.messages ?? []).filter((message) => !(message as { isAutoReply?: boolean }).isAutoReply);
        const last = typeof body.messageId === "string" ? human.find((message) => message.id === body.messageId) : human[human.length - 1];
        if (
          ticket &&
          last &&
          last.sender === "USER" &&
          Date.now() - Date.parse(last.createdAt) < FRESH_MS
        ) {
          if (!(await claimEvent(`msg:${last.id}`))) return NextResponse.json({ ok: true, duplicate: true });
          const recovery = (ticket as { category?: string }).category === "PASSWORD_RECOVERY";
          const result = await sendToUsers(adminIds(state), {
            title: recovery ? `🔑 طلب عاجل لاستعادة كلمة مرور من: ${ticket.userEmail}` : "رسالة دعم جديدة!",
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

async function catchUp(token: unknown, sinceRaw: unknown) {
  const state = await loadServerState();
  const user = state ? await userFromToken(state, token) : null;
  const nowIso = new Date().toISOString();
  if (!state || !user) return NextResponse.json({ ok: false, events: [], now: nowIso }, { status: 403 });
  const since = Math.max(Date.now() - 3 * 86_400_000, Date.parse(String(sinceRaw)) || 0);
  const after = (iso?: string | null) => Boolean(iso) && Date.parse(iso as string) > since;
  const events: Array<{ title: string; body: string; url: string; tag: string }> = [];
  if (user.role === "ADMIN") {
    for (const item of state.balanceRequests) {
      if (item.status === "PROCESSING" && after(item.createdAt)) {
        events.push({ title: "طلب شحن جديد!", body: `${item.username} · ${amount(item.cents, item.currency)} · ${METHOD[item.method ?? "SHAMCASH"]}`, url: "/admin#topup-queue", tag: `topup-${item.id}` });
      }
    }
    for (const order of state.orders) {
      if (order.status === "PENDING_MANUAL" && after(order.createdAt)) {
        events.push({ title: "طلب خدمة يدوية جديد!", body: `${order.serviceName} · ${order.packageName}`, url: "/admin#manual-queue", tag: `manual-${order.id}` });
      }
    }
    for (const ticket of state.supportTickets ?? []) {
      const last = [...ticket.messages].reverse().find((message) => message.sender === "USER");
      if (last && after(last.createdAt) && ticket.status !== "CLOSED") {
        const recovery = (ticket as { category?: string }).category === "PASSWORD_RECOVERY";
        events.push({ title: recovery ? `🔑 طلب عاجل لاستعادة كلمة مرور من: ${ticket.userEmail}` : "رسالة دعم جديدة!", body: `${ticket.userName}: ${last.text.slice(0, 100)}`, url: "/admin#support-inbox", tag: `msg-${ticket.id}` });
      }
    }
  } else {
    for (const item of state.balanceRequests) {
      if (item.userId === user.id && item.status !== "PROCESSING" && after(item.resolvedAt)) {
        const ok = item.status === "APPROVED";
        events.push({ title: ok ? "تمت الموافقة وإضافة الرصيد" : "تم رفض طلب الشحن", body: amount(item.cents, item.currency), url: "/wallet", tag: `topup-result-${item.id}` });
      }
    }
    for (const order of state.orders) {
      if (order.userId === user.id && ["COMPLETED", "DECLINED", "CANCELLED_BY_ADMIN"].includes(order.status) && after(order.resolvedAt)) {
        events.push({
          title: order.status === "COMPLETED" ? "تم تنفيذ طلب الشحن بنجاح" : "تم إلغاء/رفض الطلب وإعادة الرصيد",
          body: `${order.serviceName} · ${order.packageName}`,
          url: "/orders",
          tag: `order-result-${order.id}`,
        });
      }
    }
  }
  return NextResponse.json({ ok: true, events: events.slice(0, 10), now: nowIso });
}

