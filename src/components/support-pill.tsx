import { useState } from "react";
import { Headset, X } from "lucide-react";

const REPLIES: { q: string; a: string }[] = [
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
    a: "VIP and admin accounts see the VIP price only, tagged VIP Special Rate. Normal accounts see the standard price. An admin can switch your role from the control center.",
  },
  {
    q: "How do I add wallet credit?",
    a: "Use + Top Up on the balance pill. Credits land in your NovaCharge wallet immediately, then get spent when you purchase a package.",
  },
];

export function SupportPill() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const reply = REPLIES[active] ?? REPLIES[0];

  return (
    <div className="fixed right-4 bottom-4 z-30 flex flex-col items-end gap-3">
      {open ? (
        <section className="glass w-[min(100vw-2rem,22rem)] rounded-3xl p-4" aria-label="NovaCharge support">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-violet uppercase">Nova Desk</p>
              <p className="text-sm text-muted">24/7 answers for orders, IDs, and VIP rates.</p>
            </div>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-full border border-white/10"
              onClick={() => setOpen(false)}
              aria-label="Close support"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {REPLIES.map((item, index) => (
              <button
                key={item.q}
                type="button"
                onClick={() => setActive(index)}
                className={`rounded-full border px-3 py-2 text-left text-xs ${
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
        className="glass flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
      >
        <span className="relative grid size-2.5 place-items-center">
          <span className="pulse-dot absolute size-2.5 rounded-full bg-emerald-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
        </span>
        <Headset className="size-4 text-violet" />
        24/7 Live Support
      </button>
    </div>
  );
}
