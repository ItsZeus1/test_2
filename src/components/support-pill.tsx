"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Camera, Headset, ImageOff, MessageCircle, Plus, Send, X, ZoomIn, ZoomOut, Zap } from "lucide-react";
import { toast } from "sonner";

import { useProfileState } from "@/components/profile";
import { useI18n } from "@/lib/i18n";
import { Link } from "@/lib/nav";
import { closeMyTicket, endGuestTicket, getGuestTicket, listMySupportTickets, loadSupportImage, markSupportRead, onStoreChange, sendGuestSupportMessage, sendSupportMessage, uploadSupportImage } from "@/lib/store/api";
import type { SupportMessage, SupportTicket } from "@/lib/store/types";
import { useNovaUi } from "@/lib/ui-store";

const REPLIES = {
  en: [
    {
      q: "Where is my order?",
      a: "Open My Orders. Delivered top-ups include a reference like NC-••••. Most credits land in under five minutes. If the player ID was wrong, the charge still shows there so support can see exactly what was sent.",
    },
    {
      q: "Which ID do I paste?",
      a: "Games want the in-game player or character ID. Apps want the account ID on the profile. Subscriptions want the email on that membership. Mobile data wants the phone number with country code.",
    },
    {
      q: "How do VIP rates work?",
      a: "VIP and admin accounts pay the VIP price. Normal accounts pay the standard price. An admin can switch your role from the control center.",
    },
    {
      q: "How do I add wallet credit?",
      a: "Tap + Top Up, send that amount to the ShamCash wallet address, then submit the sender name or transfer reference. The request stays Processing until an admin approves it. Balance is not added instantly.",
    },
  ],
  ar: [
    {
      q: "أين طلبي؟",
      a: "افتح طلباتي. الشحن المُسلّم يظهر بمرجع مثل NC-••••. أغلب الرصيد يصل خلال أقل من خمس دقائق. إذا كان معرف اللاعب خاطئاً يبقى الطلب ظاهراً ليتابع الدعم ما أُرسل.",
    },
    {
      q: "أي معرف ألصق؟",
      a: "الألعاب تحتاج معرف اللاعب داخل اللعبة. التطبيقات تحتاج معرف الحساب في الملف. الاشتراكات تحتاج بريد العضوية. رصيد الموبايل يحتاج رقم الهاتف مع رمز الدولة.",
    },
    {
      q: "كيف تعمل أسعار VIP؟",
      a: "حسابات VIP والإدارة تدفع سعر VIP. الحساب العادي يدفع السعر القياسي. يمكن للإدارة تغيير رتبتك من مركز التحكم.",
    },
    {
      q: "كيف أشحن المحفظة؟",
      a: "اضغط + شحن، أرسل المبلغ إلى عنوان محفظة شام كاش، ثم أدخل اسم المرسل أو رقم التحويل. يبقى الطلب قيد المعالجة حتى موافقة الإدارة. لا يُضاف الرصيد فوراً.",
    },
  ],
} as const;

