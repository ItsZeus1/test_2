"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, X } from "lucide-react";

import { useProfileState } from "@/components/profile";
import { useI18n, useMoney } from "@/lib/i18n";
import { listBalanceRequests, listMyBalanceRequests, listMyOrders, listSupportTickets, onStoreChange, setBackgroundSync, setNotificationsEnabled } from "@/lib/store/api";
import { toast } from "sonner";
import { SESSION_KEY } from "@/lib/store/data";

type Alert = { id: string; title: string; body: string; url: string; at?: string };

/* ---------- closed-browser catch-up ---------- */
const lastSeenKey = (userId: string) => `zovacharge_last_seen_event_at_${userId}`;
function readLastSeen(userId: string): number | null {
  try {
    const raw = window.localStorage.getItem(lastSeenKey(userId));
    return raw ? Date.parse(raw) || null : null;
  } catch {
    return null;
  }
}
function markSeen(userId: string): void {
  try {
    window.localStorage.setItem(lastSeenKey(userId), new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/**
 * Hands the session to the service worker (so it can catch up while the site is closed)
 * and registers background sync / periodic sync where the browser supports them.
 */
async function handOffToServiceWorker(userId: string | null): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const target = registration.active ?? navigator.serviceWorker.controller;
    const since = userId ? new Date(readLastSeen(userId) ?? Date.now()).toISOString() : undefined;
    target?.postMessage({ type: "auth", token: userId ? window.localStorage.getItem(SESSION_KEY) : null, since });
    if (!userId || Notification.permission !== "granted") return;
    const withSync = registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
      periodicSync?: { register: (tag: string, options: { minInterval: number }) => Promise<void> };
    };
    await withSync.sync?.register("zovacharge-catchup").catch(() => undefined);
    await withSync.periodicSync?.register("zovacharge-catchup", { minInterval: 15 * 60 * 1000 }).catch(() => undefined);
  } catch {
    /* service workers unavailable */
  }
}

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

/* ============================ Success sounds (Web Audio, no files) ============================ */

function audioCtx(): AudioContext | null {
  try {
    audio = audio ?? new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** One soft bell partial: quick attack, long exponential decay. */
function bell(ctx: AudioContext, frequency: number, start: number, length: number, peak: number, type: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

/**
 * Wallet top-up credited: warm "vault & coin shimmer" — an ascending C major-7 bell arpeggio
 * (C5 → E5 → G5 → B5 → C6) over a soft sub-bass pulse.
 */
export function playTopupSuccessSound(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  bell(ctx, 65.41, now, 0.6, 0.18); // C2 sub-bass pulse
  [523.25, 659.25, 783.99, 987.77, 1046.5].forEach((frequency, index) => {
    const start = now + index * 0.085;
    bell(ctx, frequency, start, 1.1, 0.16);
    bell(ctx, frequency * 2.01, start, 0.5, 0.04); // shimmer overtone
  });
}

/**
 * Game / service charge completed: tactical "power-up & loot unlock" — fast electric fifths
 * (D5 → A5 → D6 → F#6) with a bright resonant sweep.
 */
export function playGameChargeSuccessSound(): void {
  const ctx = audioCtx();
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  [587.33, 880.0, 1174.66, 1479.98].forEach((frequency, index) => {
    const start = now + index * 0.06;
    bell(ctx, frequency, start, 0.35, 0.09, "square");
    bell(ctx, frequency, start, 0.6, 0.12, "triangle");
  });
  // crystal resonance sweep
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1200, now + 0.22);
  osc.frequency.exponentialRampToValueAtTime(3200, now + 0.6);
  gain.gain.setValueAtTime(0.0001, now + 0.22);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now + 0.22);
  osc.stop(now + 0.8);
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

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/**
 * Subscribes this device to server-sent Web Push and stores the address in Supabase
 * (through /api/push/subscribe, which checks the admin session). Silent no-op when push
 * isn't configured yet.
 */
export async function subscribeDeviceToPush(): Promise<{ ok: boolean; error?: string }> {
  if (!VAPID_PUBLIC_KEY) return { ok: false, error: "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set yet." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "This browser cannot receive push. On iPhone, add the site to your Home Screen first." };
  }
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) as BufferSource,
      }));
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: window.localStorage.getItem(SESSION_KEY), subscription: subscription.toJSON() }),
    });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? `Server answered ${response.status}.` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Push subscription failed." };
  }
}

