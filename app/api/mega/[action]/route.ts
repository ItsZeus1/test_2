import { NextResponse } from "next/server";

import { adminChatIds, claimTelegramEvent, deliveredHtml, purchaseAlertHtml, sendTelegram, telegramConfigured, tgEscape, userChatIds } from "@/lib/server/push";
import {
  adminClient,
  adminFromToken,
  guardVersion,
  loadServerState,
  ownerFromRequest,
  randomHex,
  serverPatch,
  sha256Hex,
  userFromToken,
  type ServerPatchOp,
} from "@/lib/server/supabase-admin";
import {
  DEFAULT_MEGA_SETTINGS,
  DEFAULT_SYP_RATE_VALUE,
  megaCounterPrices,
  megaPrices,
  megaUuid,
  normalizeCounter,
  type NovaState,
  type ProviderTrack,
  type StoredOrder,
  type StoredPackage,
  type StoredService,
} from "@/lib/store/data";
import type { CounterPricing, CustomField } from "@/lib/store/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * v37 · Mega (mega-game.net Fast API): automatic delivery, live prices and full order tracking.
 *   POST /api/mega/dispatch         { token, orderId }   buyer, right after paying
 *   POST /api/mega/check            (anyone, deduplicated) · GET ?key=… (Supabase cron, every minute)
 *   GET  /api/mega/sync?key=…       (Supabase cron, every 10 minutes): prices + availability
 *   POST /api/mega/webhook?key=…    Mega's order-update webhook (a doorbell: we re-check with Mega)
 *   POST /api/mega/admin            { token, op } owner: overview | preview | apply | sync | retry
 *   POST /api/mega/packages         (v29 per-size provider secrets, unchanged)
 * The token (MEGA_API_TOKEN) is only ever read here, on the server.
 */

const BASE = (process.env.MEGA_API_BASE?.trim() || "https://mega-game.net/api/fastapi").replace(/\/+$/, "");
const NO_STORE = { "Cache-Control": "no-store" };
const ISP_GROUP = "grp_isp";
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const now = () => new Date().toISOString();

type Ctx = { params: Promise<{ action: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { action } = await params;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (action === "check" || action === "sync") {
    if (!megaToken() || key !== (await secretKey(action === "check" ? "cron-check" : "cron-sync"))) return json({ ok: false }, 401);
    return action === "check" ? json(await checkOrders(true)) : json(await syncPrices());
  }
  return json({ ok: false, error: "Not found." }, 404);
}

export async function POST(request: Request, { params }: Ctx) {
  const { action } = await params;
  if (action === "webhook") return webhook(request, new URL(request.url).searchParams.get("key") ?? "");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (action === "packages") return legacyPackages(body);
  if (!adminClient()) return json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, 503);
  if (action === "dispatch") return dispatchRoute(body);
  if (action === "check") return json(megaToken() ? await checkOrders(false) : { ok: true, skipped: true });
  if (action === "admin") return adminRoute(request, body);
  return json({ ok: false, error: "Not found." }, 404);
}

/* ====================================================================== Mega API */

function megaToken(): string {
  return process.env.MEGA_API_TOKEN?.trim() ?? "";
}

async function secretKey(label: string): Promise<string> {
  return (await sha256Hex(`zova-mega-${label}|${megaToken()}`)).slice(0, 40);
}

type MegaField = { id?: number; name: string; type?: string; label?: string; placeholder?: string; help_text?: string; required?: boolean; options?: unknown[] };
type MegaProduct = {
  id: number;
  isActive: number | boolean;
  price: string | number;
  name: string;
  image?: string;
  game_id: number;
  gameName: string;
  minCount?: number;
  maxCount?: number;
  currency?: string;
  daynamicFields?: MegaField[];
};
type MegaOrderRow = {
  order_number?: string;
  uuid?: string;
  status?: string;
  codes?: unknown[];
  notes?: unknown[];
  noteplus?: string;
  amount?: string | number;
};
type Reply = { status: number; body: Record<string, unknown> | null; error?: string };

async function mega(path: string, timeoutMs = 15_000): Promise<Reply> {
  const token = megaToken();
  if (!token) return { status: 0, body: null, error: "MEGA_API_TOKEN is not set on the server." };
  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { apiToken: token, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: response.status, body };
  } catch (error) {
    return { status: 0, body: null, error: error instanceof Error ? error.message : "Mega could not be reached." };
  }
}

function message(reply: Reply): string {
  const text = reply.body && typeof reply.body.message === "string" ? reply.body.message : "";
  return text || reply.error || (reply.status ? `HTTP ${reply.status}` : "Mega could not be reached.");
}

let productCache: { at: number; list: MegaProduct[] } | null = null;

async function megaProducts(maxAgeMs = 60_000): Promise<MegaProduct[] | { error: string }> {
  if (productCache && Date.now() - productCache.at < maxAgeMs) return productCache.list;
  const reply = await mega("/products", 25_000);
  const data = reply.body?.data as { products?: MegaProduct[] } | undefined;
  if (reply.status !== 200 || !Array.isArray(data?.products)) return { error: message(reply) };
  productCache = { at: Date.now(), list: data.products };
  return data.products;
}

const active = (product: MegaProduct) => product.isActive === true || Number(product.isActive) === 1;
const cost = (product: MegaProduct) => Math.max(0, Number(product.price) || 0);
/** v38: a Mega "any amount" product (Jawaker tokens, bills…): its price is per unit, sent with qty. */
const isQty = (product: MegaProduct) => Number(product.maxCount) > 1;
const qtyRange = (product: MegaProduct) => {
  const min = Math.max(1, Math.round(Number(product.minCount) || 1));
  return { min, max: Math.max(min, Math.round(Number(product.maxCount) || min)) };
};

/** v38: what one of our orders asks Mega for: a fixed size (qty 1) or an amount of a quantity product. */
function megaTarget(state: NovaState, order: StoredOrder) {
  const pack = state.packages.find((item) => item.id === order.packageId);
  const service = state.services.find((item) => item.id === order.serviceId);
  const counter = !pack && service?.serviceMode === "POINT_COUNTER" && service.counter?.megaProductId ? service.counter : undefined;
  const points = order.packageId.startsWith("points:") ? Math.max(0, Math.round(Number(order.packageId.slice(7)) || 0)) : 0;
  return {
    pack,
    service,
    counter,
    productId: pack?.megaProductId ?? counter?.megaProductId ?? 0,
    qty: counter ? points : 1,
  };
}
const isMegaOrder = (state: NovaState, order: StoredOrder) => Boolean(megaTarget(state, order).productId);

async function megaBalance(): Promise<{ balance: number; name: string } | null> {
  const reply = await mega("/balance", 10_000);
  const data = reply.body?.data as { balance?: number | string; name?: string } | undefined;
  return reply.status === 200 && data ? { balance: Number(data.balance) || 0, name: String(data.name ?? "") } : null;
}

/* ====================================================================== store helpers */

function settingsOf(state: NovaState) {
  return { ...DEFAULT_MEGA_SETTINGS, ...(state.megaSettings ?? {}) };
}