/** Stage-1 help hub answers. */
const HUB_FAQ = {
  ar: [
    { q: "كم يستغرق قبول حوالة شام كاش أو سيريتل كاش أو MTN كاش؟", a: "عادةً خلال دقائق بعد التحقق من وصول الحوالة. يظهر متوسط وقت القبول الحالي في نافذة شحن المحفظة، وتصلك رسالة فور الموافقة." },
    { q: "أرسلت طلب شحن للعبة، متى يصل الرصيد لحسابي؟", a: "الخدمات الفورية تُنفّذ خلال ثوانٍ إلى دقائق. يمكنك متابعة الحالة ورقم الإيصال من «طلباتي»." },
    { q: "ماذا أفعل إذا أدخلت معرف لاعب (ID) خاطئ؟", a: "تواصل معنا فوراً مع رقم الإيصال. إذا لم يُنفّذ الطلب بعد نحاول إيقافه، أما الطلبات المكتملة فلا يمكن عكسها حسب الشروط." },
    { q: "كيف تعمل خدمات الخزنة الرقمية (Vault) والخدمات اليدوية؟", a: "الخزنة تسلّمك بيانات الحساب أو الكود فوراً بعد الشراء. الخدمات اليدوية (مثل الإنترنت) ينفّذها فريقنا ويصلك إشعار عند الإنجاز، وإذا رُفض الطلب يعود الرصيد لمحفظتك." },
    { q: "كيف يمكنني ترقية حسابي إلى VIP والحصول على نسبة ربح؟", a: "تواصل مع الدعم لطلب الترقية. حسابات VIP تحصل على أسعار أقل ويمكنها تحديد نسبة ربح 0–25% لعرض سعر البيع." },
  ],
  en: [
    { q: "How long does a ShamCash, Syriatel Cash or MTN Cash transfer take to approve?", a: "Usually a few minutes once the transfer is verified. The current average approval time is shown in the top-up window, and you're notified the moment it's approved." },
    { q: "I placed a game top-up — when will it arrive?", a: "Instant services complete within seconds to minutes. Track the status and receipt number under My Orders." },
    { q: "What if I entered the wrong player ID?", a: "Contact us right away with the receipt number. If the order hasn't been processed we'll try to stop it; completed top-ups can't be reversed under the terms." },
    { q: "How do Digital Vault and manual services work?", a: "Vault items deliver the account details or code instantly after purchase. Manual services (like internet) are fulfilled by our team and you're notified when done; declined orders are refunded to your wallet." },
    { q: "How do I upgrade to VIP and set a profit margin?", a: "Ask support for an upgrade. VIP accounts get lower prices and can set a 0–25% margin to show a selling price." },
  ],
} as const;

