import { NextResponse } from "next/server";

import {
  adminChatIds,
  claimTelegramEvent,
  deliveredHtml,
  purchaseAlertHtml,
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
const KINDS = ["topup", "manual", "support", "recovery", "honeypot", "topup_result", "order_result", "support_reply", "purchase"] as const;
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
        { command: "start", description: "القائمة · Menu" },
        { command: "me", description: "حسابي ورصيدي · My account" },
        { command: "orders", description: "آخر طلباتي · My orders" },
        { command: "admin", description: "لوحة الإدارة · Admin summary" },
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

  const site = new URL(request.url).origin;
  const { data: linkRow } = await supabase.from("telegram_links").select("user_id,is_admin").eq("chat_id", chatId).maybeSingle();
  const link = linkRow as { user_id: string | null; is_admin: boolean } | null;

  if (/^\/stop\b/i.test(textIn)) {
    await supabase.from("telegram_links").delete().eq("chat_id", chatId);
    await sendTelegram("🔕 تم إلغاء الربط. لن تصلك أي تنبيهات بعد الآن.\nUnlinked — no more alerts.\n\nللربط من جديد أرسل /start", [chatId], { reply_markup: { remove_keyboard: true } });
    return json({ ok: true });
  }
  const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9]{8,40})$/i.exec(textIn);
  if (!start) {
    // v38.4: a real bot — it knows who you are once linked (menu, account, orders, admin summary).
    await chatMenu(chatId, textIn, link, site);
    return json({ ok: true });
  }
  const code = start[1];
  const { data: row } = await supabase.from("telegram_codes").select("code,user_id,is_admin,expires_at").eq("code", code).maybeSingle();
  const found = row as { code: string; user_id: string | null; is_admin: boolean; expires_at: string } | null;
  // One use only, whatever happens next.
  if (found) await supabase.from("telegram_codes").delete().eq("code", code);
  if (!found || Date.parse(found.expires_at) < Date.now()) {
    await sendTelegram("⌛️ هذا الرابط منتهي أو مستخدم.\nاضغط الزر لإنشاء رابط جديد.\nThis link has expired — tap to get a new one.", [chatId], {
      reply_markup: { inline_keyboard: [[{ text: "🔗 رابط جديد · New link", url: `${site}/?tg=link` }]] },
    });
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
    await sendTelegram("🛡 <b>تم ربطك كمدير.</b>\nستصلك هنا تنبيهات الشحن والطلبات والمشتريات والدعم والأمان.\nYou're linked as an admin.", [chatId], { reply_markup: keyboardFor({ user_id: current?.user_id ?? null, is_admin: true }) });
  } else {
    await supabase.from("telegram_links").upsert({ chat_id: chatId, user_id: found.user_id, is_admin: current?.is_admin ?? false, ...profile }, { onConflict: "chat_id" });
    const state = await loadServerState();
    const user = state?.users.find((row) => row.id === found.user_id);
    await sendTelegram(
      `✅ <b>أهلاً ${tgEscape(user?.name ?? "")}! تم ربط حسابك في زوفا شارج.</b>\n📧 ${tgEscape(maskEmail(user?.email))}\nستصلك هنا تنبيهات طلباتك وشحن محفظتك فقط.\n\nYour account is linked — only your own alerts come here.`,
      [chatId],
      { reply_markup: keyboardFor({ user_id: found.user_id, is_admin: current?.is_admin ?? false }) },
    );
  }
  return json({ ok: true });
}

/* ------------------------------ v38.4 · the bot's own screens ------------------------------ */

const BTN = { me: "👤 حسابي", orders: "🧾 طلباتي", admin: "📊 لوحة الإدارة", help: "❓ مساعدة" } as const;

