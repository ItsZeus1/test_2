import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { useProfileState } from "@/components/profile";
import { getPublicService, getViewerService, purchase } from "@/lib/store/api";
import { formatUsd } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";
import { categoryLabel, type PublicPackage, type ServiceDetail } from "@/lib/store/types";

export function ServiceCheckout({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const { profile, setProfile } = useProfileState();
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<PublicPackage | null>(null);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ ref: string; status: string } | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void (async () => {
      try {
        const detail = profile ? await getViewerService({ slug }) : await getPublicService({ slug });
        if (cancel) return;
        setService(detail);
        setError(detail ? null : "That slug is not in the catalog.");
      } catch (caught) {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Could not load this service.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [slug, profile?.role, profile?.userId]);

  async function confirmPurchase() {
    if (!buying) return;
    if (!profile) {
      await navigate({ to: "/login", search: { tab: undefined } });
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      const result = await purchase({ packageId: buying.id, targetId });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setProfile(result.profile);
      setReceipt({ ref: result.order.fulfillmentRef, status: result.order.status });
      setBuying(null);
      setTargetId("");
      toast.success(`${result.order.serviceName} · ${result.order.packageName}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <div className="h-64 animate-pulse rounded-[2rem] bg-white/5" />
      </main>
    );
  }

  if (!service) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-extrabold">Slug missing</h1>
        <p className="mt-3 text-muted">{error}</p>
        <Link to="/" search={{ browse: true }} className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-violet">
          Back to the catalog
        </Link>
      </main>
    );
  }

  const vip = service.rate === "vip";

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_0%_0%,rgba(139,92,246,0.45),transparent_42%),radial-gradient(circle_at_100%_20%,rgba(232,121,249,0.28),transparent_40%),linear-gradient(160deg,#12081c,#07080d)] p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <ServiceMark slug={service.slug} category={service.category} name={service.name} imageUrl={service.imageUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.2em] text-fuchsia uppercase">{categoryLabel(service.category)}</p>
            <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">
              <span className="text-gradient">{service.name}</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted">{service.description}</p>
            <p className="mt-4 text-sm">
              From <span className="font-display text-2xl font-extrabold tabular-nums">{formatUsd(service.startingPriceCents)}</span>
              {vip ? (
                <span className="ml-2 rounded-full border border-amber-200/50 bg-amber-300/15 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-amber-100">
                  VIP
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="glass mt-6 rounded-2xl px-4 py-3 text-sm text-muted">{service.instructions}</div>
      </section>

      {receipt ? (
        <p className="glass mt-4 rounded-2xl px-4 py-3 text-sm">
          Order <span className="font-semibold">{receipt.ref}</span> is {receipt.status}. Wallet is now{" "}
          <span className="font-semibold tabular-nums">{profile ? formatUsd(profile.balanceCents) : "updated"}</span>.
        </p>
      ) : null}

      <h2 className="mt-8 font-display text-2xl font-extrabold">Charge sizes</h2>
      <div className="mt-4 grid gap-3">
        {service.packages.map((pack) => {
          const short = profile ? profile.balanceCents < pack.priceCents : false;
          return (
            <div key={pack.id} className="glass flex flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-extrabold">{pack.sizeName}</p>
                <p className="mt-1 text-sm">
                  <span className="tabular-nums font-semibold">{formatUsd(pack.priceCents)}</span>
                  {pack.rate === "vip" ? (
                    <span className="ml-2 rounded-full border border-amber-200/40 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-amber-100">
                      VIP
                    </span>
                  ) : null}
                  {short ? <span className="ml-2 text-xs text-rose-200">Need a top-up</span> : null}
                </p>
              </div>
              {profile ? (
                <button
                  type="button"
                  onClick={() => {
                    setBuying(pack);
                    setFormError(null);
                    setTargetId("");
                  }}
                  className="btn-glow min-h-11 rounded-full px-5 text-sm font-semibold"
                >
                  Purchase
                </button>
              ) : (
                <Link
                  to="/login"
                  search={{ tab: undefined }}
                  className="btn-glow inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
                >
                  Sign in to buy
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {buying ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-4 backdrop-blur-md sm:place-items-center" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="buy-title"
            className="glass w-full max-w-md rounded-[1.75rem] border border-violet/30 p-5 shadow-[0_0_40px_-12px_rgba(139,92,246,0.9)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold tracking-[0.18em] text-violet uppercase">{service.name}</p>
                <h3 id="buy-title" className="font-display text-2xl font-extrabold">
                  {buying.sizeName}
                </h3>
                <p className="mt-1 text-sm tabular-nums">
                  {formatUsd(buying.priceCents)}
                  {buying.rate === "vip" ? <span className="ml-2 text-amber-100">VIP</span> : null}
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setBuying(null)} className="grid size-11 place-items-center rounded-full border border-white/10">
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-4 block text-sm font-semibold" htmlFor="target-id">
              {service.targetLabel}
            </label>
            <input
              id="target-id"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              placeholder={service.targetLabel}
              className="field mt-2"
              autoComplete="off"
            />
            {formError ? <p className="mt-3 text-sm text-rose-200">{formError}</p> : null}
            {profile && profile.balanceCents < buying.priceCents ? (
              <button type="button" onClick={openSelfTopUp} className="mt-3 text-sm font-semibold text-fuchsia">
                Wallet is {formatUsd(profile.balanceCents)}. Top up first.
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmPurchase()}
              className="btn-glow mt-5 min-h-12 w-full rounded-full text-sm font-semibold disabled:opacity-60"
            >
              {busy ? "Sending…" : "Confirm & deduct balance"}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
