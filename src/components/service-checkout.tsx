"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/nav";
import { X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { ServiceMark } from "@/components/service-mark";
import { useProfileState } from "@/components/profile";
import { categoryName, orderStatusText, serviceText, targetText, useI18n, useMoney } from "@/lib/i18n";
import { getPublicService, getViewerService, purchase } from "@/lib/store/api";
import { useNovaUi } from "@/lib/ui-store";
import { type PublicPackage, type ServiceDetail } from "@/lib/store/types";

export function ServiceCheckout({ slug }: { slug: string }) {
  const { language, t } = useI18n();
  const money = useMoney();
  const previewCurrency = useNovaUi((state) => state.previewCurrency);
  const navigate = useNavigate();
  const { profile, setProfile } = useProfileState();
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<PublicPackage | null>(null);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ ref: string; status: string } | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    void (async () => {
      try {
        const detail = profile ? await getViewerService({ slug }) : await getPublicService({ slug, currency: previewCurrency });
        if (cancel) return;
        setService(detail);
        setError(detail ? null : t.notInCatalog);
      } catch (caught) {
        if (!cancel) setError(caught instanceof Error ? caught.message : t.loadError);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [slug, profile?.role, profile?.userId, previewCurrency]);

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
        setConfirming(false);
        return;
      }
      setProfile(result.profile);
      setReceipt({ ref: result.order.fulfillmentRef, status: result.order.status });
      setConfirming(false);
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
        <h1 className="font-display text-3xl font-extrabold">{t.slugMissing}</h1>
        <p className="mt-3 text-muted">{error}</p>
        <Link to="/" search={{ browse: true }} className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-violet">
          {t.backCatalog}
        </Link>
      </main>
    );
  }

  const vip = service.rate === "vip";
  const copy = serviceText(language, service);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-12 lg:px-8">
      <section className="hero-surface nova-grid-border nova-live relative overflow-hidden rounded-[2rem] p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <ServiceMark slug={service.slug} category={service.category} name={copy.name} imageUrl={service.imageUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.2em] text-fuchsia uppercase">{categoryName(t, service.category)}</p>
            <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight break-words sm:text-4xl">
              <span className="text-gradient">{copy.name}</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted">{copy.description}</p>
            <p className="mt-4 text-sm">
              {t.from} <span className="font-display text-2xl font-extrabold tabular-nums">{money(service.startingPriceCents, service.currency)}</span>
              {vip ? (
                <span className="ms-2 rounded-full border border-amber-200/50 bg-amber-300/15 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-amber-100">
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
          #<span className="font-semibold">{receipt.ref}</span> {t.orderIs} {orderStatusText(t, receipt.status)}. {t.walletNow}{" "}
          <span className="font-semibold tabular-nums">{profile ? money(profile.balanceCents, profile.currency) : t.updated}</span>.
        </p>
      ) : null}

      <h2 className="mt-8 font-display text-2xl font-extrabold">{t.chargeSizes}</h2>
      <div className="mt-4 grid gap-3">
        {service.packages.map((pack) => {
          const short = profile ? profile.balanceCents < pack.priceCents : false;
          return (
            <div key={pack.id} className="nova-grid-border glass flex min-w-0 flex-col gap-3 rounded-3xl p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-extrabold">{pack.sizeName}</p>
                <p className="mt-1 text-sm">
                  <span className="tabular-nums font-semibold">{money(pack.priceCents, service.currency)}</span>
                  {pack.rate === "vip" ? (
                    <span className="ms-2 rounded-full border border-amber-200/40 bg-amber-300/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-amber-100">
                      VIP
                    </span>
                  ) : null}
                  {short ? <span className="ms-2 text-xs text-rose-200">{t.needTopUp}</span> : null}
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
                  {t.purchase}
                </button>
              ) : (
                <Link
                  to="/login"
                  search={{ tab: undefined }}
                  className="btn-glow inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
                >
                  {t.signInToBuy}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {buying ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-md sm:p-6" role="presentation">
          <button type="button" aria-label={t.close} className="absolute inset-0 cursor-default" onClick={() => setBuying(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="buy-title"
            className="nova-grid-border glass modal-pop relative my-auto max-h-[88vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-[0.18em] text-violet uppercase">{copy.name}</p>
                <h3 id="buy-title" className="font-display text-2xl font-extrabold">
                  {buying.sizeName}
                </h3>
                <p className="mt-1 text-sm tabular-nums">
                  {money(buying.priceCents, service.currency)}
                  {buying.rate === "vip" ? <span className="ms-2 text-amber-100">VIP</span> : null}
                </p>
              </div>
              <button type="button" aria-label={t.close} onClick={() => setBuying(null)} className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl border border-white/10 hover:bg-white/5">
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-4 block text-sm font-semibold" htmlFor="target-id">
              {targetText(t, service.category)}
            </label>
            <input
              id="target-id"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              placeholder={targetText(t, service.category)}
              dir="ltr"
              className="field mt-2"
              autoComplete="off"
            />
            {formError ? <p className="mt-3 text-sm text-rose-200">{formError}</p> : null}
            {profile && profile.balanceCents < buying.priceCents ? (
              <button type="button" onClick={openSelfTopUp} className="mt-3 text-sm font-semibold text-fuchsia">
                {t.walletIs} {money(profile.balanceCents, profile.currency)}. {t.topUpFirst}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (targetId.trim().length < 3) {
                  setFormError(targetText(t, service.category));
                  return;
                }
                setFormError(null);
                setConfirming(true);
              }}
              className="btn-glow mt-5 min-h-12 w-full rounded-full text-sm font-semibold disabled:opacity-60"
            >
              {language === "ar" ? "مراجعة الطلب" : "Review order"}
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(buying && confirming)}
        busy={busy}
        title={language === "ar" ? "تأكيد الشراء" : "Confirm Purchase"}
        confirmLabel={language === "ar" ? "تأكيد الشراء" : "Confirm Purchase"}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmPurchase()}
      >
        {buying ? (
          <dl className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-start">
            <div className="flex items-center justify-between gap-3">
              <dt>{language === "ar" ? "الباقة" : "Package"}</dt>
              <dd className="truncate font-semibold text-fg">
                {copy.name} · {buying.sizeName}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>{targetText(t, service.category)}</dt>
              <dd className="truncate font-semibold text-fg" dir="ltr">
                {targetId.trim()}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
              <dt>{language === "ar" ? "الإجمالي" : "Total"}</dt>
              <dd className="font-display text-lg font-extrabold text-fg tabular-nums">{money(buying.priceCents, service.currency)}</dd>
            </div>
          </dl>
        ) : null}
      </ConfirmDialog>
    </main>
  );
}
