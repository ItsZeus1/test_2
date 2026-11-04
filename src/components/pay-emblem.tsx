import type { Copy } from "@/lib/i18n";
import type { PaymentMethod } from "@/lib/store/types";

export function methodLabel(t: Copy, method: PaymentMethod): string {
  return method === "SYRIATEL_CASH" ? t.methodSyriatel : method === "MTN_CASH" ? t.methodMtn : t.methodShamcash;
}

/** Original brand-coloured shortcut emblems (not the operators' logos). */
export function PayEmblem({ method, size = "md" }: { method: PaymentMethod; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-6 rounded-lg text-[9px]" : "size-10 rounded-xl text-xs";
  if (method === "SYRIATEL_CASH") {
    return (
      <span className={`pay-emblem pay-emblem-syriatel grid shrink-0 place-items-center font-black ${box}`} aria-hidden>
        S
      </span>
    );
  }
  if (method === "MTN_CASH") {
    return (
      <span className={`pay-emblem pay-emblem-mtn grid shrink-0 place-items-center font-black tracking-tight ${box}`} aria-hidden>
        MTN
      </span>
    );
  }
  return (
    <span className={`pay-emblem pay-emblem-sham grid shrink-0 place-items-center font-black ${box}`} aria-hidden>
      ⚡
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