/** Live list of the signed-in user's tickets. */
function useMyTickets(enabled: boolean): SupportTicket[] {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  useEffect(() => {
    if (!enabled) {
      setTickets([]);
      return;
    }
    let cancel = false;
    const load = () => {
      void listMySupportTickets().then((rows) => {
        if (!cancel) setTickets(rows);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, [enabled]);
  return tickets;
}

/** v25: the signed-out visitor's password-recovery chat (kept by a private key in this browser). */
function useGuestTicket(enabled: boolean) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  useEffect(() => {
    if (!enabled) {
      setTicket(null);
      return;
    }
    let cancel = false;
    const load = () => {
      void getGuestTicket().then((row) => {
        if (!cancel) setTicket(row);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, [enabled]);
  return [ticket, setTicket] as const;
}

/* ============================ v26: chat photos ============================ */

/** Target: longest side ≤ 1000 px, WebP (JPEG fallback) q 0.78, and under ~120 KB. */
const PHOTO_MAX_SIDE = 1000;
const PHOTO_MAX_CHARS = 160_000; // ≈ 120 KB once base64-decoded

/** Client-side compression on a <canvas>, so the upload is tiny and instant. */
export async function compressChatImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 20 * 1024 * 1024) throw new Error("That photo is larger than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This photo could not be read."));
      element.src = url;
    });
    let scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    let quality = 0.78;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot prepare photos.");
    for (let attempt = 0; attempt < 7; attempt += 1) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#ffffff"; // transparent PNGs → white, never black
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let data = canvas.toDataURL("image/webp", quality);
      if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= PHOTO_MAX_CHARS) return data;
      quality = Math.max(0.45, quality - 0.1);
      scale *= 0.85;
    }
    throw new Error("This photo is too detailed to send — try a screenshot instead.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Camera / gallery picker used by the user, guest and admin composers. */
export function AttachPhotoButton({ onPicked, disabled }: { onPicked: (dataUrl: string) => void; disabled?: boolean }) {
  const { language } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const label = language === "ar" ? "إرفاق صورة" : "Attach photo";
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setWorking(true);
          try {
            onPicked(await compressChatImage(file));
          } catch (caught) {
            toast.error(caught instanceof Error ? caught.message : label);
          } finally {
            setWorking(false);
          }
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={disabled || working}
        aria-label={label}
        title={label}
        className="attach-btn grid size-11 shrink-0 place-items-center rounded-2xl disabled:opacity-50"
      >
        <Camera className={`size-[18px] ${working ? "animate-pulse" : ""}`} strokeWidth={1.75} />
      </button>
    </>
  );
}

/** Thumbnail of the photo waiting to be sent, with a remove control. */
export function PendingPhoto({ src, onRemove }: { src: string; onRemove: () => void }) {
  const { language } = useI18n();
  return (
    <div className="pending-photo relative mb-2 inline-flex rounded-[18px] p-1">
      <img src={src} alt="" className="h-20 w-auto max-w-[9rem] rounded-[14px] object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label={language === "ar" ? "إزالة الصورة" : "Remove photo"}
        className="absolute -top-2 -end-2 grid size-7 place-items-center rounded-full bg-slate-900 text-white shadow-md ring-2 ring-white dark:ring-slate-900"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** A photo inside a chat bubble: fetched privately, tap to open the inspector. */
export function ChatPhoto({ imageId, onOpen }: { imageId: string; onOpen: (src: string) => void }) {
  const { language } = useI18n();
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadSupportImage(imageId).then((value) => {
      if (alive) setSrc(value);
    });
    return () => {
      alive = false;
    };
  }, [imageId]);
  if (src === undefined) return <span className="chat-photo-skeleton block h-40 w-48 max-w-full animate-pulse rounded-[14px]" aria-hidden />;
  if (src === null) {
    return (
      <span className="flex items-center gap-1.5 rounded-[14px] bg-black/10 px-3 py-2 text-xs font-semibold">
        <ImageOff className="size-4" strokeWidth={1.75} />
        {language === "ar" ? "تعذّر تحميل الصورة" : "Photo unavailable"}
      </span>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(src)} className="block overflow-hidden rounded-[14px]" aria-label={language === "ar" ? "فتح الصورة" : "Open photo"}>
      <img src={src} alt="" className="block max-h-64 w-auto max-w-full rounded-[14px] object-contain" loading="lazy" />
    </button>
  );
}

/** Full-screen, zoomable photo inspector (tap or the zoom button to zoom at that point; Esc closes). */
export function PhotoLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const { language } = useI18n();
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-lenis-prevent className="fixed inset-0 z-[170] flex flex-col bg-slate-950/92" role="dialog" aria-modal="true" aria-label={language === "ar" ? "معاينة الصورة" : "Photo preview"}>
      <div className="flex items-center justify-end gap-2 p-3">
        <button type="button" onClick={() => setZoom((value) => !value)} className="grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label={zoom ? "Zoom out" : "Zoom in"}>
          {zoom ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
        </button>
        <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label={language === "ar" ? "إغلاق" : "Close"}>
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4" onClick={(event) => event.target === event.currentTarget && onClose()}>
        <img
          src={src}
          alt=""
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setOrigin(`${((event.clientX - box.left) / box.width) * 100}% ${((event.clientY - box.top) / box.height) * 100}%`);
            setZoom((value) => !value);
          }}
          style={{ transform: zoom ? "scale(2.4)" : "scale(1)", transformOrigin: origin }}
          className={`max-h-full max-w-full rounded-[14px] object-contain transition-transform duration-200 ease-out ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        />
      </div>
    </div>,
    document.body,
  );
}

/** One chat bubble (shared by the signed-in chat, the guest recovery chat and the admin inbox). */
export function Bubble({ message, language, team, mineSender = "USER", onPhoto }: { message: SupportMessage; language: "ar" | "en"; team: string; mineSender?: "USER" | "ADMIN"; onPhoto: (src: string) => void }) {
  const mine = message.sender === mineSender;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${mine ? "bubble-mine rounded-ee-md" : message.isAutoReply ? "bubble-auto rounded-es-md" : "bubble-theirs rounded-es-md"}`}>
        {message.isAutoReply ? (
          <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-sky-700 dark:text-sky-300">
            <Zap className="size-3.5" strokeWidth={1.75} />
            {language === "ar" ? "رد تلقائي" : "Auto-reply"}
          </span>
        ) : null}
        {!mine ? <p className="mb-0.5 text-[11px] font-bold text-emerald-500">{team}</p> : null}
        {message.imageId ? (
          <div className={message.text ? "mb-1.5" : ""}>
            <ChatPhoto imageId={message.imageId} onOpen={onPhoto} />
          </div>
        ) : null}
        {message.text ? <p className="break-words whitespace-pre-wrap">{message.text}</p> : null}
        <p className={`mt-1 text-[10px] ${mine ? "text-white/75" : "text-muted"}`} dir="ltr">
          {formatStamp(message.createdAt, language)}
        </p>
      </div>
    </div>
  );
}