/** Registers the service worker, asks for permission, and subscribes to closed-browser push (call from a tap). */
export async function enableAdminAlerts(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission === "granted") {
    playChime();
    void subscribeDeviceToPush();
    void setNotificationsEnabled(true);
  }
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
          ? "إشعارات الهاتف مفعّلة"
          : "Phone alerts on"
        : permission === "unsupported"
          ? language === "ar"
            ? "المتصفح لا يدعم الإشعارات"
            : "Alerts not supported here"
          : language === "ar"
            ? "تفعيل إشعارات الهاتف"
            : "Enable Phone Alerts"}
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
          at: item.createdAt,
          title: language === "ar" ? "طلب شحن جديد!" : "New top-up request!",
          body: `${item.username} · ${money(item.cents, item.currency ?? "USD")} · ${(language === "ar" ? METHOD_AR : METHOD_EN)[method]}`,
          url: "/admin#topup-queue",
        });
      }
      if (support.ok) {
        for (const ticket of support.tickets) {
          const human = ticket.messages.filter((message) => !message.isAutoReply);
          const last = human[human.length - 1];
          if (!last || last.sender !== "USER") continue;
          const key = `msg:${last.id}`;
          ids.add(key);
          found.push({
            id: key,
            at: last.createdAt,
            title: language === "ar" ? "رسالة دعم جديدة!" : "New support message!",
            body: `${ticket.userName}: ${last.text.slice(0, 90)}`,
            url: "/admin#support-inbox",
          });
        }
      }
      let fresh: Alert[];
      if (seen.current === null) {
        // First look after opening / waking: alert on what arrived while the browser was closed.
        const lastSeen = profile ? readLastSeen(profile.userId) : null;
        fresh = lastSeen === null ? [] : found.filter((alert) => alert.at && Date.parse(alert.at) > lastSeen);
      } else {
        const known = seen.current;
        fresh = found.filter((alert) => !known.has(alert.id));
      }
      seen.current = ids;
      if (profile) markSeen(profile.userId);
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

/**
 * Setup helper for closed-browser alerts. Generates the VAPID key pair right in the browser
 * (no terminal needed), shows what the server still lacks, and copies the SQL.
 */
