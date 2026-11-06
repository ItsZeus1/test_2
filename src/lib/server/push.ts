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

export async function sendToAdmins(payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const supabase = adminClient();
  if (!supabase || !pushConfigured()) return { sent: 0, removed: 0 };
  const { data } = await supabase.from("push_subscriptions").select("endpoint,p256dh,auth");
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