/** Number of tickets with an admin reply the user has not opened yet (for the navbar dot). */
export function useSupportUnread(): number {
  const { profile } = useProfileState();
  const tickets = useMyTickets(Boolean(profile && profile.role !== "ADMIN"));
  return tickets.filter((ticket) => ticket.unreadByUser).length;
}

export function statusLabel(t: ReturnType<typeof useI18n>["t"], status: SupportTicket["status"]): string {
  return status === "ANSWERED" ? t.statusAnswered : status === "CLOSED" ? t.statusClosed : t.statusOpen;
}

export function statusTone(status: SupportTicket["status"]): string {
  return status === "ANSWERED"
    ? "bg-emerald-500/15 text-emerald-500"
    : status === "CLOSED"
      ? "bg-slate-500/15 text-muted"
      : "bg-amber-500/15 text-amber-500";
}

export function formatStamp(iso: string, language: "ar" | "en"): string {
  return new Date(iso).toLocaleString(language === "ar" ? "ar-SY-u-nu-latn" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Desktop floating entry point + the Support Center itself. Mobile opens it from the menu / header icon. */
export function SupportPill() {
  const { t } = useI18n();
  const open = useNovaUi((state) => state.supportOpen);
  const setOpen = useNovaUi((state) => state.setSupportOpen);
  const unread = useSupportUnread();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="glass pointer-events-auto fixed end-5 bottom-5 z-40 hidden min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg md:flex"
      >
        <Headset className="size-4 text-[#1e3a8a]" />
        {t.supportTitle}
        {unread > 0 ? (
          <span className="keep-white grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{unread}</span>
        ) : null}
      </button>
      {open ? <SupportCenter onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SupportCenter({ onClose }: { onClose: () => void }) {
  const { t, language } = useI18n();
  const { profile, ready } = useProfileState();
  const tickets = useMyTickets(Boolean(profile));
  const [guestTicket, setGuestTicket] = useGuestTicket(ready && !profile);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newSubject, setNewSubject] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const replies = REPLIES[language];
  const topics = [t.topicShamcash, t.topicGameDelay, t.topicVip, t.topicOther];

  // Default to the most recent conversation unless the user is starting a new one.
  const liveTickets = useMemo(() => tickets.filter((ticket) => ticket.status !== "CLOSED"), [tickets]);
  const selected = useMemo(() => {
    if (newSubject !== null) return null;
    return liveTickets.find((ticket) => ticket.id === selectedId) ?? liveTickets[0] ?? null;
  }, [liveTickets, selectedId, newSubject]);
  // Stage 1 (help hub) until the user starts a chat or already has an open ticket.
  const inChat = Boolean(selected) || newSubject !== null || Boolean(!profile && guestTicket);
  const headerTicket = selected ?? (!profile ? guestTicket : null);
  const [hubOpen, setHubOpen] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  async function endChat() {
    if (!profile && guestTicket) {
      setEnding(true);
      await endGuestTicket();
      setEnding(false);
      setGuestTicket(null);
      return;
    }
    if (!selected) return;
    setEnding(true);
    const result = await closeMyTicket({ ticketId: selected.id });
    setEnding(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSelectedId(null);
    setNewSubject(null);
  }

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (selected?.unreadByUser) void markSupportRead({ ticketId: selected.id });
  }, [selected?.id, selected?.unreadByUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [selected?.id, selected?.messages.length, guestTicket?.messages.length]);

  async function send() {
    const text = draft.trim();
    if ((!text && !pendingPhoto) || busy) return;
    setBusy(true);
    try {
      // The photo goes to private server storage first; the message only carries its id.
      let imageId: string | undefined;
      if (pendingPhoto) {
        const uploaded = await uploadSupportImage(pendingPhoto, !profile ? guestTicket?.id : selected?.id);
        if (!uploaded.ok) {
          toast.error(uploaded.error);
          return;
        }
        imageId = uploaded.id;
      }
      if (!profile && guestTicket) {
        const result = await sendGuestSupportMessage(text, imageId);
        if (!result.ok) {
          toast.error(result.error);
          setGuestTicket(null);
          return;
        }
        setDraft("");
        setPendingPhoto(null);
        setGuestTicket(result.ticket);
        return;
      }
      const result = await sendSupportMessage({
        text,
        imageId,
        language: language === "en" ? "en" : "ar",
        ticketId: selected?.id,
        subject: selected ? undefined : (newSubject ?? t.topicOther),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDraft("");
      setPendingPhoto(null);
      setNewSubject(null);
      setSelectedId(result.ticket.id);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  const composing = profile && (selected || newSubject !== null);
  const composer = (
    <div className="border-t border-white/10 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-4">
      {pendingPhoto ? <PendingPhoto src={pendingPhoto} onRemove={() => setPendingPhoto(null)} /> : null}
      <div className="flex items-end gap-2">
        <AttachPhotoButton onPicked={setPendingPhoto} disabled={busy} />
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={1000}
          placeholder={t.messagePh}
          aria-label={t.messagePh}
          className="field max-h-32 min-h-11 flex-1 resize-none"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || (!draft.trim() && !pendingPhoto)}
          aria-label={t.send}
          className="btn-glow keep-white grid size-11 shrink-0 place-items-center rounded-2xl text-white disabled:opacity-50"
        >
          <Send className="size-4 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div data-lenis-prevent className="fixed inset-0 z-[95] flex items-stretch justify-center bg-slate-950/50 backdrop-blur-sm md:items-center md:p-6" role="presentation">
      <button type="button" aria-label={t.close} className="absolute inset-0 hidden cursor-default md:block" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-title"
        className="modal-pop relative flex h-full w-full flex-col overflow-hidden bg-[var(--nc-card-solid)] md:h-[min(86vh,46rem)] md:max-w-2xl md:rounded-3xl md:border md:border-white/10 md:shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-start gap-3 border-b border-white/10 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 sm:px-5">
          <span className="keep-white grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white">
            <MessageCircle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="support-title" className="font-display text-lg font-extrabold">
              {inChat ? (language === "ar" ? "الدعم المباشر" : "Live support") : language === "ar" ? "مركز المساعدة الذكي" : "Help & Quick Answers"}
            </h2>
            {headerTicket ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="ticket-badge price-num rounded-lg px-2 py-0.5 text-[11px]" dir="ltr">
                  #{headerTicket.ticketNumber}
                </span>
                {headerTicket.subject}
              </p>
            ) : (
              <p className="text-xs text-muted">{t.supportSub}</p>
            )}
          </div>
          {headerTicket ? (
            <button
              type="button"
              disabled={ending}
              onClick={() => void endChat()}
              className="min-h-[40px] shrink-0 rounded-xl border border-rose-300/50 px-3 text-xs font-bold text-rose-600 disabled:opacity-60"
            >
              {language === "ar" ? "إنهاء المحادثة" : "End chat"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl border border-white/10 hover:bg-white/5"
          >
            <X className="size-4" />
          </button>
        </header>

        {!ready ? (
          <div className="m-4 h-32 animate-pulse rounded-2xl bg-white/5" />
        ) : !profile && guestTicket ? (
          /* v25: guest password-recovery chat (no session needed) */
          <>
            <div ref={threadRef} className="support-thread flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              <p className="text-center text-[11px] font-semibold text-muted">
                {language === "ar" ? "محادثة استعادة الحساب — لست بحاجة لتسجيل الدخول" : "Account recovery chat — no sign-in needed"} · {formatStamp(guestTicket.createdAt, language)}
              </p>
              {guestTicket.messages.map((message) => (
                <Bubble key={message.id} message={message} language={language} team={t.supportTeam} onPhoto={setLightbox} />
              ))}
            </div>
            {composer}
          </>
        ) : !profile ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <p className="text-sm text-muted">{t.signInForSupport}</p>
            <Link
              to="/login"
              search={{ tab: undefined }}
              onClick={onClose}
              className="btn-glow keep-white mt-3 inline-flex min-h-11 items-center rounded-2xl px-5 text-sm font-bold text-white"
            >
              {t.signIn}
            </Link>
            <FaqList replies={replies} openIndex={faqOpen} setOpenIndex={setFaqOpen} title={t.quickAnswers} />
          </div>
        ) : !inChat ? (
          /* Stage 1: self-service hub */
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
            <ul className="grid gap-2">
              {HUB_FAQ[language === "ar" ? "ar" : "en"].map((item, index) => (
                <li key={item.q} className="hub-card rounded-[18px] p-1">
                  <button
                    type="button"
                    aria-expanded={hubOpen === index}
                    onClick={() => setHubOpen(hubOpen === index ? null : index)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] px-3 text-start text-sm font-bold"
                  >
                    {item.q}
                    <Plus className={`size-4 shrink-0 transition-transform ${hubOpen === index ? "rotate-45" : ""}`} strokeWidth={1.75} />
                  </button>
                  {hubOpen === index ? <p className="px-3 pt-1 pb-3 text-sm text-slate-700 dark:text-slate-200">{item.a}</p> : null}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setNewSubject(t.topicOther)}
              className="hub-cta keep-white mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white"
            >
              <MessageCircle className="size-4" strokeWidth={1.75} />
              {language === "ar" ? "التحدث مع الدعم المباشر" : "Start Live Support Chat"}
            </button>
          </div>
        ) : (
          <>
            {/* Topics + conversations */}
            <div className="space-y-2 border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label={t.newConversation}>
                {topics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => {
                      setNewSubject(topic);
                      setSelectedId(null);
                    }}
                    className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold ${newSubject === topic ? "border-[#0284c7] bg-[#0284c7]/10 text-fg" : "border-white/10 bg-white/5 text-muted"}`}
                  >
                    <Plus className="size-3" />
                    {topic}
                  </button>
                ))}
              </div>
              {liveTickets.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {liveTickets.map((ticket) => {
                    const active = selected?.id === ticket.id;
                    return (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(ticket.id);
                          setNewSubject(null);
                        }}
                        className={`relative inline-flex min-h-9 max-w-[14rem] shrink-0 items-center gap-2 rounded-xl border px-3 text-xs ${active ? "border-indigo-400/60 bg-indigo-500/10" : "border-white/10 bg-white/5"}`}
                      >
                        <span className="truncate font-semibold">{ticket.subject}</span>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusTone(ticket.status)}`}>{statusLabel(t, ticket.status)}</span>
                        {ticket.unreadByUser ? <span className="absolute -end-1 -top-1 size-2.5 rounded-full bg-rose-500 ring-2 ring-[var(--nc-card-solid)]" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {/* Thread */}
            <div ref={threadRef} className="support-thread flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
              {selected ? (
                <>
                  <p className="text-center text-[11px] font-semibold text-muted">
                    {selected.subject} · {formatStamp(selected.createdAt, language)}
                  </p>
                  {selected.messages.map((message) => (
                    <Bubble key={message.id} message={message} language={language} team={t.supportTeam} onPhoto={setLightbox} />
                  ))}
                </>
              ) : newSubject !== null ? (
                <div className="grid h-full place-items-center text-center">
                  <div>
                    <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#0284c7]/10 text-[#1e3a8a]">
                      <MessageCircle className="size-6" />
                    </span>
                    <p className="mt-2 text-sm font-semibold">{newSubject}</p>
                    <p className="text-xs text-muted">{t.messagePh}</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-center text-sm font-semibold text-muted">{t.chooseTopic}</p>
                  <FaqList replies={replies} openIndex={faqOpen} setOpenIndex={setFaqOpen} title={t.quickAnswers} />
                </div>
              )}
            </div>

            {/* Composer */}
            {composing ? composer : null}
          </>
        )}
      </section>
      {lightbox ? <PhotoLightbox src={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>,
    document.body,
  );
}

function FaqList({
  replies,
  openIndex,
  setOpenIndex,
  title,
}: {
  replies: ReadonlyArray<{ q: string; a: string }>;
  openIndex: number | null;
  setOpenIndex: (value: number | null) => void;
  title: string;
}) {
  return (
    <div className="mt-5">
      <p className="text-xs font-bold tracking-[0.12em] text-muted uppercase">{title}</p>
      <ul className="mt-2 grid gap-2">
        {replies.map((item, index) => (
          <li key={item.q} className="rounded-2xl border border-white/10 bg-white/5">
            <button
              type="button"
              aria-expanded={openIndex === index}
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start text-sm font-semibold"
            >
              {item.q}
              <Plus className={`size-4 shrink-0 transition-transform ${openIndex === index ? "rotate-45" : ""}`} />
            </button>
            {openIndex === index ? <p className="px-3 pb-3 text-sm text-muted">{item.a}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