function step(track: ProviderTrack, status: ProviderTrack["status"], note?: string): ProviderTrack {
  const at = now();
  const history = [...(track.history ?? []), { at, status, ...(note ? { note: note.slice(0, 200) } : {}) }].slice(-20);
  return { ...track, status, updatedAt: at, history };
}

async function saveOrder(order: StoredOrder, changes: Partial<StoredOrder>): Promise<void> {
  await serverPatch([{ op: "merge", key: "orders", idKey: "id", id: order.id, value: changes as Record<string, unknown> }]);
}

const money = (cents: number, currency?: string) =>
  currency === "SYP" ? `${Math.round(cents / 100).toLocaleString("en-US")} SYP` : `$${(cents / 100).toFixed(2)}`;

async function tellAdmins(key: string, html: string): Promise<void> {
  if (!telegramConfigured() || !(await claimTelegramEvent(`tg:${key}`))) return;
  const chats = await adminChatIds();
  if (chats.length) await sendTelegram(html, chats);
}

async function tellCustomer(key: string, userId: string, html: string): Promise<void> {
  if (!telegramConfigured() || !(await claimTelegramEvent(`tg:${key}`))) return;
  const chats = await userChatIds(userId);
  if (chats.length) await sendTelegram(html, chats);
}

/** Refund once (SQL part 11: one locked transaction); never for a delivered order. */
async function refund(order: StoredOrder, note: string, track: ProviderTrack): Promise<boolean> {
  const supabase = adminClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("nova_refund_order", { p_order_id: order.id, p_note: note.slice(0, 200), p_status: "DECLINED", p_track: track });
  const ok = !error && (data as { ok?: boolean } | null)?.ok === true;
  if (!ok) {
    // Can't refund automatically (SQL part 11 missing): the admin decides — nothing is lost.
    await saveOrder(order, { status: "PENDING_MANUAL", provider: step(track, "error", "Refund needed — finish it from the admin queue") });
    await tellAdmins(`mega:refund-needed:${order.id}`, `⚠️ <b>Mega: يلزم استرداد يدوي</b>\n${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}\n${tgEscape(note)}\n#${tgEscape(order.receiptNumber ?? order.id)}`);
    return false;
  }
  await tellAdmins(
    `refund:${order.id}`,
    `↩️ <b>Mega: أُلغي طلب وأُعيد المبلغ للزبون</b>\n🛒 ${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}\n💵 ${tgEscape(money(order.priceCents, order.currency))}\n${tgEscape(note)}${order.receiptNumber ? `\n\n🧾 #${tgEscape(order.receiptNumber)}` : ""}`,
  );
  await tellCustomer(
    `order_result:${order.id}`,
    order.userId,
    `↩️ <b>تم إلغاء الطلب وإعادة المبلغ إلى محفظتك</b>\n🛒 ${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}\n💵 ${tgEscape(money(order.priceCents, order.currency))}\n${tgEscape(note)}`,
  );
  return true;
}

/** To the admin queue (the money stays charged until the admin completes or declines it). */
async function toManual(order: StoredOrder, track: ProviderTrack, reason: string): Promise<void> {
  await saveOrder(order, { status: "PENDING_MANUAL", provider: { ...step(track, "error", reason), error: reason.slice(0, 200) } });
  await tellAdmins(
    `mega:manual:${order.id}:${track.attempts}`,
    `🛠 <b>Mega: طلب يحتاج تدخّلك</b>\n🛒 ${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}\n⚠️ ${tgEscape(reason)}\n#${tgEscape(order.receiptNumber ?? order.id)} — أعد المحاولة من لوحة Mega أو نفّذه يدوياً.`,
  );
}

async function delivered(order: StoredOrder, track: ProviderTrack, row: MegaOrderRow, state?: NovaState): Promise<void> {
  const codes = (row.codes ?? []).map((code) => String(code)).filter(Boolean).slice(0, 20);
  const note = String(row.noteplus ?? (Array.isArray(row.notes) ? row.notes[0] ?? "" : "")).slice(0, 200);
  const next: ProviderTrack = { ...step(track, "completed", note || undefined), ...(codes.length ? { codes } : {}), ...(note ? { note } : {}) };
  await saveOrder(order, { status: "delivered", resolvedAt: now(), provider: next });
  await tellCustomer(
    `order_result:${order.id}`,
    order.userId,
    [
      "✅ <b>تم تنفيذ طلبك بنجاح</b>",
      `🛒 ${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}`,
      ...(codes.length ? ["", ...deliveredHtml(codes)] : []),
      // v38.1: an empty line keeps the order number away from the code.
      ...(order.receiptNumber ? ["", `🧾 رقم الطلب: #${tgEscape(order.receiptNumber)}`] : []),
    ].join("\n"),
  );
  // v38.4: the same purchase also lands in the (max 3) admin Telegram chats — no per-device setup.
  const buyer = state?.users.find((user) => user.id === order.userId);
  await tellAdmins(`purchase:${order.id}`, purchaseAlertHtml({ ...order, status: "delivered", provider: next }, { name: buyer?.name, email: buyer?.email }, state?.sypRate ?? DEFAULT_SYP_RATE_VALUE));
}

/* ====================================================================== sending an order */

function answerFor(order: StoredOrder, service: StoredService | undefined, field: MegaField, index: number, pack?: StoredPackage): string {
  // v38.1: a size with its own fields answers from those.
  const custom = (pack?.customFields?.length ? pack.customFields : (service?.customFields ?? [])) as CustomField[];
  const mapped = custom.find((item) => item.megaName === field.name) ?? (custom.length === 0 ? undefined : custom[index]);
  const fromFields = mapped ? order.fields?.find((item) => item.id === mapped.id)?.value : undefined;
  if (fromFields) return fromFields.trim();
  return index === 0 ? (order.targetId ?? "").trim() : "";
}

