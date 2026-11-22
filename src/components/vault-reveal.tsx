"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Gift, Mail, Share2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { ReceiptBadge } from "@/components/receipt-badge";
import { useI18n } from "@/lib/i18n";
import { useScrollLock } from "@/lib/ui-store";
import type { RevealedPiece } from "@/lib/vault-client";

/** What the voucher photo and the delivery card print around the code / account. */
export type VoucherMeta = { serviceName: string; packageName: string; orderRef: string; date: string };

const isCode = (piece: RevealedPiece) => piece.vaultType === "REDEEM_CODE" || (!piece.email && Boolean(piece.redeemCode));

function copyText(value: string, done: () => void) {
  void navigator.clipboard?.writeText(value).then(done, () => toast.error("Copy failed"));
}

/** One credential well: label, the value in tracked monospace, and a 1-tap copy button. */
function Well({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  const { language } = useI18n();
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <div className="vault-well flex min-w-0 items-center gap-2 rounded-[14px] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`vault-mono select-all break-all ${big ? "text-lg sm:text-xl" : "text-sm"}`} dir="ltr">
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          copyText(value, () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1400);
          })
        }
        aria-label={`${language === "ar" ? "نسخ" : "Copy"} ${label}`}
        className={`vault-copy grid size-11 shrink-0 place-items-center rounded-xl ${done ? "is-done" : ""}`}
      >
        {done ? <Check className="size-4" strokeWidth={2.25} /> : <Copy className="size-4" strokeWidth={1.75} />}
      </button>
    </div>
  );
}

/* ------------------------------ Voucher photo (HTML5 canvas → PNG) ------------------------------ */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Writes `text` at `size`px, shrinking until it fits `maxWidth`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, size: number, family: string, weight = 700) {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && px > 14) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  ctx.fillText(text, x, y);
}

/** The ZovaCharge crest: navy → ice-blue squircle with the white Z and its ice-blue slash. */
function drawCrest(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 64;
  const bg = ctx.createLinearGradient(x, y, x + size, y + size);
  bg.addColorStop(0, "#0F172A");
  bg.addColorStop(0.55, "#0C4A6E");
  bg.addColorStop(1, "#0284C7");
  roundRect(ctx, x, y, size, size, 14 * s);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = "rgba(203,213,225,0.55)";
  ctx.lineWidth = 1.5 * s;
  roundRect(ctx, x + 2.5 * s, y + 2.5 * s, 59 * s, 59 * s, 12 * s);
  ctx.stroke();
  ctx.fillStyle = "#F8FAFC";
  ctx.fillRect(x + 17 * s, y + 17 * s, 30 * s, 6 * s);
  ctx.fillRect(x + 17 * s, y + 41 * s, 30 * s, 6 * s);
  ctx.beginPath();
  ctx.moveTo(x + 40.5 * s, y + 23 * s);
  ctx.lineTo(x + 47 * s, y + 23 * s);
  ctx.lineTo(x + 23.5 * s, y + 41 * s);
  ctx.lineTo(x + 17 * s, y + 41 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#38BDF8";
  ctx.lineWidth = 1.8 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + 43.75 * s, y + 23 * s);
  ctx.lineTo(x + 20.25 * s, y + 41 * s);
  ctx.stroke();
}

