/** SERVER ONLY. Sends Web Push messages to every subscribed admin device. */
import webpush from "web-push";

import { adminClient } from "@/lib/server/supabase-admin";

export type PushPayload = { title: string; body: string; url: string; tag: string };

let configured = false;

export function pushConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(`mailto:${process.env.VAPID_CONTACT_EMAIL?.trim() || "majd@elmadani.com"}`, publicKey, privateKey);
    configured = true;
  }
  return true;
}

/** Records the event once; returns false if it was already announced (no duplicate alerts). */
export async function claimEvent(id: string): Promise<boolean> {
  const supabase = adminClient();
  if (!supabase) return false;
  const { error } = await supabase.from("push_events").insert({ id });
  return !error;
}

/** Push to every device registered by these users (admins, or one customer). */
export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const supabase = adminClient();
  if (!supabase || !pushConfigured() || userIds.length === 0) return { sent: 0, removed: 0 };
  const { data } = await supabase.from("push_subscriptions").select("endpoint,p256dh,auth").in("user_id", userIds);
  const rows = (data ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>;
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: "high" },
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(row.endpoint); // device unsubscribed or expired
      }
    }),
  );
  if (dead.length) await supabase.from("push_subscriptions").delete().in("endpoint", dead);
  if (sent) {
    await supabase
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in(
        "endpoint",
        rows.map((row) => row.endpoint).filter((endpoint) => !dead.includes(endpoint)),
      );
  }
  return { sent, removed: dead.length };
}

/* ------------------------------ v35/v36: Telegram bot (every customer + up to 3 admins) ------------------------------ */

/** True once TELEGRAM_BOT_TOKEN is set on the server (never sent to browsers). */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export function telegramBotUsername(): string {
  return (process.env.TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
}

/** Secret Telegram sends back on every webhook call (derived from the bot token, never public). */
export async function telegramWebhookSecret(): Promise<string> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`zova-tg-webhook|${token}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 48);
}

/** Escapes text for Telegram's HTML mode. */
export function tgEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Calls one Bot API method. Never throws. */
export async function telegramApi(method: string, payload: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN is not set." };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; result?: unknown; description?: string };
  } catch {
    return { ok: false, description: "Telegram could not be reached." };
  }
}

/** Sends the message to each chat. Returns how many accepted it. */
export async function sendTelegram(html: string, chatIds: string[]): Promise<number> {
  const unique = [...new Set(chatIds.filter(Boolean))];
  const results = await Promise.all(
    unique.map((chatId) => telegramApi("sendMessage", { chat_id: chatId, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true })),
  );
  return results.filter((result) => result.ok).length;
}

/** Chats linked as admins (max 3) + the optional TELEGRAM_ADMIN_CHAT_ID from v35. */
export async function adminChatIds(): Promise<string[]> {
  const supabase = adminClient();
  const ids: string[] = [];
  if (supabase) {
    const { data } = await supabase.from("telegram_links").select("chat_id").eq("is_admin", true).limit(3);
    for (const row of (data ?? []) as Array<{ chat_id: string }>) ids.push(row.chat_id);
  }
  const legacy = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (legacy) ids.push(legacy);
  return [...new Set(ids)];
}

/** Chats a customer linked to their own account. */
export async function userChatIds(userId: string): Promise<string[]> {
  const supabase = adminClient();
  if (!supabase || !userId) return [];
  const { data } = await supabase.from("telegram_links").select("chat_id").eq("user_id", userId).limit(5);
  return ((data ?? []) as Array<{ chat_id: string }>).map((row) => row.chat_id);
}

/** Once per event for Telegram. Only an existing record (unique violation) means "already sent". */
export async function claimTelegramEvent(id: string): Promise<boolean> {
  const supabase = adminClient();
  if (!supabase) return true;
  const { error } = await supabase.from("push_events").insert({ id });
  return !error || error.code !== "23505";
}
