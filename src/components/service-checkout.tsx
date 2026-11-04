"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/nav";
import { X } from "lucide-react";
import { toast } from "sonner";

import { ActionLoadingOverlay, withMinDelay } from "@/components/action-loading-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { VipMarginPicker, sellingPrice } from "@/components/vip-margin";
import { ServiceMark } from "@/components/service-mark";
import { useProfileState } from "@/components/profile";
import { categoryName, orderStatusText, serviceText, targetText, useI18n, useMoney } from "@/lib/i18n";
import { CHARGE_COOLDOWN_MS, getPublicService, getViewerService, purchase } from "@/lib/store/api";
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
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const margin = profile?.role === "VIP" ? profile.vipProfitMargin : null;

  // Live 15 s countdown after every charge attempt.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= cooldownUntil) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);
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
    if (cooldownLeft > 0) return;
    setFormError(null);
    setBusy(true);
    const startedAt = Date.now();
    try {
      const result = await withMinDelay(purchase({ packageId: buying.id, targetId }));
      setCooldownUntil(startedAt + CHARGE_COOLDOWN_MS);
      setNow(Date.now());
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
    <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      {/* Compact header bar: keeps the charge options in view without scrolling. */}
      <section className="hero-surface nova-grid-border nova-live relative overflow-hidden rounded-2xl p-3 sm:rounded-3xl sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-aura shrink-0">
            <ServiceMark slug={service.slug} category={service.category} name={copy.name} imageUrl={service.imageUrl} size="compact" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="item-name min-w-0 truncate text-lg font-bold sm:text-2xl">{copy.name}</h1>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500 sm:text-xs">
                {t.instantTopup}
              </span>
              {vip ? (
                <span className="shrink-0 rounded-full border border-amber-200/50 bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-amber-100">
                  VIP
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted sm:text-sm">
              <span>{categoryName(t, service.category)}</span>
              <span aria-hidden>·</span>
              <span>{t.from}</span>
              <span className="price-num text-sm text-fg sm:text-base">{money(service.startingPriceCents, service.currency)}</span>
            </p>
          </div>
        </div>
        {service.instructions ? (
          <details className="mt-2 text-xs text-muted sm:text-sm">
            <summary className="cursor-pointer select-none font-semibold">{copy.description || t.chargeSizes}</summary>
            <p className="mt-1.5">{service.instructions}</p>
          </details>
        ) : null}
      </section>

      {receipt ? (
        <p className="glass mt-3 rounded-2xl px-4 py-3 text-sm">
          #<span className="font-semibold">{receipt.ref}</span> {t.orderIs} {orderStatusText(t, receipt.status)}. {t.walletNow}{" "}
          <span className="price-num">{profile ? money(profile.balanceCents, profile.currency) : t.updated}</span>.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold sm:text-xl">{t.chargeSizes}</h2>
        {!profile ? (
          <Link to="/login" search={{ tab: undefined }} className="text-sm font-semibold text-violet">
            {t.signInToBuy}
          </Link>
        ) : null}
      </div>

      {cooldownLeft > 0 ? (
        <p className="mt-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-600 tabular-nums" role="status">
          {t.cooldown} · {t.cooldownWait.replace("{n}", String(cooldownLeft))}
        </p>
      ) : null}
      <div className="mt-2">
        <VipMarginPicker compact />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {service.packages.map((pack) => {
          const short = profile ? profile.balanceCents < pack.priceCents : false;
          const selected = buying?.id === pack.id;
          const open = () => {
            if (!profile || cooldownLeft > 0) return;
            setBuying(pack);
            setFormError(null);
            setTargetId("");
          };
          const body = (
            <>
              <span className="item-name line-clamp-2 text-sm font-bold sm:text-base">{pack.sizeName}</span>
              {margin !== null ? (
                <span className="mt-1.5 grid gap-0.5 text-[11px] sm:text-xs">
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="text-muted">{t.vipCost}</span>
                    <span className="price-num">{money(pack.priceCents, service.currency)}</span>
                  </span>
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="text-muted">+{margin}%</span>
                    <span className="price-num">{money(sellingPrice(pack.priceCents, margin), service.currency)}</span>
                  </span>
                  <span className="mt-0.5 w-fit rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500" dir="ltr">
                    +{money(sellingPrice(pack.priceCents, margin) - pack.priceCents, service.currency)} {t.profit}
                  </span>
                </span>
              ) : (
                <span className="price-capsule mt-2">
                  <span className="price-num text-sm sm:text-base">{money(pack.priceCents, service.currency)}</span>
                </span>
              )}
              {short ? <span className="mt-1 text-[10px] font-semibold text-rose-500">{t.needTopUp}</span> : null}
            </>
          );
          const classes = `pack-pill nova-card relative flex min-h-[5.5rem] min-w-0 flex-col items-start rounded-2xl p-2.5 text-start transition sm:p-3.5 ${selected ? "is-selected" : ""}`;
          return profile ? (
            <button key={pack.id} type="button" onClick={open} disabled={cooldownLeft > 0} aria-pressed={selected} className={`${classes} disabled:opacity-60`}>
              {body}
            </button>
          ) : (
            <Link key={pack.id} to="/login" search={{ tab: undefined }} className={classes}>
              {body}
            </Link>
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
              disabled={busy || cooldownLeft > 0}
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
              {cooldownLeft > 0
                ? `${t.cooldown} ${t.cooldownWait.replace("{n}", String(cooldownLeft))}`
                : language === "ar"
                  ? "مراجعة الطلب"
                  : "Review order"}
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(buying && confirming)}
        busy={busy || cooldownLeft > 0}
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
      <ActionLoadingOverlay action={busy ? "purchase" : null} />
    </main>
  );
}
