import { NextResponse } from "next/server";

import { claimTelegramEvent, sendTelegram, telegramConfigured, tgEscape } from "@/lib/server/push";
import { loadServerState } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRESH_MS = 15 * 60_000;
const KINDS = ["topup", "manual", "support", "recovery", "honeypot"] as const;
type Kind = (typeof KINDS)[number];
const METHOD: Record<string, string> = { SHAMCASH: "شام كاش", SYRIATEL_CASH: "سيريتل كاش", MTN_CASH: "MTN كاش" };

const money = (cents: number, currency?: string) =>
  currency === "SYP" ? `${Math.round(cents / 100).toLocaleString("en-US")} SYP` : `$${(cents / 100).toFixed(2)}`;
const fresh = (iso?: string | null) => Boolean(iso) && Date.now() - Date.parse(iso as string) < FRESH_MS;

/**
 * v35 · Fire-and-forget admin alerts through a Telegram bot (TELEGRAM_BOT_TOKEN +
 * TELEGRAM_ADMIN_CHAT_ID, server-only). The browser only sends {kind, id}: the text is built here
 * from the saved event, each event is sent once, and old events are ignored, so the endpoint
 * can't be used to spam the chat. Without the env vars it answers { ok: true, skipped: true }.
 */
export async function POST(request: Request) {
  if (!telegramConfigured()) return NextResponse.json({ ok: true, skipped: true });
  let body: { kind?: unknown; id?: unknown; messageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const kind = body.kind as Kind;
  if (!KINDS.includes(kind) || typeof body.id !== "string" || body.id.length > 120) return NextResponse.json({ ok: false }, { status: 400 });
  const id = body.id;

  // The browser's save can land a moment after it calls us: retry briefly.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = await loadServerState();
    const built = state ? build(state, kind, id, typeof body.messageId === "string" ? body.messageId : undefined) : null;
    if (built) {
      if (!(await claimTelegramEvent(`tg:${built.key}`))) return NextResponse.json({ ok: true, duplicate: true });
      const sent = await sendTelegram(built.text);
      return NextResponse.json({ ok: true, sent });
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return NextResponse.json({ ok: true, skipped: "event not found" });
}

type State = NonNullable<Awaited<ReturnType<typeof loadServerState>>>;

function build(state: State, kind: Kind, id: string, messageId?: string): { key: string; text: string } | null {
  if (kind === "topup") {
    const item = state.balanceRequests.find((row) => row.id === id);
    if (!item || item.status !== "PROCESSING" || !fresh(item.createdAt)) return null;
    const user = state.users.find((row) => row.id === item.userId);
    const sender = item.method === "SHAMCASH" || !item.method ? item.senderName : item.senderPhone;
    const lines = [
      "💰 <b>طلب شحن جديد · New top-up</b>",
      `👤 ${tgEscape(user?.name ?? item.username)} (@${tgEscape(item.username)})`,
      `💵 ${tgEscape(money(item.cents, item.currency))} · ${tgEscape(METHOD[item.method ?? "SHAMCASH"] ?? item.method)}`,
      `🧾 رقم العملية: <code>${tgEscape(item.transactionRef || item.transferNumber || "—")}</code>`,
      sender ? `📤 المرسل: ${tgEscape(sender)}` : "",
      item.isDuplicateRef ? "🚨 <b>DUPLICATE REF WARNING · رقم العملية مكرر ومستخدم مسبقاً!</b>" : "",
      item.receiptNumber ? `#${tgEscape(item.receiptNumber)}` : "",
    ];
    return { key: `topup:${item.id}`, text: lines.filter(Boolean).join("\n") };
  }
  if (kind === "manual") {
    const order = state.orders.find((row) => row.id === id);
    if (!order || order.status !== "PENDING_MANUAL" || !fresh(order.createdAt)) return null;
    const user = state.users.find((row) => row.id === order.userId);
    const fields = (order.fields ?? []).map((field) => `• ${tgEscape(field.labelAr || field.labelEn)}: <code>${tgEscape(field.value)}</code>`);
    const lines = [
      "🎮 <b>طلب يدوي جديد · New manual order</b>",
      `👤 ${tgEscape(user?.name ?? "?")}${user?.email ? ` · ${tgEscape(user.email)}` : ""}`,
      `🛒 ${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}`,
      `💵 ${tgEscape(money(order.priceCents, order.currency))}`,
      ...(fields.length ? fields : [`🆔 <code>${tgEscape(order.targetId || "—")}</code>`]),
      order.receiptNumber ? `#${tgEscape(order.receiptNumber)}` : "",
    ];
    return { key: `manual:${order.id}`, text: lines.filter(Boolean).join("\n") };
  }
  if (kind === "support" || kind === "recovery") {
    const ticket = (state.supportTickets ?? []).find((row) => row.id === id);
    if (!ticket) return null;
    const human = ticket.messages.filter((message) => message.sender === "USER" && !(message as { isAutoReply?: boolean }).isAutoReply);
    const last = messageId ? human.find((message) => message.id === messageId) : human[human.length - 1];
    if (!last || !fresh(last.createdAt)) return null;
    const recovery = (ticket as { category?: string }).category === "PASSWORD_RECOVERY";
    const lines = [
      recovery ? "🔑 <b>طلب استعادة كلمة مرور · Password recovery</b>" : "💬 <b>رسالة دعم جديدة · New support message</b>",
      `👤 ${tgEscape(ticket.userName)}${ticket.userEmail ? ` · ${tgEscape(ticket.userEmail)}` : ""}`,
      `“${tgEscape((last.text || "📷 صورة").slice(0, 400))}”`,
      "/admin#support-inbox",
    ];
    return { key: `msg:${last.id}`, text: lines.join("\n") };
  }
  // honeypot
  const event = (state.honeypotEvents ?? []).find((row) => row.id === id);
  if (!event || !fresh(event.createdAt)) return null;
  const lines = [
    "🍯 <b>تنبيه أمني: محاولة دخول غير مصرح لصفحة الإدارة</b>",
    `📍 ${tgEscape(event.attemptedPath)}`,
    event.fullName || event.email ? `👤 ${tgEscape(event.fullName ?? "")} ${tgEscape(event.email ?? "")}`.trim() : "👤 زائر غير مسجّل · signed-out visitor",
    `🌐 IP: <code>${tgEscape(event.ip ?? "?")}</code>${event.country ? ` · ${tgEscape(event.country)}` : ""}`,
  ];
  return { key: `trap:${event.id}`, text: lines.join("\n") };
}
