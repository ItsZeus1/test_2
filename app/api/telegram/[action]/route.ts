import { NextResponse } from "next/server";

import {
  adminChatIds,
  claimTelegramEvent,
  sendTelegram,
  telegramApi,
  telegramBotUsername,
  telegramConfigured,
  telegramWebhookSecret,
  tgEscape,
  userChatIds,
} from "@/lib/server/push";
import { adminClient, loadServerState, ownerFromRequest, randomHex, userFromToken } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * v36 · One Telegram bot for everyone.
 *   POST /api/telegram/webhook   Telegram → us (checked with a secret header): /start CODE links, /stop unlinks
 *   POST /api/telegram/link      { token }          → one-time https://t.me/<bot>?start=<code> for this account
 *   POST /api/telegram/status    { token }          → is this account linked?
 *   POST /api/telegram/unlink    { token }
 *   POST /api/telegram/admin     { token, op }      → owner only: setup | list | link | remove
 *   POST /api/telegram/notify    { kind, id }       → alert for a saved event (built and routed here)
 * Customers only ever receive their own alerts; admin alerts go to the (max 3) admin chats only.
 * Chat ids live in public.telegram_links (server only), never in the public store.
 */

const FRESH_MS = 15 * 60_000;
const MAX_ADMINS = 3;
const CODE_TTL_MS = 30 * 60_000;
const KINDS = ["topup", "manual", "support", "recovery", "honeypot", "topup_result", "order_result", "support_reply"] as const;
type Kind = (typeof KINDS)[number];
type Built = { key: string; text: string; to: { admin?: boolean; user?: string } };
const METHOD: Record<string, string> = { SHAMCASH: "شام كاش", SYRIATEL_CASH: "سيريتل كاش", MTN_CASH: "MTN كاش" };
const NO_STORE = { "Cache-Control": "no-store" };

const money = (cents: number, currency?: string) =>
  currency === "SYP" ? `${Math.round(cents / 100).toLocaleString("en-US")} SYP` : `$${(cents / 100).toFixed(2)}`;
const fresh = (iso?: string | null) => Boolean(iso) && Date.now() - Date.parse(iso as string) < FRESH_MS;
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

