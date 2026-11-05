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
      <img src={PAYMENT_ICONS[method]} alt="" className="max-h-full max-w-full object-contain" loading="lazy" decoding="async" draggable={false} />
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
