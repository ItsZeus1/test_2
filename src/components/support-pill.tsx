import { useState } from "react";
import { Headset, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";

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

export function SupportPill() {
  const { language, t } = useI18n();
  const replies = REPLIES[language];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const reply = replies[active] ?? replies[0];

  return (
    <div className="pointer-events-none fixed end-0 bottom-4 z-30 flex w-full flex-col items-center gap-3 px-[2.5vw] sm:end-4 sm:w-auto sm:items-end sm:px-0">
      {open ? (
        <section
          className="glass pointer-events-auto w-[95vw] rounded-3xl p-4 sm:max-w-md"
          aria-label={language === "ar" ? "دعم NovaCharge" : "NovaCharge support"}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.16em] text-violet uppercase">
                {language === "ar" ? "مكتب نوفا" : "Nova Desk"}
              </p>
              <p className="text-sm text-muted">
                {language === "ar" ? "إجابات على مدار الساعة للطلبات والمعرفات وأسعار VIP." : "24/7 answers for orders, IDs, and VIP rates."}
              </p>
            </div>
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10"
              onClick={() => setOpen(false)}
              aria-label={t.close}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {replies.map((item, index) => (
              <button
                key={item.q}
                type="button"
                onClick={() => setActive(index)}
                className={`rounded-full border px-3 py-2 text-start text-xs ${
                  index === active ? "border-violet/70 bg-violet/20 text-white" : "border-white/10 text-muted hover:border-white/25"
                }`}
              >
                {item.q}
              </button>
            ))}
          </div>
          <p className="rounded-2xl bg-black/30 p-3 text-sm leading-relaxed text-pretty text-fg/90">{reply?.a}</p>
        </section>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="glass pointer-events-auto flex min-h-11 items-center gap-2 self-end rounded-full px-4 py-2 text-sm font-semibold"
      >
        <span className="relative grid size-2.5 place-items-center">
          <span className="pulse-dot absolute size-2.5 rounded-full bg-emerald-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
        </span>
        <Headset className="size-4 text-violet" />
        {language === "ar" ? "دعم مباشر ٢٤/٧" : "24/7 Live Support"}
      </button>
    </div>
  );
}
