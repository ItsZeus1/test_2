import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { useProfileState } from "@/components/profile";
import { requestBalance, topUpSelf, topUpUser } from "@/lib/store/api";
import { dollarsToCents, formatUsd } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";

const PACKS = [
  { cents: 1000, label: "$10" },
  { cents: 2500, label: "$25" },
  { cents: 5000, label: "$50" },
  { cents: 10000, label: "$100" },
  { cents: 25000, label: "$250" },
] as const;

export function TopUpModal() {
  const topUp = useNovaUi((state) => state.topUp);
  const closeTopUp = useNovaUi((state) => state.closeTopUp);
  const { setProfile } = useProfileState();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!topUp) return null;

  async function buyPack(cents: (typeof PACKS)[number]["cents"]) {
    setBusy(true);
    setError(null);
    try {
      const result = await topUpSelf({ cents });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProfile(result.profile);
      toast.success(`Wallet is now ${formatUsd(result.profile.balanceCents)}`);
      closeTopUp();
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest() {
    const cents = dollarsToCents(custom);
    if (cents == null) {
      setError("Enter a dollar amount like 20.00");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await requestBalance({ cents, note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Balance request sent");
      setCustom("");
      setNote("");
      closeTopUp();
    } finally {
      setBusy(false);
    }
  }

  async function creditUser() {
    if (topUp?.mode !== "user") return;
    const cents = dollarsToCents(custom);
    if (cents == null || cents < 100) {
      setError("Enter at least $1.00");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await topUpUser({ userId: topUp.userId, cents });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Added ${formatUsd(cents)} to ${topUp.name}`);
      setCustom("");
      closeTopUp();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-4 backdrop-blur-md sm:place-items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        className="glass relative w-full max-w-lg overflow-hidden rounded-[1.75rem] border border-fuchsia/30 p-5 shadow-[0_0_48px_-14px_rgba(232,121,249,0.85)] sm:p-6"
      >
        <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.55),transparent_70%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] text-fuchsia uppercase">Wallet</p>
            <h2 id="topup-title" className="font-display text-3xl font-extrabold">
              <span className="text-gradient">{topUp.mode === "self" ? "Top up" : `Credit ${topUp.name}`}</span>
            </h2>
          </div>
          <button type="button" aria-label="Close" onClick={closeTopUp} className="grid size-11 place-items-center rounded-full border border-white/10">
            <X className="size-4" />
          </button>
        </div>

        {topUp.mode === "self" ? (
          <>
            <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PACKS.map((pack) => (
                <button
                  key={pack.cents}
                  type="button"
                  disabled={busy}
                  onClick={() => void buyPack(pack.cents)}
                  className="glass min-h-16 rounded-2xl text-lg font-extrabold hover:border-violet/70 hover:shadow-[0_0_22px_-8px_rgba(139,92,246,0.95)] disabled:opacity-60"
                >
                  {pack.label}
                </button>
              ))}
            </div>
            <p className="mt-5 text-xs font-bold tracking-[0.16em] text-muted uppercase">Or request a custom amount</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.2fr]">
              <input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="20.00" className="field" inputMode="decimal" />
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Note for admin" className="field" />
            </div>
            <button type="button" disabled={busy} onClick={() => void sendRequest()} className="mt-3 min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold">
              Request balance
            </button>
          </>
        ) : (
          <div className="relative mt-5">
            <label className="text-sm font-semibold" htmlFor="admin-credit">
              Dollars to add
            </label>
            <input id="admin-credit" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="25.00" className="field mt-2" inputMode="decimal" />
            <button type="button" disabled={busy} onClick={() => void creditUser()} className="btn-glow mt-4 min-h-12 w-full rounded-full text-sm font-semibold disabled:opacity-60">
              Add to balance
            </button>
          </div>
        )}
        {error ? <p className="relative mt-3 text-sm text-rose-200">{error}</p> : null}
      </div>
    </div>
  );
}