export function PushSetupCard({ sql }: { sql: string }) {
  const { language } = useI18n();
  const ar = language === "ar";
  const [status, setStatus] = useState<{ publicKey: boolean; privateKey: boolean; serviceRole: boolean } | null>(null);
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/push/status")
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  async function generate() {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const publicKey = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    setKeys({ publicKey, privateKey: jwk.d ?? "" });
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setMessage(ar ? "تم النسخ" : "Copied");
    window.setTimeout(() => setMessage(null), 1500);
  }

  async function testDevice() {
    const result = await subscribeDeviceToPush();
    setMessage(result.ok ? (ar ? "تم ربط هذا الجهاز ✓" : "This device is subscribed ✓") : result.error ?? "Failed");
  }

  const ready = status?.publicKey && status.privateKey && status.serviceRole;
  const Row = ({ ok, label }: { ok?: boolean; label: string }) => (
    <li className="flex items-center gap-2 text-sm">
      <span className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-emerald-500 text-white" : "bg-amber-400/30 text-amber-600"}`}>{ok ? "✓" : "!"}</span>
      <code dir="ltr" className="text-xs">
        {label}
      </code>
    </li>
  );

  return (
    <section className="nova-grid-border glass mt-6 rounded-[1.75rem] p-4 sm:p-5">
      <h2 className="font-display text-xl font-extrabold">{ar ? "إشعارات والمتصفح مغلق" : "Alerts with the browser closed"}</h2>
      <p className="mt-1 text-sm text-muted">
        {ready
          ? ar
            ? "الإعداد مكتمل. اضغط «ربط هذا الجهاز» على كل هاتف أو حاسوب تريد أن يصله التنبيه."
            : "Setup complete. Tap “Subscribe this device” on every phone or computer that should get alerts."
          : ar
            ? "خطوة لمرة واحدة: أنشئ المفاتيح هنا، ضعها في Vercel، شغّل SQL في Supabase، ثم أعد النشر."
            : "One-time setup: generate the keys here, add them in Vercel, run the SQL in Supabase, then redeploy."}
      </p>
      <ul className="mt-3 grid gap-1.5">
        <Row ok={status?.publicKey} label="NEXT_PUBLIC_VAPID_PUBLIC_KEY" />
        <Row ok={status?.privateKey} label="VAPID_PRIVATE_KEY" />
        <Row ok={status?.serviceRole} label="SUPABASE_SERVICE_ROLE_KEY" />
      </ul>

      {!ready ? (
        <div className="mt-4 space-y-3">
          <button type="button" onClick={() => void generate()} className="btn-glow keep-white min-h-11 rounded-full px-4 text-sm font-semibold text-white">
            {ar ? "1 · إنشاء مفاتيح VAPID" : "1 · Generate VAPID keys"}
          </button>
          {keys ? (
            <div className="grid gap-2">
              {[
                ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey],
                ["VAPID_PRIVATE_KEY", keys.privateKey],
              ].map(([name, value]) => (
                <div key={name} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs font-bold text-muted" dir="ltr">
                    {name}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <code dir="ltr" className="min-w-0 flex-1 truncate text-xs">
                      {value}
                    </code>
                    <button type="button" onClick={() => void copy(value)} className="min-h-9 shrink-0 rounded-full border border-white/15 px-3 text-xs font-bold">
                      {ar ? "نسخ" : "Copy"}
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-amber-600">
                {ar
                  ? "احفظ المفتاحين الآن: لا يمكن عرضهما مرة أخرى. لا تشارك المفتاح الخاص مع أحد."
                  : "Save both now: they can't be shown again. Never share the private key."}
              </p>
            </div>
          ) : null}
          <button type="button" onClick={() => void copy(sql)} className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold">
            {ar ? "2 · نسخ SQL الإشعارات (novacharge.sql · part 2)" : "2 · Copy push SQL (novacharge.sql · part 2)"}
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void testDevice()} className="min-h-11 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-4 text-sm font-semibold text-emerald-600">
          {ar ? "ربط هذا الجهاز" : "Subscribe this device"}
        </button>
        {message ? <span className="text-xs font-semibold text-muted">{message}</span> : null}
      </div>
    </section>
  );
}

/* ============================ customers ============================ */

/** Permission + service worker + push subscription for any signed-in user (no chime). */
export async function enableNotifications(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if ("serviceWorker" in navigator) await navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission === "granted") {
    void subscribeDeviceToPush();
    void setNotificationsEnabled(true);
  }
  return permission;
}

const DISMISS_KEY = "novacharge.notifyPromptDismissed";

/** Navy & chrome reminder: shown to signed-in customers who haven't decided on notifications yet. */
export function NotifyOptInBar() {
  const { profile } = useProfileState();
  const { language } = useI18n();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!profile || profile.role === "ADMIN") {
      setVisible(false);
      return;
    }
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* ignore */
    }
    setVisible(!dismissed && "Notification" in window && Notification.permission === "default");
  }, [profile]);
  if (!visible) return null;
  const ar = language === "ar";
  const hide = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="mx-auto mt-3 max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="notify-bar keep-white flex items-center gap-3 rounded-2xl border border-sky-400/30 px-4 py-2.5 text-white shadow-lg">
        <BellRing className="size-4 shrink-0 text-sky-300" />
        <p className="min-w-0 flex-1 text-xs font-semibold sm:text-sm">
          {ar ? "فعّل الإشعارات لتصلك نتيجة طلبات الشحن وشحن المحفظة فوراً." : "Turn on notifications to hear the moment your top-ups and orders are done."}
        </p>
        <button
          type="button"
          onClick={() => void enableNotifications().then(hide)}
          className="min-h-9 shrink-0 rounded-full bg-white px-3 text-xs font-bold text-[#0f172a]"
        >
          {ar ? "تفعيل الإشعارات" : "Enable alerts"}
        </button>
        <button type="button" onClick={hide} aria-label={ar ? "إغلاق" : "Dismiss"} className="grid size-8 shrink-0 place-items-center rounded-lg text-white/80 hover:bg-white/10">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Customer watcher (own account only): top-up approved/rejected and manual order completed/declined.
 * In-app toast + system notification (same tag as the server push, so the phone never shows it twice).
 */