/** Sends (or re-sends — same uuid, never charged twice) one order to Mega and handles the answer. */
async function sendToMega(state: NovaState, order: StoredOrder): Promise<"delivered" | "processing" | "cancelled" | "manual"> {
  const target = megaTarget(state, order);
  const { pack, service, counter, qty } = target;
  const productId = order.provider?.productId ?? target.productId;
  let track: ProviderTrack = order.provider ?? {
    name: "MEGA",
    productId,
    uuid: await megaUuid(order.id),
    status: "queued",
    attempts: 0,
    updatedAt: now(),
    history: [{ at: now(), status: "queued", note: "Paid — sending to Mega" }],
  };
  track = { ...track, attempts: (track.attempts ?? 0) + 1 };

  // 1) Live check right before sending: still on sale, and not above what the customer paid.
  const products = await megaProducts();
  if ("error" in products) {
    await saveOrder(order, { provider: step(track, "queued", `Mega unreachable: ${products.error}`) });
    return "processing"; // the minute check sends it again
  }
  const product = products.find((item) => item.id === productId);
  if (!product || !active(product)) {
    if (pack) await serverPatch([{ op: "merge", key: "packages", idKey: "id", id: pack.id, value: { megaActive: false } }]);
    if (counter && service) await serverPatch([{ op: "merge", key: "services", idKey: "id", id: service.id, value: { counter: { ...counter, megaActive: false } } }]);
    await refund(order, "المنتج غير متوفر حالياً لدى المزود — أُعيد المبلغ", step(track, "cancelled", "Not available on Mega"));
    return "cancelled";
  }
  const unit = cost(product);
  if (counter) {
    const range = qtyRange(product);
    if (qty < range.min || qty > range.max) {
      await refund(order, `الكمية خارج حدود المزود (${range.min} – ${range.max}) — أُعيد المبلغ`, step(track, "cancelled", `Amount outside ${range.min}–${range.max}`));
      return "cancelled";
    }
  }
  const paidUsdCents = order.currency === "SYP" ? order.priceCents / (state.sypRate ?? DEFAULT_SYP_RATE_VALUE) : order.priceCents;
  if (Math.ceil(unit * qty * 100 - 1e-9) > paidUsdCents + 0.5) {
    if (pack) {
      const prices = megaPrices(unit, settingsOf(state), pack.serviceId);
      await serverPatch([{ op: "merge", key: "packages", idKey: "id", id: pack.id, value: { megaCostUsd: unit, ...prices, normalPriceSypCents: 0, vipPriceSypCents: 0 } }]);
    }
    if (counter && service) {
      await serverPatch([{ op: "merge", key: "services", idKey: "id", id: service.id, value: { counter: counterFrom(product, counter, settingsOf(state), service.id) } }]);
    }
    await refund(order, "تغيّر السعر لدى المزود — أُعيد المبلغ، يرجى الطلب مجدداً بالسعر الجديد", step(track, "cancelled", "Price changed on Mega"));
    return "cancelled";
  }

  // 2) The customer's details, under Mega's field names.
  const fields = product.daynamicFields ?? [];
  const query = new URLSearchParams({ qty: String(qty) });
  for (const [index, field] of fields.entries()) {
    const value = answerFor(order, service, field, index, pack);
    if (!value && field.required) {
      await toManual(order, track, `Missing "${field.label || field.name}" for Mega`);
      return "manual";
    }
    if (value) query.set(field.name, value);
  }
  query.set("uuid", track.uuid);

  // 3) Send.
  const reply = await mega(`/requestorder/${product.id}/params?${query.toString()}`, 25_000);
  const data = (reply.body?.data ?? null) as MegaOrderRow | null;
  if (reply.status === 0) {
    await saveOrder(order, { provider: { ...step(track, "unknown", "No answer from Mega — checking by uuid"), costUsd: unit * qty } });
    return "processing";
  }
  if ((reply.status === 200 || reply.status === 201) && data?.order_number) {
    let next: ProviderTrack = { ...step(track, "processing", `Mega ${data.order_number}`), orderNumber: data.order_number, costUsd: unit * qty };
    if (data.status === "completed") {
      await delivered(order, next, data, state);
      return "delivered";
    }
    if (data.status === "pending") next = step(next, "pending");
    await saveOrder(order, { provider: next });
    return "processing";
  }
  const text = message(reply);
  if (reply.status === 429 || reply.status >= 500) {
    await saveOrder(order, { provider: step(track, "queued", `Mega busy (${reply.status}) — retrying`) });
    return "processing";
  }
  if (reply.status === 401 || reply.status === 403 || /رصيد|balance|pin/i.test(text)) {
    await toManual(order, track, `Mega: ${text}`);
    return "manual";
  }
  // Mega refused the request itself (wrong ID format, quantity…): refund the customer.
  await refund(order, `رفض المزود الطلب: ${text}`, step(track, "cancelled", text));
  return "cancelled";
}

async function dispatchRoute(body: Record<string, unknown>) {
  const state = await loadServerState();
  if (!state) return json({ ok: false, error: "Store not found." }, 503);
  const user = await userFromToken(state, body.token);
  if (!user) return json({ ok: false, error: "Please sign in." }, 403);
  const order = state.orders.find((row) => row.id === body.orderId);
  // Only the buyer's own, fresh, still-processing order.
  if (!order || order.userId !== user.id || order.status !== "processing" || Date.now() - Date.parse(order.createdAt) > 10 * 60_000) {
    return json({ ok: true, status: order?.status === "delivered" ? "delivered" : "processing" });
  }
  if (isMegaOrder(state, order) && megaToken()) {
    if (order.provider) return json({ ok: true, status: "processing" }); // already on its way
    const outcome = await sendToMega(state, order);
    return json({ ok: true, status: outcome, mega: true });
  }
  return legacyDispatch(state, order);
}

/* ====================================================================== checking orders */

let lastCheck = 0;
let checking: Promise<Record<string, unknown>> | null = null;

async function checkOrders(force: boolean): Promise<Record<string, unknown>> {
  if (checking) return checking;
  if (!force && Date.now() - lastCheck < 15_000) return { ok: true, throttled: true };
  lastCheck = Date.now();
  checking = runCheck().finally(() => {
    checking = null;
  });
  return checking;
}

async function runCheck(): Promise<Record<string, unknown>> {
  const state = await loadServerState();
  if (!state) return { ok: false };
  // Paid Mega orders the buyer's browser never handed over (tab closed right after paying).
  let updated = 0;
  for (const order of state.orders) {
    const age = Date.now() - Date.parse(order.createdAt);
    if (!order.provider && order.status === "processing" && age > 60_000 && age < 24 * 3_600_000 && isMegaOrder(state, order)) {
      await sendToMega(state, order);
      updated += 1;
      if (updated >= 20) break;
    }
  }
  const open = state.orders.filter(
    (order) => order.provider?.name === "MEGA" && order.status === "processing" && !["completed", "cancelled"].includes(order.provider.status),
  );
  if (!open.length) return { ok: true, open: 0, updated };
  for (let start = 0; start < open.length; start += 100) {
    const batch = open.slice(start, start + 100);
    const reply = await mega(`/checkordersbyuuid?uuids=${batch.map((order) => order.provider!.uuid).join(",")}`, 20_000);
    if (reply.status !== 200) return { ok: false, error: message(reply) };
    const rows = ((reply.body?.data as { orders?: MegaOrderRow[] } | undefined)?.orders ?? []) as MegaOrderRow[];
    const byUuid = new Map(rows.map((row) => [String(row.uuid ?? ""), row]));
    for (const order of batch) {
      const track = order.provider!;
      const row = byUuid.get(track.uuid);
      if (!row) {
        // Never reached Mega (timeout / busy): send again with the same uuid after a short wait.
        const waited = Date.now() - Date.parse(track.updatedAt);
        if ((track.status === "queued" || track.status === "unknown") && waited > 60_000) {
          if (track.attempts >= 6) await toManual(order, track, "Mega didn't accept the order after 6 tries");
          else await sendToMega(state, order);
          updated += 1;
        }
        continue;
      }
      const status = String(row.status ?? "");
      const note = String(row.noteplus ?? (Array.isArray(row.notes) ? row.notes[0] ?? "" : "")).slice(0, 200);
      const base: ProviderTrack = row.order_number && !track.orderNumber ? { ...track, orderNumber: row.order_number } : track;
      if (status === "completed") {
        await delivered(order, base, row, state);
        updated += 1;
      } else if (status === "cancelled") {
        await refund(order, note || "ألغى المزود الطلب — أُعيد المبلغ", step(base, "cancelled", note));
        updated += 1;
      } else if (status === "awaiting_response" && track.status !== "awaiting_response") {
        await saveOrder(order, { provider: { ...step(base, "awaiting_response", note), note } });
        await tellAdmins(
          `mega:awaiting:${order.id}`,
          `⏳ <b>Mega ينتظر رداً منك</b>\n🛒 ${tgEscape(order.serviceName)} · ${tgEscape(order.packageName)}\n📝 ${tgEscape(note || "—")}\n${tgEscape(base.orderNumber ?? "")}`,
        );
        updated += 1;
      } else if ((status === "processing" || status === "pending") && status !== track.status) {
        await saveOrder(order, { provider: step(base, status as ProviderTrack["status"], note || undefined) });
        updated += 1;
      }
    }
  }
  return { ok: true, open: open.length, updated };
}