/** Draws the branded ZovaCharge Digital Voucher and returns it as a PNG blob (1200×760). */
export async function renderVoucher(piece: RevealedPiece, meta: VoucherMeta, language: "ar" | "en"): Promise<Blob> {
  const ar = language === "ar";
  try {
    await document.fonts?.ready;
  } catch {
    /* system fonts are fine */
  }
  const W = 1200;
  const H = 760;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const sans = `"Alexandria", "Tajawal", "Outfit", system-ui, sans-serif`;
  const mono = `"JetBrains Mono", "Space Grotesk", ui-monospace, monospace`;

  // Card body: deep navy with a soft ice-blue glow.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0B1120");
  bg.addColorStop(0.6, "#0F172A");
  bg.addColorStop(1, "#0C4A6E");
  roundRect(ctx, 0, 0, W, H, 48);
  ctx.fillStyle = bg;
  ctx.fill();
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 10, W * 0.85, H * 0.1, 560);
  glow.addColorStop(0, "rgba(56,189,248,0.35)");
  glow.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(226,232,240,0.22)";
  ctx.lineWidth = 2;
  roundRect(ctx, 14, 14, W - 28, H - 28, 36);
  ctx.stroke();

  // Header: crest + wordmark (left), "Digital voucher" (right).
  drawCrest(ctx, 64, 60, 96);
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "#F8FAFC";
  ctx.font = `800 44px ${sans}`;
  ctx.fillText("ZovaCharge", 184, 112);
  ctx.fillStyle = "#7DD3FC";
  ctx.font = `700 20px ${sans}`;
  ctx.fillText("DIGITAL VOUCHER", 186, 146);
  ctx.direction = ar ? "rtl" : "ltr";
  ctx.textAlign = "right";
  ctx.fillStyle = "#CBD5E1";
  ctx.font = `700 24px ${sans}`;
  ctx.fillText(ar ? "زوفا شارج · بطاقة رقمية" : "Instant delivery", W - 64, 112);

  // Service + package.
  ctx.direction = ar ? "rtl" : "ltr";
  ctx.textAlign = ar ? "right" : "left";
  const textX = ar ? W - 64 : 64;
  ctx.fillStyle = "#F8FAFC";
  fitText(ctx, meta.serviceName, textX, 238, W - 128, 50, sans, 800);
  ctx.fillStyle = "#94A3B8";
  fitText(ctx, meta.packageName, textX, 286, W - 128, 30, sans, 700);

  // Recessed credential panel (concentric: outer 32, inner wells 20).
  const panelY = 322;
  const panelH = 300;
  roundRect(ctx, 48, panelY, W - 96, panelH, 32);
  ctx.fillStyle = "rgba(2,6,23,0.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(125,211,252,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const rows: Array<[string, string, boolean]> = isCode(piece)
    ? [
        [ar ? "كود الاسترداد" : "Redeem code", piece.redeemCode ?? "", true],
        [ar ? "PIN / الرقم التسلسلي" : "PIN / serial", piece.pinOrSerial ?? "", false],
      ]
    : [
        [ar ? "البريد / الحساب" : "Email / account", piece.email, false],
        [ar ? "كلمة المرور" : "Password", piece.password, false],
      ];
  const shownRows = rows.filter(([, value]) => value);
  const wellH = shownRows.length > 1 ? 124 : 236;
  shownRows.forEach(([label, value, big], i) => {
    const y = panelY + 22 + i * (wellH + 12);
    roundRect(ctx, 70, y, W - 140, wellH, 20);
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.fill();
    ctx.direction = ar ? "rtl" : "ltr";
    ctx.textAlign = ar ? "right" : "left";
    ctx.fillStyle = "#7DD3FC";
    ctx.font = `700 22px ${sans}`;
    ctx.fillText(label, ar ? W - 96 : 96, y + 40);
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    fitText(ctx, value, W / 2, y + (shownRows.length > 1 ? 96 : 150), W - 200, big ? 64 : 44, mono, 800);
  });

  // Footer: order reference + date.
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "#94A3B8";
  ctx.font = `700 22px ${mono}`;
  ctx.fillText(`#${meta.orderRef}`, 64, H - 70);
  ctx.textAlign = "right";
  ctx.fillText(meta.date, W - 64, H - 70);
  ctx.textAlign = "center";
  ctx.fillStyle = "#64748B";
  ctx.font = `600 18px ${sans}`;
  ctx.fillText("zovacharge.com", W / 2, H - 70);

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))), "image/png"));
}

function voucherName(meta: VoucherMeta): string {
  return `zovacharge-${meta.orderRef || "voucher"}`.replace(/[^\w-]+/g, "-") + ".png";
}