export function CustomerAlerts() {
  const { profile } = useProfileState();
  // Keep the service worker's session in step with sign-in / sign-out (admins included).
  useEffect(() => {
    void handOffToServiceWorker(profile?.userId ?? null);
  }, [profile?.userId]);
  const { language } = useI18n();
  const money = useMoney();
  const seen = useRef<Map<string, string> | null>(null);
  const active = Boolean(profile && profile.role !== "ADMIN");

  useEffect(() => {
    if (!active) {
      seen.current = null;
      return;
    }
    const ar = language === "ar";
    let cancel = false;
    const check = async () => {
      const [requests, orders] = await Promise.all([listMyBalanceRequests(), listMyOrders()]);
      if (cancel) return;
      const now = new Map<string, string>();
      requests.forEach((item) => now.set(`req:${item.id}`, item.status));
      orders.forEach((order) => now.set(`ord:${order.id}`, order.status));
      const before = seen.current;
      seen.current = now;
      const alerts: Alert[] = [];
      if (!before) {
        // First look after opening / waking: results that arrived while the browser was closed.
        const lastSeen = profile ? readLastSeen(profile.userId) : null;
        if (profile) markSeen(profile.userId);
        if (lastSeen === null) return;
        for (const item of requests) {
          if (item.status !== "PROCESSING" && item.processedAt && Date.parse(item.processedAt) > lastSeen) {
            const ok = item.status === "APPROVED";
            alerts.push({
              id: `topup-result-${item.id}`,
              title: ok ? (ar ? "تمت الموافقة وإضافة الرصيد" : "Top-up approved") : ar ? "تم رفض طلب الشحن" : "Top-up rejected",
              body: `${money(item.cents, item.currency)}${item.receiptNumber ? ` · #${item.receiptNumber}` : ""}`,
              url: "/wallet",
            });
          }
        }
        for (const order of orders) {
          if (["COMPLETED", "DECLINED", "CANCELLED_BY_ADMIN"].includes(order.status) && order.resolvedAt && Date.parse(order.resolvedAt) > lastSeen) {
            alerts.push({
              id: `order-result-${order.id}`,
              title: order.status === "COMPLETED" ? (ar ? "تم تنفيذ طلب الشحن بنجاح" : "Order completed") : ar ? "تم إلغاء/رفض الطلب وإعادة الرصيد" : "Order cancelled / declined, refunded",
              body: `${order.serviceName} · ${order.packageName}`,
              url: "/orders",
            });
          }
        }
        for (const alert of alerts.slice(0, 4)) {
          toast(alert.title, { description: alert.body });
          void systemNotify(alert);
        }
        return;
      }
      if (profile) markSeen(profile.userId);
      for (const item of requests) {
        const was = before.get(`req:${item.id}`);
        if (was === "PROCESSING" && item.status !== "PROCESSING") {
          const ok = item.status === "APPROVED";
          alerts.push({
            id: `topup-result-${item.id}`,
            title: ok ? (ar ? "تمت الموافقة وإضافة الرصيد" : "Top-up approved") : ar ? "تم رفض طلب الشحن" : "Top-up rejected",
            body: `${money(item.cents, item.currency)}${item.receiptNumber ? ` · #${item.receiptNumber}` : ""}`,
            url: "/wallet",
          });
        }
      }
      for (const order of orders) {
        const was = before.get(`ord:${order.id}`);
        const wasWaiting = was === "PENDING_MANUAL" || was === "processing" || was === "PROCESSING";
        if (wasWaiting && (order.status === "COMPLETED" || order.status === "DECLINED" || order.status === "CANCELLED_BY_ADMIN")) {
          const ok = order.status === "COMPLETED";
          alerts.push({
            id: `order-result-${order.id}`,
            title: ok
              ? ar ? "تم تنفيذ طلب الشحن بنجاح" : "Order completed"
              : order.status === "CANCELLED_BY_ADMIN"
                ? ar ? "تم إلغاء الطلب وإعادة الرصيد للمحفظة" : "Order cancelled, refunded"
                : ar ? "تم رفض الطلب وإعادة الرصيد للمحفظة" : "Order declined, refunded",
            body: `${order.serviceName} · ${order.packageName}${order.receiptNumber ? ` · #${order.receiptNumber}` : ""}`,
            url: "/orders",
          });
        }
      }
      if (alerts.some((alert) => alert.id.startsWith("topup-result-") && alert.title.includes(ar ? "الموافقة" : "approved"))) playTopupSuccessSound();
      else if (alerts.some((alert) => alert.id.startsWith("order-result-") && alert.title.includes(ar ? "تنفيذ" : "completed"))) playGameChargeSuccessSound();
      for (const alert of alerts) {
        toast(alert.title, { description: alert.body });
        void systemNotify(alert);
      }
    };
    void check();
    const stop = onStoreChange(() => void check());
    return () => {
      cancel = true;
      stop();
    };
  }, [active, language, money]);

  return null;
}