/* ====================================================================== webhook */

async function webhook(request: Request, key: string) {
  if (!megaToken() || key !== (await secretKey("webhook"))) return json({ ok: false }, 401);
  const text = (await request.text().catch(() => "")).slice(0, 20_000);
  const supabase = adminClient();
  if (supabase) {
    await supabase.from("mega_events").insert({ kind: "webhook", body: text });
  }
  // A doorbell only: the real status always comes from Mega with our token.
  const result = await checkOrders(true);
  return json({ ok: true, ...result });
}

/* ====================================================================== prices + availability */

async function syncPrices(): Promise<Record<string, unknown>> {
  const state = await loadServerState();
  if (!state) return { ok: false, error: "Store unavailable." };
  const products = await megaProducts(0);
  if ("error" in products) return { ok: false, error: products.error };
  const byId = new Map(products.map((product) => [product.id, product]));
  const settings = settingsOf(state);
  const ops: ServerPatchOp[] = [];
  const report = { checked: 0, changed: 0, disabled: 0, enabled: 0, missing: 0 };
  for (const pack of state.packages) {
    if (!pack.megaProductId) continue;
    report.checked += 1;
    const product = byId.get(pack.megaProductId);
    if (!product) {
      if (pack.megaActive !== false) {
        ops.push({ op: "merge", key: "packages", idKey: "id", id: pack.id, value: { megaActive: false } });
        report.missing += 1;
      }
      continue;
    }
    const unit = cost(product);
    const on = active(product);
    const prices = megaPrices(unit, settings, pack.serviceId);
    const same =
      pack.megaCostUsd === unit &&
      (pack.megaActive !== false) === on &&
      pack.normalPriceCents === prices.normalPriceCents &&
      pack.vipPriceCents === prices.vipPriceCents &&
      !pack.normalPriceSypCents &&
      !pack.vipPriceSypCents;
    if (same) continue;
    if ((pack.megaActive !== false) !== on) {
      if (on) report.enabled += 1;
      else report.disabled += 1;
    }
    report.changed += 1;
    ops.push({
      op: "merge",
      key: "packages",
      idKey: "id",
      id: pack.id,
      value: { megaCostUsd: unit, megaActive: on, megaName: product.name, ...prices, normalPriceSypCents: 0, vipPriceSypCents: 0 },
    });
  }
  // v38: "any amount" services linked to a Mega quantity product.
  for (const service of state.services) {
    const counter = service.serviceMode === "POINT_COUNTER" ? service.counter : undefined;
    if (!counter?.megaProductId) continue;
    report.checked += 1;
    const product = byId.get(counter.megaProductId);
    if (!product) {
      if (counter.megaActive !== false) {
        ops.push({ op: "merge", key: "services", idKey: "id", id: service.id, value: { counter: { ...counter, megaActive: false } } });
        report.missing += 1;
      }
      continue;
    }
    const next = counterFrom(product, counter, settings, service.id);
    if (JSON.stringify(normalizeCounter(counter)) === JSON.stringify(next)) continue;
    if ((counter.megaActive !== false) !== (next.megaActive !== false)) {
      if (next.megaActive !== false) report.enabled += 1;
      else report.disabled += 1;
    }
    report.changed += 1;
    ops.push({ op: "merge", key: "services", idKey: "id", id: service.id, value: { counter: next } });
  }
  if (ops.length) {
    for (let start = 0; start < ops.length; start += 200) {
      const saved = await serverPatch(ops.slice(start, start + 200));
      if (!saved.ok) return { ok: false, error: saved.error, ...report };
    }
    await adminClient()?.from("mega_events").insert({ kind: "sync", body: JSON.stringify(report) });
  }
  // Low Mega balance → Telegram (at most every 6 hours).
  const balance = await megaBalance();
  if (balance && balance.balance < settings.lowBalanceUsd) {
    await tellAdmins(`mega:lowbal:${Math.floor(Date.now() / (6 * 3_600_000))}`, `💳 <b>رصيدك لدى Mega منخفض</b>\nالرصيد الحالي: <b>$${balance.balance.toFixed(2)}</b> (الحد: $${settings.lowBalanceUsd})\nاشحن رصيد Mega لتجنّب تعطّل الطلبات.`);
  }
  // v38.2: a fresh backup of the links whenever their number moved (or none exists yet).
  const linkedNow = state.packages.filter((pack) => pack.megaProductId).length + state.services.filter((service) => service.counter?.megaProductId).length;
  const last = await adminClient()?.from("mega_events").select("body").eq("kind", "links").order("id", { ascending: false }).limit(1);
  let lastCount = -1;
  try {
    const snap = last?.data?.[0] ? (JSON.parse((last.data[0] as { body: string }).body) as LinkSnapshot) : null;
    if (snap) lastCount = Object.keys(snap.p ?? {}).length + Object.keys(snap.c ?? {}).length;
  } catch {
    lastCount = -1;
  }
  if (linkedNow > 0 && linkedNow > lastCount) await snapshotLinks();
  return { ok: true, ...report, balance: balance?.balance };
}

/* ====================================================================== linking (owner) */

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const words = (value: string) => new Set(norm(value).split(" ").filter((word) => word.length > 1 || /\d/.test(word)));
const numbers = (value: string) => (norm(value).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))).join("|");
function similar(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}
function productLabel(product: MegaProduct): string {
  const game = norm(product.gameName ?? "");
  let label = norm(product.name);
  if (game && label.startsWith(game)) label = label.slice(game.length).trim();
  return label || norm(product.name);
}
/** Mega's product name without the game in front ("PUBG Mobile - 60 UC" → "60 UC"). */
function sizeNameOf(product: MegaProduct): string {
  const game = (product.gameName ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const short = game ? product.name.replace(new RegExp(`^${game}\\s*[-–:·]?\\s*`, "i"), "").trim() : product.name;
  return (short || productLabel(product)).slice(0, 60);
}
function packScore(label: string, product: MegaProduct): number {
  const mine = numbers(label);
  const theirs = numbers(productLabel(product));
  if (mine && theirs && mine !== theirs) return 0;
  return (mine && mine === theirs ? 0.55 : 0) + 0.45 * similar(label, productLabel(product)) + (mine ? 0 : 0.1 * similar(label, product.name));
}
function gameScore(service: StoredService, gameName: string): number {
  const options = [service.name, service.nameAr ?? "", service.slug.replace(/-/g, " ")];
  const base = Math.max(...options.map((option) => similar(option, gameName)));
  const contains = options.some((option) => {
    const a = norm(option);
    const b = norm(gameName);
    return a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a));
  });
  return Math.max(base, contains ? 0.75 : 0);
}

