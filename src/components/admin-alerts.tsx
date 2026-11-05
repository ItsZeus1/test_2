"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, X } from "lucide-react";

import { useProfileState } from "@/components/profile";
import { useI18n, useMoney } from "@/lib/i18n";
import { listBalanceRequests, listSupportTickets, onStoreChange, setBackgroundSync } from "@/lib/store/api";

type Alert = { id: string; title: string; body: string; url: string };

const METHOD_AR: Record<string, string> = { SHAMCASH: "شام كاش", SYRIATEL_CASH: "سيريتل كاش", MTN_CASH: "MTN كاش" };
const METHOD_EN: Record<string, string> = { SHAMCASH: "ShamCash", SYRIATEL_CASH: "Syriatel Cash", MTN_CASH: "MTN Cash" };

let audio: AudioContext | null = null;

/** Two-note chime via Web Audio (no sound file needed). */
function playChime() {
  try {
    audio = audio ?? new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const now = audio.currentTime;
    [880, 1318.5].forEach((frequency, index) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const start = now + index * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(audio!.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    /* audio blocked until the admin interacts with the page */
  }
}

async function systemNotify(alert: Alert) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  const options: NotificationOptions & { vibrate?: number[] } = {
    body: alert.body,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: alert.id,
    data: { url: alert.url },
    vibrate: [200, 100, 200],
  };
  try {
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (registration) await registration.showNotification(alert.title, options);
    else new Notification(alert.title, options);
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}

/** Registers the service worker and asks for notification permission (call from a tap). */
export async function enableAdminAlerts(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission === "granted") playChime();
  return permission;
}

/** Header button for the admin dashboard. */
export function EnableAlertsButton() {
  const { language } = useI18n();
  const [permission, setPermission] = useState<string>("default");
  useEffect(() => {
    setPermission(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  }, []);
  const on = permission === "granted";
  return (
    <button
      type="button"
      onClick={() => void enableAdminAlerts().then(setPermission)}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold ${on ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-500" : "border-amber-400/50 bg-amber-400/10 text-amber-600"}`}
    >
      <BellRing className="size-3.5" />
      {on
        ? language === "ar"
          ? "🔔 إشعارات الهاتف مفعّلة"
          : "🔔 Phone alerts on"
        : permission === "unsupported"
          ? language === "ar"
            ? "المتصفح لا يدعم الإشعارات"
            : "Alerts not supported here"
          : language === "ar"
            ? "🔔 تفعيل إشعارات الهاتف"
            : "🔔 Enable Phone Alerts"}
    </button>
  );
}

/** Admin-only watcher: new pending top-ups and new support messages → OS notification + chime + banner. */
export function AdminAlerts() {
  const { profile } = useProfileState();
  const { language } = useI18n();
  const money = useMoney();
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const isAdmin = profile?.role === "ADMIN";

  useEffect(() => {
    if (!isAdmin) return;
    setBackgroundSync(true);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    // Browsers only allow audio after a user gesture: warm the audio context on the first tap.
    const unlock = () => {
      try {
        audio = audio ?? new AudioContext();
        void audio.resume();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });

    let cancel = false;
    const check = async () => {
      const [requests, support] = await Promise.all([listBalanceRequests().catch(() => []), listSupportTickets()]);
      if (cancel) return;
      const found: Alert[] = [];
      const ids = new Set<string>();
      for (const item of requests) {
        if (item.status !== "PROCESSING") continue;
        const key = `req:${item.id}`;
        ids.add(key);
        const method = item.method ?? "SHAMCASH";
        found.push({
          id: key,
          title: language === "ar" ? "💰 طلب شحن جديد!" : "💰 New top-up request!",
          body: `${item.username} · ${money(item.cents, item.currency ?? "USD")} · ${(language === "ar" ? METHOD_AR : METHOD_EN)[method]}`,
          url: "/admin#topup-queue",
        });
      }
      if (support.ok) {
        for (const ticket of support.tickets) {
          const last = ticket.messages[ticket.messages.length - 1];
          if (!last || last.sender !== "USER") continue;
          const key = `msg:${last.id}`;
          ids.add(key);
          found.push({
            id: key,
            title: language === "ar" ? "💬 رسالة دعم جديدة!" : "💬 New support message!",
            body: `${ticket.userName}: ${last.text.slice(0, 90)}`,
            url: "/admin#support-inbox",
          });
        }
      }
      if (seen.current === null) {
        seen.current = ids; // first look: remember what already exists, alert only on new items
        return;
      }
      const fresh = found.filter((alert) => !seen.current!.has(alert.id));
      seen.current = ids;
      if (fresh.length === 0) return;
      playChime();
      fresh.slice(0, 3).forEach((alert) => void systemNotify(alert));
      setAlerts((current) => [...fresh, ...current].slice(0, 3));
    };
    void check();
    const stop = onStoreChange(() => void check());
    return () => {
      cancel = true;
      stop();
      setBackgroundSync(false);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [isAdmin, language, money]);

  useEffect(() => {
    if (alerts.length === 0) return;
    const timer = window.setTimeout(() => setAlerts((current) => current.slice(0, -1)), 9000);
    return () => window.clearTimeout(timer);
  }, [alerts]);

  if (!isAdmin || alerts.length === 0) return null;
  return (
    <div className="fixed inset-x-3 top-[4.75rem] z-[120] mx-auto flex max-w-md flex-col gap-2" role="region" aria-live="assertive">
      {alerts.map((alert) => (
        <div key={alert.id} className="admin-alert modal-pop flex items-start gap-2 rounded-2xl p-3">
          <button
            type="button"
            onClick={() => {
              setAlerts((current) => current.filter((item) => item.id !== alert.id));
              router.push(alert.url);
            }}
            className="min-w-0 flex-1 text-start"
          >
            <p className="text-sm font-extrabold">{alert.title}</p>
            <p className="truncate text-xs text-muted">{alert.body}</p>
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setAlerts((current) => current.filter((item) => item.id !== alert.id))}
            className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-white/10"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