type Ctx = { params: Promise<{ action: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { action } = await params;
  if (action === "webhook") return webhook(request);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false }, 400);
  }
  if (!telegramConfigured()) return json({ ok: true, configured: false, skipped: true });
  if (action === "notify") return notify(body);
  const supabase = adminClient();
  if (!supabase) return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, 503);
  const state = await loadServerState();
  if (!state) return json({ ok: false, error: "Store unavailable." }, 503);

  if (action === "admin") {
    const owner = await ownerFromRequest(request, state, body.token);
    if (!owner) return json({ ok: false, error: "🔐 للمالك فقط · Owner only." }, 403);
    return adminAction(request, body);
  }

  const user = await userFromToken(state, body.token);
  if (!user) return json({ ok: false, error: "سجّل الدخول أولاً · Please sign in first." }, 401);
  if (action === "status") {
    const { data, error } = await supabase.from("telegram_links").select("chat_id").eq("user_id", user.id).limit(1);
    if (error) return json({ ok: true, configured: true, linked: false, needsSql: true });
    return json({ ok: true, configured: true, linked: (data ?? []).length > 0, bot: telegramBotUsername() });
  }
  if (action === "link") {
    const bot = telegramBotUsername();
    if (!bot) return json({ ok: false, error: "TELEGRAM_BOT_USERNAME is not set on the server." }, 503);
    const code = `u${randomHex(12)}`;
    const { error } = await supabase.from("telegram_codes").insert({ code, user_id: user.id, is_admin: false, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() });
    if (error) return json({ ok: false, error: "Run supabase_security.sql in Supabase first." }, 500);
    return json({ ok: true, url: `https://t.me/${bot}?start=${code}` });
  }
  if (action === "unlink") {
    const { data } = await supabase.from("telegram_links").select("chat_id,is_admin").eq("user_id", user.id);
    for (const row of (data ?? []) as Array<{ chat_id: string; is_admin: boolean }>) {
      if (row.is_admin) await supabase.from("telegram_links").update({ user_id: null }).eq("chat_id", row.chat_id);
      else await supabase.from("telegram_links").delete().eq("chat_id", row.chat_id);
      await sendTelegram("🔕 تم إلغاء ربط حسابك في زوفا شارج بهذا الحساب على تيليغرام.", [row.chat_id]);
    }
    return json({ ok: true });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

/* ------------------------------ owner: bot setup + admin chats ------------------------------ */

async function adminAction(request: Request, body: Record<string, unknown>) {
  const supabase = adminClient()!;
  const op = String(body.op ?? "");
  if (op === "setup") {
    const origin = new URL(request.url).origin;
    const result = await telegramApi("setWebhook", {
      url: `${origin}/api/telegram/webhook`,
      secret_token: await telegramWebhookSecret(),
      allowed_updates: ["message"],
      drop_pending_updates: true,
    });
    await telegramApi("setMyCommands", {
      commands: [
        { command: "start", description: "ربط الحساب · Link account" },
        { command: "stop", description: "إلغاء الربط · Unlink" },
      ],
    });
    return json({ ok: result.ok, error: result.ok ? undefined : result.description ?? "Telegram refused the webhook.", bot: telegramBotUsername() });
  }
  if (op === "list") {
    const { data, error } = await supabase.from("telegram_links").select("chat_id,tg_username,tg_name,linked_at").eq("is_admin", true).order("linked_at");
    if (error) return json({ ok: false, error: "Run supabase_security.sql in Supabase first.", needsSql: true }, 500);
    return json({ ok: true, admins: data ?? [], max: MAX_ADMINS, bot: telegramBotUsername() });
  }
  if (op === "link") {
    const bot = telegramBotUsername();
    if (!bot) return json({ ok: false, error: "TELEGRAM_BOT_USERNAME is not set on the server." }, 503);
    const { count } = await supabase.from("telegram_links").select("chat_id", { count: "exact", head: true }).eq("is_admin", true);
    if ((count ?? 0) >= MAX_ADMINS) return json({ ok: false, error: `الحد الأقصى ${MAX_ADMINS} مدراء على تيليغرام. احذف واحداً أولاً.` }, 409);
    const code = `a${randomHex(12)}`;
    const { error } = await supabase.from("telegram_codes").insert({ code, user_id: null, is_admin: true, expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() });
    if (error) return json({ ok: false, error: "Run supabase_security.sql in Supabase first." }, 500);
    return json({ ok: true, url: `https://t.me/${bot}?start=${code}`, expiresInMinutes: CODE_TTL_MS / 60_000 });
  }
  if (op === "remove") {
    const chatId = String(body.chatId ?? "").slice(0, 40);
    const { data } = await supabase.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();
    if ((data as { user_id?: string | null } | null)?.user_id) await supabase.from("telegram_links").update({ is_admin: false }).eq("chat_id", chatId);
    else await supabase.from("telegram_links").delete().eq("chat_id", chatId);
    await sendTelegram("🔕 لم تعد تستقبل تنبيهات الإدارة من زوفا شارج.", [chatId]);
    return json({ ok: true });
  }
  return json({ ok: false, error: "Unknown op." }, 400);
}

/* ------------------------------ webhook (Telegram → us) ------------------------------ */

type Update = { message?: { text?: string; chat?: { id?: number | string; type?: string }; from?: { username?: string; first_name?: string; last_name?: string } } };

async function webhook(request: Request) {
  if (!telegramConfigured()) return json({ ok: true });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== (await telegramWebhookSecret())) return json({ ok: false }, 401);
  const update = (await request.json().catch(() => ({}))) as Update;
  const message = update.message;
  const chatId = message?.chat?.id != null ? String(message.chat.id) : "";
  const textIn = (message?.text ?? "").trim();
  if (!chatId || message?.chat?.type !== "private") return json({ ok: true });
  const supabase = adminClient();
  if (!supabase) return json({ ok: true });
  const reply = (html: string) => sendTelegram(html, [chatId]);

  if (/^\/stop\b/i.test(textIn)) {
    await supabase.from("telegram_links").delete().eq("chat_id", chatId);
    await reply("🔕 تم إلغاء الربط. لن تصلك أي تنبيهات بعد الآن.\nUnlinked — no more alerts.");
    return json({ ok: true });
  }
  const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9]{8,40})$/i.exec(textIn);
  if (!start) {
    await reply("👋 أهلاً بك في زوفا شارج.\nلربط حسابك افتح الموقع ← القائمة ← «ربط تيليغرام».\nTo link your account: open the site → menu → “Link Telegram”.");
    return json({ ok: true });
  }
  const code = start[1];
  const { data: row } = await supabase.from("telegram_codes").select("code,user_id,is_admin,expires_at").eq("code", code).maybeSingle();
  const found = row as { code: string; user_id: string | null; is_admin: boolean; expires_at: string } | null;
  // One use only, whatever happens next.
  if (found) await supabase.from("telegram_codes").delete().eq("code", code);
  if (!found || Date.parse(found.expires_at) < Date.now()) {
    await reply("⌛️ هذا الرابط منتهي أو مستخدم. أنشئ رابطاً جديداً من الموقع.\nThis link has expired — create a new one on the site.");
    return json({ ok: true });
  }
  const from = message?.from ?? {};
  const profile = { tg_username: (from.username ?? "").slice(0, 64), tg_name: [from.first_name, from.last_name].filter(Boolean).join(" ").slice(0, 80) };
  const { data: existing } = await supabase.from("telegram_links").select("user_id,is_admin").eq("chat_id", chatId).maybeSingle();
  const current = existing as { user_id: string | null; is_admin: boolean } | null;
  if (found.is_admin) {
    const { count } = await supabase.from("telegram_links").select("chat_id", { count: "exact", head: true }).eq("is_admin", true).neq("chat_id", chatId);
    if ((count ?? 0) >= MAX_ADMINS) {
      await reply(`⛔️ يوجد ${MAX_ADMINS} مدراء مرتبطون بالفعل.`);
      return json({ ok: true });
    }
    await supabase.from("telegram_links").upsert({ chat_id: chatId, user_id: current?.user_id ?? null, is_admin: true, ...profile }, { onConflict: "chat_id" });
    await reply("🛡 <b>تم ربطك كمدير.</b>\nستصلك تنبيهات الشحن والطلبات والدعم والأمان هنا.\nYou're linked as an admin.");
  } else {
    await supabase.from("telegram_links").upsert({ chat_id: chatId, user_id: found.user_id, is_admin: current?.is_admin ?? false, ...profile }, { onConflict: "chat_id" });
    await reply("✅ <b>تم ربط حسابك في زوفا شارج.</b>\nستصلك هنا تنبيهات طلباتك وشحن محفظتك فقط.\nYour account is linked — only your own alerts come here.");
  }
  return json({ ok: true });
}

