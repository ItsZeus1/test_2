"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Crown, Zap } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert, Input, Label, Spinner } from "@/components/ui/primitives";
import { cn, formatMoney, gradientFor, initials } from "@/lib/utils";
import { purchaseAction } from "@/app/service/[slug]/actions";
import type { PublicPackage, Role } from "@/lib/types";

interface Receipt {
  orderId: string;
  amount: number;
  serviceName: string;
  sizeName: string;
}

export function ServiceTopup({
  name,
  imageUrl,
  description,
  packages,
  role,
  balance,
}: {
  name: string;
  imageUrl: string | null;
  description: string | null;
  packages: PublicPackage[];
  role: Role | "GUEST";
  balance: number;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [zone, setZone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const selected = packages.find((p) => p.id === selectedId) ?? null;
  const isVipRate = role === "VIP" || role === "ADMIN";

  function close() {
    setOpen(false);
    setError(null);
    if (receipt) {
      setReceipt(null);
      setTarget("");
      setZone("");
      setSelectedId(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError(null);
    const res = await purchaseAction({
      packageId: selected.id,
      targetAccountId: target,
      zoneId: zone || undefined,
    });
    setLoading(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setReceipt({ orderId: res.orderId, amount: res.amount, serviceName: res.serviceName, sizeName: res.sizeName });
    router.refresh(); // update the wallet pill
  }

  const steps = [
    "Choose the charge size you want below.",
    "Click Purchase and enter your Player / Account ID (and Zone ID if asked).",
    "Confirm — the amount is taken from your wallet and delivery starts instantly.",
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6">
      <div className="glass overflow-hidden rounded-2xl">
        <div
          className="flex h-40 items-end p-6 md:h-52"
          style={
            imageUrl
              ? { backgroundImage: `linear-gradient(to top, rgba(9,10,15,0.9), rgba(9,10,15,0.1)), url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: gradientFor(name) }
          }
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/20 bg-black/30 font-display text-xl font-bold backdrop-blur"
            >
              {initials(name)}
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold md:text-4xl">{name}</h1>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-mint/90 px-2 py-0.5 text-[11px] font-bold text-ink">
                <Zap className="h-3 w-3" /> Instant Delivery
              </span>
            </div>
          </div>
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-2">
          <p className="text-sm text-white/70">{description || `Top up ${name} instantly.`}</p>
          <ol className="space-y-2 text-sm text-muted">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet/30 text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <section aria-label="Charge sizes">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-medium">Select a package</h2>
          {isVipRate && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/60 bg-gold/15 px-2.5 py-0.5 text-xs font-bold text-gold shadow-gold">
              <Crown className="h-3 w-3" /> VIP Rate Applied
            </span>
          )}
        </div>

        {packages.length === 0 ? (
          <p className="text-muted">No packages available right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {packages.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                aria-pressed={selectedId === p.id}
                className={cn(
                  "rounded-xl border bg-panel p-4 text-left transition-all",
                  selectedId === p.id
                    ? "border-violet shadow-neon"
                    : "border-white/10 hover:border-white/30"
                )}
              >
                <div className="text-sm font-semibold">{p.size_name}</div>
                <div className="mt-3 font-display text-2xl font-bold text-mint font-tabular">
                  {formatMoney(p.price)}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {role === "GUEST" ? (
            <Link href="/login">
              <Button variant="glow" size="lg">
                Log in to purchase
              </Button>
            </Link>
          ) : (
            <Button variant="glow" size="lg" disabled={!selected} onClick={() => setOpen(true)}>
              {selected ? `Purchase · ${formatMoney(selected.price)}` : "Select a package"}
            </Button>
          )}
          {role !== "GUEST" && (
            <span className="text-sm text-muted">
              Wallet: <span className="font-tabular text-text">{formatMoney(balance)}</span>
            </span>
          )}
        </div>
      </section>

      {open && selected && (
        <Modal title={receipt ? "Order complete" : "Confirm purchase"} onClose={close}>
          {receipt ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-mint">
                <CheckCircle2 className="h-5 w-5" /> Delivery started
              </div>
              <dl className="space-y-2 rounded-xl border border-white/10 p-4 text-sm">
                <div className="flex justify-between"><dt className="text-muted">Service</dt><dd>{receipt.serviceName}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Package</dt><dd>{receipt.sizeName}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="font-tabular">{formatMoney(receipt.amount)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Order ID</dt><dd className="truncate font-mono text-xs">{receipt.orderId}</dd></div>
              </dl>
              <div className="flex gap-2">
                <Link href="/orders" className="flex-1">
                  <Button variant="secondary" className="w-full">View my orders</Button>
                </Link>
                <Button className="flex-1" onClick={close}>Done</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-white/10 p-3 text-sm">
                <span>{selected.size_name}</span>
                <span className="font-tabular font-semibold text-mint">{formatMoney(selected.price)}</span>
              </div>
              {error && <Alert>{error}</Alert>}
              {balance < selected.price && (
                <Alert tone="info">Your wallet ({formatMoney(balance)}) is below this price. Add balance first.</Alert>
              )}
              <div>
                <Label>Target Account / Player ID</Label>
                <Input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="e.g. 5123456789"
                  autoFocus
                  required
                />
              </div>
              <div>
                <Label>Zone / Server ID (optional)</Label>
                <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="e.g. 2001" />
              </div>
              <Button type="submit" variant="glow" size="lg" className="w-full" disabled={loading || balance < selected.price}>
                {loading && <Spinner />} {loading ? "Processing…" : `Pay ${formatMoney(selected.price)}`}
              </Button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
