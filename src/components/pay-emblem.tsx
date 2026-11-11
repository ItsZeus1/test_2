import { AppWindow, CreditCard, Gamepad2, Gift, Globe, LayoutGrid, Signal, Ticket, Tv } from "lucide-react";

import type { Copy } from "@/lib/i18n";
import type { PaymentMethod } from "@/lib/store/types";

export function methodLabel(t: Copy, method: PaymentMethod): string {
  return method === "SYRIATEL_CASH" ? t.methodSyriatel : method === "MTN_CASH" ? t.methodMtn : t.methodShamcash;
}

export const PAYMENT_ICONS: Record<PaymentMethod, string> = {
  SHAMCASH: "/payments/shamcash.webp",
  SYRIATEL_CASH: "/payments/syriatel.webp",
  MTN_CASH: "/payments/mtn.webp",
};

/** Brand icon on a white squircle with a ring in the method's colour. */
export function PayEmblem({ method, size = "md" }: { method: PaymentMethod; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-10 rounded-lg p-1" : "h-10 w-14 rounded-xl p-1.5";
  const ring = method === "SYRIATEL_CASH" ? "pay-ring-syriatel" : method === "MTN_CASH" ? "pay-ring-mtn" : "pay-ring-sham";
  return (
    <span className={`pay-emblem grid shrink-0 place-items-center bg-white ${ring} ${box}`} aria-hidden>
      <img src={PAYMENT_ICONS[method]} alt="" className={`max-h-full max-w-full object-contain ${method === "SYRIATEL_CASH" ? "syriatel-crisp" : ""}`} loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}

/** Small colour-coded badge used in admin lists. */
export function MethodBadge({ method, t }: { method: PaymentMethod; t: Copy }) {
  const tone =
    method === "SYRIATEL_CASH"
      ? "bg-rose-600 text-white"
      : method === "MTN_CASH"
        ? "bg-yellow-400 text-slate-950"
        : "bg-emerald-500 text-white";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-black ${method === "MTN_CASH" ? "" : "keep-white"} ${tone}`}>
      {methodLabel(t, method)}
    </span>
  );
}

/** Five-pointed star path centred at (cx, cy). */
function starPath(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.382;
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

/**
 * Current Syrian flag (green / white with three red stars / black) as an inline SVG.
 * Replaces the Syrian flag emoji, which Windows and Android still draw as the old flag.
 */
export function SyriaGreenFlagIcon({ className = "h-3.5 w-5" }: { className?: string }) {
  return (
    <span className={`syria-flag inline-block shrink-0 overflow-hidden rounded-[3px] shadow-sm ${className}`} aria-hidden>
      <svg viewBox="0 0 30 20" className="block h-full w-full" preserveAspectRatio="none">
        <rect width="30" height="6.67" fill="#007A3D" />
        <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
        <rect y="13.33" width="30" height="6.67" fill="#000000" />
        <path d={starPath(9, 10, 2.3)} fill="#CE1126" />
        <path d={starPath(15, 10, 2.3)} fill="#CE1126" />
        <path d={starPath(21, 10, 2.3)} fill="#CE1126" />
      </svg>
    </span>
  );
}

/** Service-group icons (named keys stored with each group, rendered as fine-line SVG). */
export const GROUP_ICON_KEYS = ["gamepad", "apps", "ticket", "signal", "globe", "grid", "gift", "tv", "card"] as const;
const GROUP_ICONS: Record<string, typeof Gamepad2> = {
  gamepad: Gamepad2,
  apps: AppWindow,
  ticket: Ticket,
  signal: Signal,
  globe: Globe,
  grid: LayoutGrid,
  gift: Gift,
  tv: Tv,
  card: CreditCard,
};

export function GroupIcon({ name, className = "size-5" }: { name: string; className?: string }) {
  const Icon = GROUP_ICONS[name] ?? LayoutGrid;
  return <Icon className={`lux-icon ${className}`} strokeWidth={1.75} aria-hidden />;
}