/* ------------------------------ notify ------------------------------ */

async function notify(body: Record<string, unknown>) {
  const kind = body.kind as Kind;
  if (!KINDS.includes(kind) || typeof body.id !== "string" || body.id.length > 120) return json({ ok: false }, 400);
  const id = body.id;
  // The browser's save can land a moment after it calls us: retry briefly.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = await loadServerState();
    const built = state ? build(state, kind, id, typeof body.messageId === "string" ? body.messageId : undefined) : null;
    if (built) {
      if (!(await claimTelegramEvent(`tg:${built.key}`))) return json({ ok: true, duplicate: true });
      const chats = built.to.admin ? await adminChatIds() : await userChatIds(built.to.user ?? "");
      const sent = chats.length ? await sendTelegram(built.text, chats) : 0;
      return json({ ok: true, sent });
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return json({ ok: true, skipped: "event not found" });
}

type State = NonNullable<Awaited<ReturnType<typeof loadServerState>>>;

function build(state: State, kind: Kind, id: string, messageId?: string): Built | null {
  if (kind === "topup_result") {
    const item = state.balanceRequests.find((row) => row.id === id);
    if (!item || item.status === "PROCESSING" || !fresh(item.resolvedAt)) return null;
    const ok = item.status === "APPROVED";
    const lines = [
      ok ? "✅ <b>تمت الموافقة على شحن محفظتك</b>" : "❌ <b>تم رفض طلب شحن المحفظة</b>",
      `💵 ${tgEscape(money(item.cents, item.currency))}${item.receiptNumber ? ` · #${tgEscape(item.receiptNumber)}` : ""}`,
      ok ? "أصبح الرصيد متاحاً في محفظتك الآن." : "للاستفسار تواصل مع الدعم من داخل الموقع.",
    ];
    return { key: `topup_result:${item.id}`, text: lines.join("\n"), to: { user: item.userId } };
  }
  if (kind === "order_result") {
    const order = state.orders.find((row) => row.id === id);
    if (!order || !["COMPLETED", "delivered", "DECLINED", "CANCELLED_BY_ADMIN"].includes(order.status) || !fresh(order.resolvedAt)) return null;
    const done = order.status === "COMPLETED" || order.status === "delivered";
    const lines = [
      done ? "✅ <b>تم تنفيذ طلبك بنجاح</b>" : "↩️ <b>تم إلغاء الطلب وإعادة المبلغ إلى محفظتك</b>",
      `🛒 ${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}`,
      `💵 ${tgEscape(money(order.priceCents, order.currency))}${order.receiptNumber ? ` · #${tgEscape(order.receiptNumber)}` : ""}`,
    ];
    return { key: `order_result:${order.id}`, text: lines.join("\n"), to: { user: order.userId } };
  }
  if (kind === "support_reply") {
    const ticket = (state.supportTickets ?? []).find((row) => row.id === id);
    if (!ticket || ticket.guest || !ticket.userId || ticket.userId === "guest") return null;
    const replies = ticket.messages.filter((message) => message.sender === "ADMIN" && !(message as { isAutoReply?: boolean }).isAutoReply);
    const last = messageId ? replies.find((message) => message.id === messageId) : replies[replies.length - 1];
    if (!last || !fresh(last.createdAt)) return null;
    const lines = ["💬 <b>رد جديد من الدعم الفني</b>", `“${tgEscape((last.text || "📷 صورة").slice(0, 400))}”`, "افتح الدعم المباشر في الموقع للرد."];
    return { key: `reply:${last.id}`, text: lines.join("\n"), to: { user: ticket.userId } };
  }
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
    return { key: `topup:${item.id}`, text: lines.filter(Boolean).join("\n"), to: { admin: true } };
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
    return { key: `manual:${order.id}`, text: lines.filter(Boolean).join("\n"), to: { admin: true } };
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
    return { key: `msg:${last.id}`, text: lines.join("\n"), to: { admin: true } };
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
  return { key: `trap:${event.id}`, text: lines.join("\n"), to: { admin: true } };
}