function preview(state: NovaState, products: MegaProduct[]) {
  const games = new Map<number, { id: number; name: string; products: MegaProduct[] }>();
  for (const product of products) {
    const game = games.get(product.game_id) ?? { id: product.game_id, name: product.gameName, products: [] };
    game.products.push(product);
    games.set(product.game_id, game);
  }
  const byId = new Map(products.map((product) => [product.id, product]));
  const usedGames = new Set<number>();
  const view = (product: MegaProduct) => ({
    id: product.id,
    name: product.name,
    price: cost(product),
    active: active(product),
    ...(isQty(product) ? { qty: qtyRange(product) } : {}),
    ...((product.daynamicFields ?? []).length === 0 ? { give: true } : {}),
  });
  const services = state.services.map((service) => {
    const manual = service.groupId === ISP_GROUP;
    const counterMode = (service.serviceMode ?? "PACKAGES") === "POINT_COUNTER";
    const packs = counterMode ? [] : state.packages.filter((pack) => pack.serviceId === service.id).sort((a, b) => a.sortOrder - b.sortOrder);
    const counterLink = counterMode ? service.counter?.megaProductId : undefined;
    const linkedGame = [counterLink, ...packs.map((pack) => pack.megaProductId)].map((id) => byId.get(id ?? -1)?.game_id).find((id) => id != null);
    let game = linkedGame != null ? games.get(linkedGame) : undefined;
    if (!game && !manual) {
      let best = 0;
      for (const candidate of games.values()) {
        const score = gameScore(service, candidate.name);
        if (score > best) {
          best = score;
          game = candidate;
        }
      }
      if (best < 0.5) game = undefined;
    }
    if (game) usedGames.add(game.id);
    const regionName = (pack: StoredPackage) => {
      const region = pack.regionId ? service.regions?.find((item) => item.id === pack.regionId) : undefined;
      return region ? `${region.nameEn || ""} ${region.nameAr || ""}`.trim() : "";
    };
    const fixed = (game?.products ?? []).filter((product) => !isQty(product));
    // Best unique match for every size (already-linked sizes keep their product).
    const taken = new Set(packs.map((pack) => pack.megaProductId).filter((id): id is number => Boolean(id)));
    const pairs: Array<{ pack: StoredPackage; product: MegaProduct; score: number }> = [];
    for (const pack of packs) {
      if (pack.megaProductId || !game) continue;
      for (const product of fixed) {
        if (taken.has(product.id)) continue;
        const score = packScore(`${regionName(pack)} ${pack.sizeName}`, product);
        if (score >= 0.45) pairs.push({ pack, product, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    const chosen = new Map<string, { product: MegaProduct; score: number }>();
    for (const pair of pairs) {
      if (chosen.has(pair.pack.id) || taken.has(pair.product.id)) continue;
      chosen.set(pair.pack.id, { product: pair.product, score: pair.score });
      taken.add(pair.product.id);
    }
    const counterProduct = counterLink ? byId.get(counterLink) : undefined;
    const counterSuggestion = counterMode && !counterProduct && !manual ? (game?.products ?? []).find(isQty) : undefined;
    return {
      serviceId: service.id,
      serviceName: service.nameAr || service.name,
      imageUrl: service.imageUrl ?? "",
      mode: counterMode ? "counter" : "packages",
      gameId: game?.id,
      gameName: game?.name,
      manual,
      counter: counterMode
        ? {
            currentProductId: counterLink || undefined,
            suggestion: counterProduct ? view(counterProduct) : counterSuggestion ? view(counterSuggestion) : undefined,
          }
        : undefined,
      packages: packs.map((pack) => {
        const linked = pack.megaProductId ? byId.get(pack.megaProductId) : undefined;
        const suggestion = linked ? { product: linked, score: 1 } : chosen.get(pack.id);
        return {
          packageId: pack.id,
          sizeName: pack.sizeName,
          regionName: regionName(pack) || undefined,
          currentProductId: pack.megaProductId || undefined,
          suggestion: suggestion ? { ...view(suggestion.product), score: Math.round(suggestion.score * 100) / 100 } : undefined,
        };
      }),
    };
  });
  const unmatchedGames = [...games.values()]
    .filter((game) => !usedGames.has(game.id))
    .map((game) => ({ id: game.id, name: game.name, count: game.products.length }));
  // v38: the whole Mega catalog, so the dashboard can search it and pick any game / product by hand.
  const catalog = {
    games: [...games.values()].map((game) => ({ id: game.id, name: game.name, count: game.products.length, image: game.products.find((item) => item.image)?.image ?? "" })),
    products: products.map((product) => ({ ...view(product), gameId: product.game_id })),
  };
  return { services, unmatchedGames, total: products.length, catalog };
}

/** v38: counter settings for a Mega quantity product (price per block, Mega's min / max, live availability). */
function counterFrom(product: MegaProduct, existing: Partial<CounterPricing> | undefined, settings: ReturnType<typeof settingsOf>, serviceId: string): CounterPricing {
  const range = qtyRange(product);
  const prices = megaCounterPrices(cost(product), settings, serviceId);
  return normalizeCounter({
    ...prices,
    pricePer100SypCents: 0,
    vipPricePer100SypCents: 0,
    minPoints: range.min,
    stepPoints: 1,
    maxPoints: range.max,
    unitName: existing?.unitName,
    megaProductId: product.id,
    megaCostUsd: cost(product),
    megaActive: active(product),
    megaName: product.name,
  });
}

function fieldsFrom(product: MegaProduct, existing: CustomField[]): CustomField[] {
  return (product.daynamicFields ?? []).slice(0, 8).map((field) => {
    const keep = existing.find((item) => item.megaName === field.name);
    const options = Array.isArray(field.options)
      ? field.options
          .map((option) => {
            if (option && typeof option === "object") {
              const record = option as Record<string, unknown>;
              const value = String(record.value ?? record.id ?? record.name ?? record.label ?? "");
              return { value, label: String(record.label ?? record.name ?? value) };
            }
            return { value: String(option), label: String(option) };
          })
          .filter((option) => option.value)
          .slice(0, 60)
      : [];
    return {
      id: keep?.id ?? `mf-${field.name}`.slice(0, 40),
      labelAr: (field.label || field.name).slice(0, 60),
      labelEn: field.name.replace(/_/g, " ").slice(0, 60),
      placeholderAr: (field.placeholder || field.help_text || "").slice(0, 80) || undefined,
      placeholderEn: undefined,
      required: field.required !== false,
      megaName: field.name,
      ...(options.length ? { options } : {}),
    };
  });
}

/* ------------------------------------------------------------------ v38.2 link backup + restore */

type LinkSnapshot = { p: Record<string, number>; c: Record<string, number> };

/** Keeps a copy of every Mega link in the Mega log, so links can always be put back. */
async function snapshotLinks(): Promise<void> {
  const supabase = adminClient();
  const state = await loadServerState();
  if (!supabase || !state) return;
  const snap: LinkSnapshot = { p: {}, c: {} };
  for (const pack of state.packages) if (pack.megaProductId) snap.p[pack.id] = pack.megaProductId;
  for (const service of state.services) if (service.counter?.megaProductId) snap.c[service.id] = service.counter.megaProductId;
  if (!Object.keys(snap.p).length && !Object.keys(snap.c).length) return;
  await supabase.from("mega_events").insert({ kind: "links", body: JSON.stringify(snap) });
}

/** Sizes / amount services that lost their link, with the product they had (backups first, then order history). */
async function lostLinks(state: NovaState, products: MegaProduct[]) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const packs = new Map<string, number>();
  const amounts = new Map<string, number>();
  const supabase = adminClient();
  if (supabase) {
    const { data } = await supabase.from("mega_events").select("body").eq("kind", "links").order("id", { ascending: false }).limit(30);
    for (const row of (data ?? []) as Array<{ body: string }>) {
      try {
        const snap = JSON.parse(row.body) as LinkSnapshot;
        for (const [id, product] of Object.entries(snap.p ?? {})) if (!packs.has(id)) packs.set(id, Number(product));
        for (const [id, product] of Object.entries(snap.c ?? {})) if (!amounts.has(id)) amounts.set(id, Number(product));
      } catch {
        /* skip a broken line */
      }
    }
  }
  // Every order sent to Mega remembers its product: newest first.
  const sent = [...state.orders].filter((order) => order.provider?.productId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const order of sent) {
    const productId = order.provider!.productId;
    if (order.packageId.startsWith("points:")) {
      if (!amounts.has(order.serviceId)) amounts.set(order.serviceId, productId);
    } else if (!packs.has(order.packageId)) packs.set(order.packageId, productId);
  }
  const serviceName = (id: string) => {
    const service = state.services.find((item) => item.id === id);
    return service ? service.nameAr || service.name : "—";
  };
  const links = state.packages
    .filter((pack) => !pack.megaProductId && packs.has(pack.id))
    .map((pack) => ({ pack, product: byId.get(packs.get(pack.id)!) }))
    .filter((row): row is { pack: StoredPackage; product: MegaProduct } => Boolean(row.product && !isQty(row.product)))
    .map(({ pack, product }) => ({ packageId: pack.id, productId: product.id, label: `${serviceName(pack.serviceId)} · ${pack.sizeName} → ${product.name}` }));
  const counters = state.services
    .filter((service) => service.serviceMode === "POINT_COUNTER" && !service.counter?.megaProductId && amounts.has(service.id))
    .map((service) => ({ service, product: byId.get(amounts.get(service.id)!) }))
    .filter((row): row is { service: StoredService; product: MegaProduct } => Boolean(row.product && isQty(row.product)))
    .map(({ service, product }) => ({ serviceId: service.id, productId: product.id, label: `${serviceName(service.id)} → ${product.name}` }));
  return { links, counters };
}

async function apply(state: NovaState, products: MegaProduct[], body: Record<string, unknown>) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const settings = settingsOf(state);
  const links = (Array.isArray(body.links) ? body.links : []) as Array<{ packageId?: unknown; productId?: unknown }>;
  const additions = (Array.isArray(body.add) ? body.add : []) as Array<{ serviceId?: unknown; productId?: unknown }>;
  const ops: ServerPatchOp[] = [];
  const touched = new Map<string, MegaProduct>();
  let linked = 0;
  let unlinked = 0;
  let skipped = 0;
  for (const link of links.slice(0, 2000)) {
    const pack = state.packages.find((item) => item.id === link.packageId);
    if (!pack) continue;
    const service = state.services.find((item) => item.id === pack.serviceId);
    if (!service || service.groupId === ISP_GROUP) continue;
    const found = typeof link.productId === "number" ? byId.get(link.productId) : undefined;
    const product = found && !isQty(found) ? found : undefined;
    if (found && !product) {
      skipped += 1; // an "any amount" product can't be one fixed size
      continue;
    }
    if (!product) {
      if (pack.megaProductId) {
        ops.push({ op: "merge", key: "packages", idKey: "id", id: pack.id, value: { megaProductId: null, megaActive: null, megaCostUsd: null, megaName: null } });
        unlinked += 1;
      }
      continue;
    }
    const unit = cost(product);
    ops.push({
      op: "merge",
      key: "packages",
      idKey: "id",
      id: pack.id,
      value: { megaProductId: product.id, megaCostUsd: unit, megaActive: active(product), megaName: product.name, ...megaPrices(unit, settings, pack.serviceId), normalPriceSypCents: 0, vipPriceSypCents: 0 },
    });
    if (!touched.has(service.id)) touched.set(service.id, product);
    linked += 1;
  }
  let added = 0;
  for (const item of additions.slice(0, 500)) {
    const service = state.services.find((row) => row.id === item.serviceId);
    const product = typeof item.productId === "number" ? byId.get(item.productId) : undefined;
    if (!service || !product || service.groupId === ISP_GROUP || isQty(product)) continue;
    const count = state.packages.filter((pack) => pack.serviceId === service.id).length + added;
    if (count >= 20) continue;
    const unit = cost(product);
    ops.push({
      op: "upsert",
      key: "packages",
      idKey: "id",
      at: "end",
      value: {
        id: `pkg_${randomHex(8)}`,
        serviceId: service.id,
        sizeName: sizeNameOf(product),
        ...megaPrices(unit, settings, service.id),
        normalPriceSypCents: 0,
        vipPriceSypCents: 0,
        apiEndpoint: "",
        apiSecretCode: "",
        sortOrder: count,
        megaProductId: product.id,
        megaCostUsd: unit,
        megaActive: active(product),
        megaName: product.name,
      },
    });
    if (!touched.has(service.id)) touched.set(service.id, product);
    added += 1;
  }
  // v38: "any amount" services ↔ Mega quantity products.
  const counterLinks = (Array.isArray(body.counters) ? body.counters : []) as Array<{ serviceId?: unknown; productId?: unknown }>;
  let counters = 0;
  const amountServices = new Set<string>();
  // Fine price blocks need the v38 purchase function, or the database would price them per 100.
  const amountReady = (await guardVersion()) >= 38;
  const wantsAmounts =
    counterLinks.some((item) => typeof item.productId === "number") ||
    (Array.isArray(body.create) && (body.create as Array<{ gameId?: unknown; amount?: unknown }>).some((item) => item.amount === true || (() => {
        const list = products.filter((product) => product.game_id === item.gameId);
        return list.length > 0 && list.every(isQty);
      })()));
  if (wantsAmounts && !amountReady) {
    return { ok: false, error: "شغّل ملف supabase_security.sql الجديد (v38) في Supabase أولاً، ثم اربط خدمات الكمية الحرة · Run the new supabase_security.sql (v38) first." };
  }
  for (const item of counterLinks.slice(0, 500)) {
    const service = state.services.find((row) => row.id === item.serviceId);
    if (!service || service.groupId === ISP_GROUP) continue;
    const product = typeof item.productId === "number" ? byId.get(item.productId) : undefined;
    if (!product) {
      if (service.counter?.megaProductId) {
        const { megaProductId: _id, megaCostUsd: _cost, megaActive: _on, megaName: _name, ...rest } = service.counter;
        ops.push({ op: "merge", key: "services", idKey: "id", id: service.id, value: { counter: normalizeCounter(rest) } });
        unlinked += 1;
      }
      continue;
    }
    if (!isQty(product)) {
      skipped += 1;
      continue;
    }
    ops.push({
      op: "merge",
      key: "services",
      idKey: "id",
      id: service.id,
      value: { serviceMode: "POINT_COUNTER", counter: counterFrom(product, service.counter, settings, service.id) },
    });
    if (!touched.has(service.id)) touched.set(service.id, product);
    amountServices.add(service.id);
    counters += 1;
  }

  // v38: brand-new services straight from a Mega game (every size, price and customer field copied).
  const creations = (Array.isArray(body.create) ? body.create : []) as Array<{ gameId?: unknown; category?: unknown; amount?: unknown }>;
  const created: string[] = [];
  const slugs = new Set(state.services.map((service) => service.slug));
  for (const item of creations.slice(0, 20)) {
    const gameProducts = products.filter((product) => product.game_id === item.gameId);
    if (!gameProducts.length) continue;
    const wantsAmount = item.amount === true || gameProducts.every(isQty);
    const sizes = gameProducts.filter((product) => !isQty(product)).slice(0, 20);
    const amountProduct = gameProducts.find(isQty);
    if (wantsAmount ? !amountProduct : !sizes.length) continue;
    const gameName = gameProducts[0].gameName || `Mega ${String(item.gameId)}`;
    let slug = norm(gameName).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || `mega-${String(item.gameId)}`;
    while (slugs.has(slug)) slug = `${slug.replace(/-\d+$/, "")}-${randomHex(2)}`;
    slugs.add(slug);
    const serviceId = `svc_${randomHex(8)}`;
    const category = ["games", "apps", "subscriptions", "mobile"].includes(String(item.category)) ? String(item.category) : "games";
    const arabic = /[\u0600-\u06FF]/.test(gameName);
    const fieldSource = (wantsAmount ? amountProduct : sizes[0])!;
    const service: StoredService = {
      id: serviceId,
      name: gameName.slice(0, 80),
      nameAr: arabic ? gameName.slice(0, 80) : "",
      slug,
      category: category as StoredService["category"],
      description: "",
      descriptionAr: "",
      instructions: "",
      instructionsAr: "",
      badge: null,
      imageUrl: /^https:\/\//.test(fieldSource.image ?? "") ? String(fieldSource.image) : (gameProducts.find((product) => /^https:\/\//.test(product.image ?? ""))?.image ?? ""),
      createdAt: now(),
      deliverySpeed: "INSTANT",
      targetInputType: fieldsFrom(fieldSource, []).length ? "PLAYER_ID" : "NONE",
      serviceMode: wantsAmount ? "POINT_COUNTER" : "PACKAGES",
      ...(wantsAmount ? { counter: counterFrom(amountProduct!, undefined, settings, serviceId) } : {}),
      customFields: fieldsFrom(fieldSource, []),
    };
    ops.push({ op: "upsert", key: "services", idKey: "id", at: "end", value: service as unknown as Record<string, unknown> });
    if (!wantsAmount) {
      sizes.forEach((product, index) => {
        const unit = cost(product);
        ops.push({
          op: "upsert",
          key: "packages",
          idKey: "id",
          at: "end",
          value: {
            id: `pkg_${randomHex(8)}`,
            serviceId,
            sizeName: sizeNameOf(product),
            ...megaPrices(unit, settings, serviceId),
            normalPriceSypCents: 0,
            vipPriceSypCents: 0,
            apiEndpoint: "",
            apiSecretCode: "",
            sortOrder: index,
            megaProductId: product.id,
            megaCostUsd: unit,
            megaActive: active(product),
            megaName: product.name,
          },
        });
      });
    }
    created.push(slug);
  }

  // Every linked service becomes automatic + instant, with Mega's customer fields.
  for (const [serviceId, product] of touched) {
    const service = state.services.find((item) => item.id === serviceId)!;
    const fields = fieldsFrom(product, (service.customFields ?? []) as CustomField[]);
    ops.push({
      op: "merge",
      key: "services",
      idKey: "id",
      id: serviceId,
      // v38.2: an "any amount" link keeps the service in amount mode (it was switched back to sizes).
      value: {
        deliverySpeed: "INSTANT",
        serviceMode: amountServices.has(serviceId) ? "POINT_COUNTER" : "PACKAGES",
        outOfStock: false,
        ...(fields.length
          ? { customFields: fields, ...(service.targetInputType === "NONE" ? { targetInputType: "PLAYER_ID" } : {}) }
          : // v38.5: Mega asks nothing for this product (gift cards, accounts): the customer types nothing,
            // we hand over the code / account Mega returns. Hand-made fields (no megaName) are kept.
            {
              targetInputType: ((service.customFields ?? []) as CustomField[]).some((field) => !field.megaName) ? service.targetInputType : "NONE",
              customFields: ((service.customFields ?? []) as CustomField[]).filter((field) => !field.megaName),
            }),
      },
    });
  }
  for (let start = 0; start < ops.length; start += 200) {
    const saved = await serverPatch(ops.slice(start, start + 200));
    if (!saved.ok) return { ok: false, error: saved.error };
  }
  if (ops.length) await snapshotLinks();
  return { ok: true, linked, unlinked, added, counters, skipped, created, services: touched.size + created.length };
}

async function adminRoute(request: Request, body: Record<string, unknown>) {
  const state = await loadServerState();
  if (!state) return json({ ok: false, error: "Store unavailable." }, 503);
  const owner = await ownerFromRequest(request, state, body.token);
  if (!owner) return json({ ok: false, error: "🔐 للمالك فقط · Owner only." }, 403);
  const op = String(body.op ?? "");
  if (!megaToken()) return json({ ok: true, configured: false });

  if (op === "overview") {
    const origin = new URL(request.url).origin;
    const balance = await megaBalance();
    const supabase = adminClient();
    const events = supabase ? await supabase.from("mega_events").select("id,kind,body,created_at").order("id", { ascending: false }).limit(15) : null;
    const checkKey = await secretKey("cron-check");
    const syncKey = await secretKey("cron-sync");
    const cronSql = [
      "-- ZovaCharge · Mega timers (Supabase → SQL Editor → Run). Safe to re-run.",
      "create extension if not exists pg_cron;",
      "create extension if not exists pg_net;",
      "select cron.unschedule(jobid) from cron.job where jobname in ('zova-mega-check', 'zova-mega-sync');",
      `select cron.schedule('zova-mega-check', '* * * * *', $$select net.http_get(url := '${origin}/api/mega/check?key=${checkKey}', timeout_milliseconds := 30000)$$);`,
      `select cron.schedule('zova-mega-sync', '*/10 * * * *', $$select net.http_get(url := '${origin}/api/mega/sync?key=${syncKey}', timeout_milliseconds := 30000)$$);`,
    ].join("\n");
    return json({
      ok: true,
      configured: true,
      balance: balance?.balance,
      account: balance?.name,
      webhookUrl: `${origin}/api/mega/webhook?key=${await secretKey("webhook")}`,
      cronSql,
      needsSql: Boolean(events?.error),
      events: events && !events.error ? events.data : [],
      linked: state.packages.filter((pack) => pack.megaProductId).length + state.services.filter((service) => service.counter?.megaProductId).length,
    });
  }
  if (op === "preview" || op === "apply") {
    const products = await megaProducts(op === "preview" ? 0 : 60_000);
    if ("error" in products) return json({ ok: false, error: `Mega: ${products.error}` }, 502);
    if (op === "preview") return json({ ok: true, ...preview(state, products) });
    const result = await apply(state, products, body);
    return json(result, result.ok ? 200 : 500);
  }
  if (op === "restore") {
    const products = await megaProducts(60_000);
    if ("error" in products) return json({ ok: false, error: `Mega: ${products.error}` }, 502);
    const lost = await lostLinks(state, products);
    if (body.apply !== true) return json({ ok: true, found: lost.links.length + lost.counters.length, items: [...lost.links, ...lost.counters].map((row) => row.label).slice(0, 60) });
    const result = await apply(state, products, {
      links: lost.links.map(({ packageId, productId }) => ({ packageId, productId })),
      counters: lost.counters.map(({ serviceId, productId }) => ({ serviceId, productId })),
    });
    return json({ ...result, restored: lost.links.length + lost.counters.length }, result.ok ? 200 : 500);
  }
  if (op === "snapshot") {
    await snapshotLinks();
    return json({ ok: true });
  }
  if (op === "sync") return json(await syncPrices());
  if (op === "check") return json(await checkOrders(true));
  if (op === "retry") {
    const order = state.orders.find((row) => row.id === body.orderId);
    if (!order || !order.provider || order.refunded || !["PENDING_MANUAL", "processing"].includes(order.status)) {
      return json({ ok: false, error: "This order can't be sent again." }, 400);
    }
    const reset: StoredOrder = { ...order, status: "processing", provider: { ...order.provider, error: undefined } };
    await saveOrder(order, { status: "processing", provider: step(reset.provider!, "queued", "Retried by the admin") });
    const fresh = (await loadServerState()) ?? state;
    const current = fresh.orders.find((row) => row.id === order.id) ?? reset;
    return json({ ok: true, status: await sendToMega(fresh, current) });
  }
  return json({ ok: false, error: "Unknown op." }, 400);
}

/* ====================================================================== v29 provider secrets (unchanged) */

type Secret = { packageId: string; apiEndpoint: string; apiSecretCode: string };

/** Only public https hosts can be called (no localhost / private networks). */
function callable(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".invalid") || host.endsWith(".internal")) return false;
    if (/^(127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || host.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

async function legacyPackages(raw: Record<string, unknown>) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503 });
  const body = raw as { action?: unknown; token?: unknown; secrets?: unknown; packageIds?: unknown };
  const state = await loadServerState();
  if (!state) return NextResponse.json({ ok: false, error: "Store not found." }, { status: 503 });
  if (body.action === "get-secrets" || body.action === "save-secrets") {
    const admin = await adminFromToken(state, body.token);
    if (!admin) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });

    if (body.action === "get-secrets") {
      const ids = Array.isArray(body.packageIds) ? body.packageIds.filter((id): id is string => typeof id === "string").slice(0, 500) : [];
      const query = supabase.from("package_secrets").select("package_id,api_endpoint,api_secret_code");
      const { data, error } = ids.length ? await query.in("package_id", ids) : await query;
      if (error) return NextResponse.json({ ok: false, error: `Run migrations/novacharge.sql part 4 (${error.message}).` }, { status: 500 });
      const secrets = (data ?? []).map((row) => ({ packageId: row.package_id as string, apiEndpoint: row.api_endpoint as string, apiSecretCode: row.api_secret_code as string }));
      return NextResponse.json({ ok: true, secrets });
    }

    const list = (Array.isArray(body.secrets) ? body.secrets : []).filter(
      (item): item is Secret =>
        !!item && typeof (item as Secret).packageId === "string" && typeof (item as Secret).apiEndpoint === "string" && typeof (item as Secret).apiSecretCode === "string",
    );
    const keep = list.filter((item) => item.apiEndpoint.trim() || item.apiSecretCode.trim());
    const drop = list.filter((item) => !item.apiEndpoint.trim() && !item.apiSecretCode.trim()).map((item) => item.packageId);
    if (keep.length) {
      const { error } = await supabase.from("package_secrets").upsert(
        keep.map((item) => ({
          package_id: item.packageId.slice(0, 120),
          api_endpoint: item.apiEndpoint.trim().slice(0, 500),
          api_secret_code: item.apiSecretCode.trim().slice(0, 500),
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "package_id" },
      );
      if (error) return NextResponse.json({ ok: false, error: `Run migrations/novacharge.sql part 4 (${error.message}).` }, { status: 500 });
    }
    if (drop.length) await supabase.from("package_secrets").delete().in("package_id", drop);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}

/** v29 generic provider (a size with its own endpoint + secret code, not linked to Mega). */
async function legacyDispatch(state: NovaState, order: StoredOrder) {
  const supabase = adminClient()!;
  const claim = await supabase.from("dispatched_orders").insert({ order_id: order.id, status: "sending" });
  if (claim.error) return NextResponse.json({ ok: true, status: "processing" });
  const { data: secret } = await supabase.from("package_secrets").select("api_endpoint,api_secret_code").eq("package_id", order.packageId).maybeSingle();
  let status: "delivered" | "processing" = "processing";
  const endpoint = (secret?.api_endpoint as string | undefined) ?? "";
  if (endpoint && callable(endpoint)) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_id: order.targetId, code: secret?.api_secret_code ?? "" }),
        signal: AbortSignal.timeout(5000),
      });
      status = response.ok ? "delivered" : "processing";
    } catch {
      status = "processing";
    }
  }
  // Late-answer guard: if the admin cancelled or deleted the order while the provider was slow,
  // never report it as delivered.
  const latest = await loadServerState();
  const current = latest?.orders.find((row) => row.id === order.id);
  if (!current || current.status !== "processing") status = "processing";
  await supabase.from("dispatched_orders").update({ status: current ? status : "cancelled" }).eq("order_id", order.id);
  return NextResponse.json({ ok: true, status, legacy: true });
}