/** Download / Share buttons for the voucher photo. */
function VoucherActions({ piece, meta }: { piece: RevealedPiece; meta: VoucherMeta }) {
  const { language } = useI18n();
  const ar = language === "ar";
  const [busy, setBusy] = useState<"save" | "share" | null>(null);

  async function save() {
    setBusy("save");
    try {
      const blob = await renderVoucher(piece, meta, language);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = voucherName(meta);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      toast.error(ar ? "تعذّر إنشاء الصورة" : "Could not create the photo");
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy("share");
    try {
      const blob = await renderVoucher(piece, meta, language);
      const file = new File([blob], voucherName(meta), { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: `ZovaCharge · ${meta.serviceName}` });
      } else {
        toast.message(ar ? "المشاركة غير مدعومة هنا — تم حفظ الصورة بدلاً منها" : "Sharing isn't supported here — saved the photo instead");
        setBusy(null);
        await save();
        return;
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast.error(ar ? "تعذّرت المشاركة" : "Could not share");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button type="button" disabled={busy !== null} onClick={() => void save()} className="vault-action min-h-11 rounded-[14px] px-3 text-xs font-bold sm:text-sm">
        <Download className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {busy === "save" ? "…" : ar ? "حفظ البطاقة كصورة" : "Download photo"}
      </button>
      <button type="button" disabled={busy !== null} onClick={() => void share()} className="vault-action min-h-11 rounded-[14px] px-3 text-xs font-bold sm:text-sm">
        <Share2 className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {busy === "share" ? "…" : ar ? "مشاركة" : "Share photo"}
      </button>
    </div>
  );
}

/** Code or account wells + a copy-everything button. */
function Credentials({ piece }: { piece: RevealedPiece }) {
  const { t, language } = useI18n();
  const ar = language === "ar";
  const [allDone, setAllDone] = useState(false);
  const code = isCode(piece);
  const all = code
    ? [piece.redeemCode, piece.pinOrSerial ? `PIN: ${piece.pinOrSerial}` : ""].filter(Boolean).join("\n")
    : [piece.email, piece.password].join("\n");
  return (
    <>
      <div className="grid gap-2">
        {code ? (
          <>
            <Well label={ar ? "كود الاسترداد" : "Redeem code"} value={piece.redeemCode ?? ""} big />
            <Well label={ar ? "PIN / الرقم التسلسلي" : "PIN / serial"} value={piece.pinOrSerial ?? ""} />
          </>
        ) : (
          <>
            <Well label={t.vaultEmail} value={piece.email} />
            <Well label={t.vaultPassword} value={piece.password} />
          </>
        )}
      </div>
      {piece.extraInfo ? (
        <p className="mt-2 rounded-[14px] bg-sky-500/8 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300" dir="auto">
          {piece.extraInfo}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() =>
          copyText(all, () => {
            setAllDone(true);
            window.setTimeout(() => setAllDone(false), 1400);
          })
        }
        className={`vault-copy-all mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] text-sm font-bold ${allDone ? "is-done" : ""}`}
      >
        {allDone ? <Check className="size-4" strokeWidth={2.25} /> : <Copy className="size-4" strokeWidth={1.75} />}
        {allDone ? (ar ? "تم النسخ" : "Copied") : code ? (ar ? "نسخ الكود" : "Copy code") : ar ? "نسخ بيانات الحساب" : "Copy account details"}
      </button>
    </>
  );
}

/**
 * Purchased code / account box (order details, checkout). Concentric frame: 24px outer with
 * 20px padding → 14px wells. With `meta`, the voucher photo buttons appear too.
 */
export function VaultReveal({ piece, compact = false, meta }: { piece: RevealedPiece; compact?: boolean; meta?: VoucherMeta }) {
  const { t, language } = useI18n();
  const ar = language === "ar";
  const code = isCode(piece);
  if (compact) {
    return (
      <p className="vault-chip mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold">
        {code ? <Gift className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden /> : <Mail className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />}
        <span className="truncate">{ar ? "تم التسليم · اضغط لعرض البيانات" : "Delivered · tap to view"}</span>
      </p>
    );
  }
  return (
    <section className="vault-frame mt-3 rounded-[24px] p-5" aria-label={ar ? "بيانات البطاقة / الحساب المشترى" : "Purchased code / account details"}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="vault-frame-icon grid size-9 place-items-center rounded-xl">
          {code ? <Gift className="size-4" strokeWidth={1.75} aria-hidden /> : <ShieldCheck className="size-4" strokeWidth={1.75} aria-hidden />}
        </span>
        <h3 className="text-sm font-extrabold">{ar ? "بيانات البطاقة / الحساب المشترى" : code ? "Your redeem code" : t.vaultRevealTitle}</h3>
        {piece.receiptNumber ? <ReceiptBadge value={piece.receiptNumber} className="ms-auto" /> : null}
      </div>
      <Credentials piece={piece} />
      {meta ? <VoucherActions piece={piece} meta={meta} /> : null}
      <p className="mt-3 text-xs text-muted">{t.vaultKeep}</p>
    </section>
  );
}

/**
 * v30 — "Pop Flash" instant delivery: a white-ice flash, then the code / account in a
 * high-focus card. The page behind cannot scroll until it is closed.
 */
export function VaultFlashModal({ piece, meta, onClose }: { piece: RevealedPiece; meta: VoucherMeta; onClose: () => void }) {
  const { language } = useI18n();
  const ar = language === "ar";
  const code = isCode(piece);
  const closeRef = useRef<HTMLButtonElement>(null);
  useScrollLock(true);
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  // v33: portaled to <body> so it is centred on the current screen, never on the page top.
  return createPortal(
    <div data-lenis-prevent className="vault-flash-backdrop fixed inset-0 z-[155] flex items-center justify-center p-4" role="presentation">
      <span className="vault-flash-burst" aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="vault-flash-title" className="vault-flash-card relative max-h-[92dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-[28px] p-5">
        <button ref={closeRef} type="button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"} className="vault-flash-close absolute end-3 top-3 grid size-10 place-items-center rounded-xl">
          <X className="size-4" />
        </button>
        <div className="flex flex-col items-center pt-2 text-center">
          <span className="vault-flash-seal grid size-14 place-items-center rounded-2xl">
            {code ? <Gift className="size-6" strokeWidth={1.75} aria-hidden /> : <ShieldCheck className="size-6" strokeWidth={1.75} aria-hidden />}
          </span>
          <p className="mt-3 text-[11px] font-extrabold tracking-[0.2em] text-sky-600 uppercase dark:text-sky-300">{ar ? "تم التسليم فوراً" : "Delivered instantly"}</p>
          <h2 id="vault-flash-title" className="mt-1 font-display text-xl font-extrabold text-balance">
            {code ? (ar ? "كود بطاقتك جاهز" : "Your code is ready") : ar ? "حسابك جاهز" : "Your account is ready"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {meta.serviceName} · {meta.packageName}
          </p>
        </div>
        <div className="vault-frame mt-4 rounded-[24px] p-5">
          <Credentials piece={piece} />
        </div>
        <VoucherActions piece={piece} meta={meta} />
        <p className="mt-3 text-center text-xs text-muted">{ar ? "محفوظ دائماً في «طلباتي» إن احتجته لاحقاً." : "Always saved in My Orders if you need it later."}</p>
      </div>
    </div>,
    document.body,
  );
}
