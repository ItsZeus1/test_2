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

/* ------------------------------ v35: Telegram bot alerts (work with every browser closed) ------------------------------ */

/** True once TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID are set on the server (never sent to browsers). */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && process.env.TELEGRAM_ADMIN_CHAT_ID?.trim());
}

/** Escapes text for Telegram's HTML mode. */
export function tgEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Sends one message to the admin chat. Never throws; false when not configured or Telegram refused. */
export async function sendTelegram(html: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!token || !chatId) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(7000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Once per event for Telegram. Only an existing record (unique violation) means "already sent". */
export async function claimTelegramEvent(id: string): Promise<boolean> {
  const supabase = adminClient();
  if (!supabase) return true;
  const { error } = await supabase.from("push_events").insert({ id });
  return !error || error.code !== "23505";
}