function keyboardFor(link: { user_id: string | null; is_admin: boolean } | null) {
  const rows: Array<Array<{ text: string }>> = [];
  if (link?.user_id) rows.push([{ text: BTN.me }, { text: BTN.orders }]);
  if (link?.is_admin) rows.push([{ text: BTN.admin }]);
  rows.push([{ text: BTN.help }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

function maskEmail(email?: string): string {
  if (!email) return "—";
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(6, name.length - 2)))}@${domain}`;
}

const STATUS_AR: Record<string, string> = {
  delivered: "✅ مكتمل",
  COMPLETED: "✅ مكتمل",
  processing: "⏳ قيد التنفيذ",
  PENDING_MANUAL: "🕒 بانتظار التنفيذ",
  PENDING_VAULT: "🕒 بانتظار التنفيذ",
  DECLINED: "↩️ ملغى ومسترد",
  CANCELLED_BY_ADMIN: "↩️ ملغى",
  failed: "❌ فشل",
};

async function chatMenu(chatId: string, textIn: string, link: { user_id: string | null; is_admin: boolean } | null, site: string) {
  const send = (html: string, markup?: Record<string, unknown>) => sendTelegram(html, [chatId], markup ? { reply_markup: markup } : { reply_markup: keyboardFor(link) });
  const linkButton = { inline_keyboard: [[{ text: "🔗 ربط حسابي الآن · Link my account", url: `${site}/?tg=link` }]] };
  const want = (pattern: RegExp, button: string) => pattern.test(textIn) || textIn === button;
  const state = link ? await loadServerState() : null;
  const user = link?.user_id ? state?.users.find((row) => row.id === link.user_id) : undefined;

  if (!link) {
    await send(
      "👋 <b>أهلاً بك في بوت زوفا شارج</b>\n\nهذا الحساب على تيليغرام غير مربوط بعد.\nاضغط الزر بالأسفل، سجّل دخولك في الموقع، وسيُربط حسابك تلقائياً لتصلك تنبيهات طلباتك ورصيدك.\n\nThis Telegram isn't linked yet — tap the button, sign in on the site, and it links automatically.",
      linkButton,
    );
    return;
  }

  if (want(/^\/admin\b/i, BTN.admin)) {
    if (!link.is_admin || !state) {
      await send("⛔️ هذه اللوحة للمدراء المرتبطين فقط.\nAdmins only.");
      return;
    }
    const since = Date.now() - 24 * 3_600_000;
    const rate = state.sypRate ?? 145;
    const usd = (cents: number, currency?: string) => (currency === "SYP" ? cents / 100 / rate : cents / 100);
    const today = state.orders.filter((order) => Date.parse(order.createdAt) >= since && !["failed", "DECLINED", "CANCELLED_BY_ADMIN"].includes(order.status));
    const sales = today.reduce((sum, order) => sum + usd(order.priceCents, order.currency), 0);
    const cost = today.reduce((sum, order) => sum + (order.provider?.costUsd ?? 0), 0);
    const manual = state.orders.filter((order) => order.status === "PENDING_MANUAL" || order.status === "PENDING_VAULT").length;
    const topups = state.balanceRequests.filter((item) => item.status === "PROCESSING").length;
    const working = state.orders.filter((order) => order.status === "processing" && order.provider).length;
    await send(
      [
        "📊 <b>ملخص آخر 24 ساعة</b>",
        `🛍 الطلبات: <b>${today.length}</b>`,
        `💵 المبيعات: <b>$${sales.toFixed(2)}</b>`,
        `🏷 تكلفة Mega: $${cost.toFixed(2)} · الصافي: <b>$${(sales - cost).toFixed(2)}</b>`,
        "",
        `🕒 طلبات يدوية بانتظارك: <b>${manual}</b>`,
        `💰 طلبات شحن بانتظارك: <b>${topups}</b>`,
        `⚡ قيد التنفيذ عند Mega: ${working}`,
      ].join("\n"),
      { inline_keyboard: [[{ text: "🛠 فتح لوحة الإدارة", url: `${site}/admin` }]] },
    );
    return;
  }

  if (!user) {
    // An admin-only chat (no customer account behind it).
    await send(
      link.is_admin
        ? "🛡 <b>أنت مرتبط كمدير.</b>\nتصلك هنا تنبيهات الشحن والطلبات والمشتريات والدعم.\nاضغط «📊 لوحة الإدارة» للملخص.\n\nلربط حسابك الشخصي أيضاً اضغط الزر بالأسفل."
        : "⚠️ الحساب المرتبط لم يعد موجوداً. اربط من جديد.",
      linkButton,
    );
    return;
  }

  const balance = user.currency === "SYP" ? `${Math.round(user.balanceCents / 100).toLocaleString("en-US")} SYP` : `$${(user.balanceCents / 100).toFixed(2)}`;
  if (want(/^\/orders\b/i, BTN.orders)) {
    const mine = state!.orders
      .filter((order) => order.userId === user.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 5);
    await send(
      mine.length
        ? [
            "🧾 <b>آخر طلباتك</b>",
            "",
            ...mine.map(
              (order) =>
                `${STATUS_AR[order.status] ?? order.status} · ${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}\n   💵 ${tgEscape(order.currency === "SYP" ? `${Math.round(order.priceCents / 100).toLocaleString("en-US")} SYP` : `$${(order.priceCents / 100).toFixed(2)}`)}${order.receiptNumber ? ` · #${tgEscape(order.receiptNumber)}` : ""}`,
            ),
          ].join("\n")
        : "🧾 لا توجد طلبات بعد. ابدأ أول شحن من الموقع 🎮",
      { inline_keyboard: [[{ text: "📦 كل الطلبات في الموقع", url: `${site}/orders` }]] },
    );
    return;
  }
  if (want(/^\/(me|balance|account)\b/i, BTN.me)) {
    await send(
      [
        `👤 <b>${tgEscape(user.name)}</b>${user.role === "VIP" ? " · ⭐️ VIP" : user.role === "ADMIN" ? " · 🛡 Admin" : ""}`,
        `📧 ${tgEscape(maskEmail(user.email))}`,
        `💰 الرصيد: <b>${tgEscape(balance)}</b>`,
        "",
        "🔔 تصلك هنا تنبيهات طلباتك وشحن محفظتك وردود الدعم.",
      ].join("\n"),
      { inline_keyboard: [[{ text: "💳 شحن المحفظة", url: `${site}/wallet` }, { text: "🎮 المتجر", url: site }]] },
    );
    return;
  }
  // /start, /help, anything else → welcome back
  await send(
    [
      `👋 <b>أهلاً ${tgEscape(user.name)}!</b>`,
      `حسابك مربوط ✅ · ${tgEscape(maskEmail(user.email))}`,
      `💰 الرصيد: <b>${tgEscape(balance)}</b>`,
      "",
      `${BTN.me} — حسابك ورصيدك`,
      `${BTN.orders} — آخر 5 طلبات`,
      ...(link.is_admin ? [`${BTN.admin} — ملخص اليوم للإدارة`] : []),
      "/stop — إلغاء الربط",
    ].join("\n"),
  );
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
  if (kind === "purchase") {
    // v38.4: a completed purchase, for the admin chats (Mega deliveries send the same key themselves).
    const order = state.orders.find((row) => row.id === id);
    if (!order || !["delivered", "COMPLETED"].includes(order.status) || !fresh(order.resolvedAt ?? order.createdAt)) return null;
    const buyer = state.users.find((user) => user.id === order.userId);
    return { key: `purchase:${order.id}`, text: purchaseAlertHtml(order, { name: buyer?.name, email: buyer?.email }, state.sypRate ?? 145), to: { admin: true } };
  }
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
    // v38.1: hand-delivered details (account e-mail / password …) and provider codes, each in its own copy box.
    const delivery = done ? (order.delivery ?? []).filter((item) => item.value).slice(0, 10) : [];
    const codes = done ? (order.provider?.codes ?? []).slice(0, 20) : [];
    const lines = [
      done ? "✅ <b>تم تنفيذ طلبك بنجاح</b>" : "↩️ <b>تم إلغاء الطلب وإعادة المبلغ إلى محفظتك</b>",
      `🛒 ${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}`,
      ...(codes.length ? ["", ...deliveredHtml(codes)] : []),
      ...(delivery.length ? ["", "🔐 <b>تفاصيل طلبك:</b>", ...delivery.map((item) => `${tgEscape(item.label)}: <code>${tgEscape(item.value)}</code>`)] : []),
      "",
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
      ...(fields.length
        ? fields
        : order.targetId
          ? [`🆔 <code>${tgEscape(order.targetId)}</code>`]
          : ["🎁 لا يحتاج بيانات — سلّمه الكود أو الحساب من «الطلبات اليدوية»"]),
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
