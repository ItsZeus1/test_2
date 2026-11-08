"use client";

import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/nav";
import { ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";

import { useActionHud } from "@/components/action-loading-overlay";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReceiptBadge } from "@/components/receipt-badge";
import { VaultReveal } from "@/components/vault-reveal";
import { claimVault, getVaultStock, type RevealedPiece } from "@/lib/vault-client";
import { VipMarginPicker, sellingPrice } from "@/components/vip-margin";
import { ServiceMark } from "@/components/service-mark";
import { useProfileState } from "@/components/profile";
import { categoryName, orderStatusText, serviceText, targetText, useI18n, useMoney } from "@/lib/i18n";
import { CHARGE_COOLDOWN_MS, getPublicService, getSypRate, getViewerService, markVaultDelivered, purchase, setSavedPlayerId } from "@/lib/store/api";
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
  const hud = useActionHud();
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const margin = profile?.role === "VIP" ? profile.vipProfitMargin : null;
  const landline = service?.targetInputType === "LANDLINE_PHONE";
  const savedId = service && profile ? (profile.savedPlayerIds?.[service.slug] ?? "") : "";

  /** One saved ID per game: save the typed one, or pass null to remove. */
  async function saveId(value: string | null) {
    if (!service) return;
    setSavingId(true);
    try {
      const result = await setSavedPlayerId({ slug: service.slug, playerId: value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setProfile(result.profile);
      toast.success(value ? t.idSaved : t.idRemoved);
    } finally {
      setSavingId(false);
    }
  }

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
  const [savingId, setSavingId] = useState(false);
  const [points, setPoints] = useState(0);
  const [vaultStock, setVaultStock] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<RevealedPiece | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const mode = service?.serviceMode ?? "PACKAGES";
  const isVault = mode === "VAULT";
  const counter = service?.counter;
  const pointsValid = Boolean(counter && points >= counter.minPoints && points % counter.stepPoints === 0);
  const pointsTotal = counter ? Math.ceil((counter.pricePer100Cents * points) / 100) : 0;

  // Currency preview (display only — purchases are always charged in the account currency).
  const [viewCurrency, setViewCurrency] = useState<"USD" | "SYP" | null>(null);
  const [preview, setPreview] = useState<ServiceDetail | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const shownCurrency = viewCurrency ?? service?.currency ?? "USD";
  useEffect(() => {
    void getSypRate().then(setRate);
  }, []);
  useEffect(() => {
    if (!service || !viewCurrency || viewCurrency === service.currency) {
      setPreview(null);
      return;
    }
    let cancel = false;
    const request = profile ? getViewerService({ slug, currency: viewCurrency, preview: true }) : getPublicService({ slug, currency: viewCurrency });
    void request.then((detail) => {
      if (!cancel) setPreview(detail);
    });
    return () => {
      cancel = true;
    };
  }, [viewCurrency, service, slug, profile]);
  const shownPack = (id: string, fallback: number) => (preview ? (preview.packages.find((pack) => pack.id === id)?.priceCents ?? fallback) : fallback);
  const shownPer100 = preview?.counter?.pricePer100Cents ?? counter?.pricePer100Cents ?? 0;
  const shownPointsTotal = Math.ceil((shownPer100 * points) / 100);
  const shownCur = preview ? shownCurrency : (service?.currency ?? "USD");

  // Point counter starts at the minimum; vault shows live stock.
  useEffect(() => {
    if (counter && points === 0) setPoints(counter.minPoints);
  }, [counter, points]);
  useEffect(() => {
    if (!service || !isVault) return;
    let cancel = false;
    void getVaultStock(service.id).then((value) => {
      if (!cancel) setVaultStock(value);
    });
    return () => {
      cancel = true;
    };
  }, [service, isVault, receipt]);

  function snapPoints(value: number): number {
    if (!counter) return value;
    const stepped = Math.round(value / counter.stepPoints) * counter.stepPoints;
    return Math.max(counter.minPoints, Math.min(10_000_000, stepped));
  }

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
      const summary = `${service ? serviceText(language, service).name : ""} · ${buying.sizeName} · ${money(buying.priceCents, service?.currency ?? "USD")}`;
      const request = buying.id.startsWith("points:")
        ? purchase({ serviceId: service?.id, points: Number(buying.id.slice(7)), targetId })
        : purchase({ packageId: buying.id, targetId: isVault ? "" : targetId });
      const result = await hud.run("purchase", summary, request);
      setCooldownUntil(startedAt + CHARGE_COOLDOWN_MS);
      setNow(Date.now());
      if (!result.ok) {
        setFormError(result.error);
        setConfirming(false);
        return;
      }
      setProfile(result.profile);
      setReceipt({ ref: result.order.receiptNumber || result.order.fulfillmentRef, status: result.order.status });
      setConfirming(false);
      setBuying(null);
      setTargetId("");
      toast.success(`${result.order.serviceName} · ${result.order.packageName}`);
      if (result.order.status === "PENDING_VAULT") {
        setVaultError(null);
        const claimed = await claimVault(result.order.id);
        if (claimed.ok) {
          setRevealed({ ...claimed.item, receiptNumber: result.order.receiptNumber });
          void markVaultDelivered(result.order.id);
        } else {
          setVaultError(t.vaultFailed);
        }
      }
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
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-violet">
          {t.backCatalog}
        </Link>
      </main>
    );
  }

  const vip = service.rate === "vip";
  const copy = serviceText(language, service);

  return (
    <main className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-8 lg:px-8">
      <Link
        to="/"
        className="mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-sm font-semibold text-muted hover:text-fg"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {language === "ar" ? "العودة للمتجر" : "Back to Store"}
      </Link>

      {/* Compact header bar: keeps the charge options in view without scrolling. */}
      <section className="hero-surface nova-grid-border nova-live relative overflow-hidden rounded-2xl p-3 sm:rounded-3xl sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-aura shrink-0">
            <ServiceMark slug={service.slug} category={service.category} name={copy.name} imageUrl={service.imageUrl} size="compact" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="item-name min-w-0 truncate text-lg font-bold sm:text-2xl">{copy.name}</h1>
              {service.deliverySpeed === "MANUAL" ? (
                <span className="manual-badge inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold sm:text-xs">
                  {t.manualBadge}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500 sm:text-xs">
                  {t.instantTopup}
                </span>
              )}
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
        <p className="glass mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-2xl px-4 py-3 text-sm">
          <ReceiptBadge value={receipt.ref} /> {t.orderIs} {orderStatusText(t, receipt.status)}. {t.walletNow}{" "}
          <span className="price-num">{profile ? money(profile.balanceCents, profile.currency) : t.updated}</span>.
        </p>
      ) : null}

      {revealed ? <VaultReveal piece={revealed} /> : null}
      {vaultError ? <p className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-700">{vaultError}</p> : null}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold sm:text-xl">{mode === "POINT_COUNTER" ? t.chooseAmount : t.chargeSizes}</h2>
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
        <div className="currency-switch-box mb-3">
          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/5 p-1" role="group" aria-label={language === "ar" ? "عملة العرض" : "Display currency"}>
            {(["USD", "SYP"] as const).map((code) => {
              const on = shownCurrency === code;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setViewCurrency(code)}
                  className={`min-h-10 rounded-xl text-xs font-bold transition sm:text-sm ${on ? "keep-white bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow" : "text-muted"}`}
                >
                  {code === "USD" ? (language === "ar" ? "💵 دولار ($)" : "💵 USD ($)") : language === "ar" ? "🇸🇾 الليرة السورية (ل.س)" : "🇸🇾 Syrian pound (SYP)"}
                </button>
              );
            })}
          </div>
          {shownCurrency === "SYP" ? (
            <p className="rate-note mt-2 rounded-xl px-3 py-2 text-xs font-semibold" role="note">
              {language === "ar"
                ? `💡 علماً أن 1$ = ${rate ?? "…"} ل.س (حسب سعر الصرف المحدد لدينا)`
                : `💡 Note: $1 = ${rate ?? "…"} SYP (at our set exchange rate)`}
            </p>
          ) : null}
          {profile && preview ? (
            <p className="mt-1.5 text-[11px] text-muted">
              {language === "ar" ? "للعرض فقط — يتم الدفع بعملة حسابك." : "Preview only — you pay in your account currency."}
            </p>
          ) : null}
        </div>
        <VipMarginPicker compact />
      </div>

      {isVault ? (
        <p className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${vaultStock === 0 ? "bg-rose-500/12 text-rose-500" : "bg-emerald-500/12 text-emerald-600"}`}>
          {vaultStock === 0 ? t.vaultSoldOut : t.vaultInStock.replace("{n}", vaultStock == null ? "…" : String(vaultStock))}
        </p>
      ) : null}

      {mode === "POINT_COUNTER" && counter ? (
        <section className="counter-studio mt-3 rounded-3xl p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPoints((value) => snapPoints(value - counter.stepPoints))}
              disabled={points <= counter.minPoints}
              aria-label="-"
              className="counter-btn grid size-12 shrink-0 place-items-center rounded-2xl text-2xl font-bold disabled:opacity-40"
            >
              −
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t.points}</span>
              <input
                type="number"
                inputMode="numeric"
                min={counter.minPoints}
                step={counter.stepPoints}
                value={points || ""}
                onChange={(event) => setPoints(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                onBlur={() => setPoints((value) => snapPoints(value))}
                className="field price-num !min-h-12 text-center !text-2xl"
                dir="ltr"
              />
            </label>
            <button
              type="button"
              onClick={() => setPoints((value) => snapPoints(value + counter.stepPoints))}
              aria-label="+"
              className="counter-btn grid size-12 shrink-0 place-items-center rounded-2xl text-2xl font-bold"
            >
              +
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[100, 500, 1000, 5000]
              .filter((preset) => preset >= counter.minPoints && preset % counter.stepPoints === 0)
              .map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPoints(preset)}
                  aria-pressed={points === preset}
                  className={`price-num min-h-10 rounded-full px-4 text-sm ${points === preset ? "keep-white bg-indigo-600 text-white" : "border border-white/15 bg-white/5"}`}
                >
                  {preset.toLocaleString("en-US")}
                </button>
              ))}
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted">
                {money(shownPer100, shownCur)} {t.perHundred}
              </p>
              <p className="text-xs font-semibold text-muted">{t.pointsTotal}</p>
              <p className="price-num text-3xl">{money(shownPointsTotal, shownCur)}</p>
              {margin !== null && pointsTotal > 0 ? (
                <p className="mt-1 text-xs font-bold text-emerald-500" dir="ltr">
                  {t.vipSell} (+{margin}%): {money(sellingPrice(shownPointsTotal, margin), shownCur)} · +
                  {money(sellingPrice(shownPointsTotal, margin) - shownPointsTotal, shownCur)} {t.profit}
                </p>
              ) : null}
            </div>
            {profile ? (
              <button
                type="button"
                disabled={!pointsValid || cooldownLeft > 0}
                onClick={() => {
                  setBuying({ id: `points:${points}`, sizeName: `${points.toLocaleString("en-US")} ${t.points}`, priceCents: pointsTotal, rate: service.rate });
                  setFormError(null);
                  setTargetId("");
                }}
                className="btn-glow keep-white min-h-12 rounded-2xl px-6 text-sm font-bold text-white disabled:opacity-50"
              >
                {cooldownLeft > 0 ? `⏳ ${cooldownLeft}s` : t.purchase}
              </button>
            ) : (
              <Link to="/login" search={{ tab: undefined }} className="btn-glow keep-white inline-flex min-h-12 items-center rounded-2xl px-6 text-sm font-bold text-white">
                {t.signInToBuy}
              </Link>
            )}
          </div>
        </section>
      ) : null}

      <div className={`mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${mode === "POINT_COUNTER" ? "hidden" : ""}`}>
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
                    <span className="price-num">{money(shownPack(pack.id, pack.priceCents), shownCur)}</span>
                  </span>
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="text-muted">+{margin}%</span>
                    <span className="price-num">{money(sellingPrice(shownPack(pack.id, pack.priceCents), margin), shownCur)}</span>
                  </span>
                  <span className="mt-0.5 w-fit rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500" dir="ltr">
                    +{money(sellingPrice(shownPack(pack.id, pack.priceCents), margin) - shownPack(pack.id, pack.priceCents), shownCur)} {t.profit}
                  </span>
                </span>
              ) : (
                <span className="price-capsule mt-2">
                  <span className="price-num text-sm sm:text-base">{money(shownPack(pack.id, pack.priceCents), shownCur)}</span>
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
            {isVault ? <p className="mt-4 rounded-2xl bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-700">{t.vaultNoInput}</p> : null}
            <div className={`mt-4 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 ${isVault ? "hidden" : ""}`}>
              <label className="text-sm font-semibold" htmlFor="target-id">
                {landline ? t.landlineLabel : targetText(t, service.category)}
              </label>
              {profile ? (
                savedId ? (
                  <span className="saved-id-chip inline-flex max-w-full min-w-0 items-center overflow-hidden rounded-full text-[11px] font-bold">
                    <button type="button" onClick={() => setTargetId(savedId)} className="min-h-8 min-w-0 truncate ps-3 pe-1.5" dir="auto">
                      {t.savedIdChip.replace("{id}", savedId)}
                    </button>
                    <button
                      type="button"
                      disabled={savingId}
                      onClick={() => void saveId(null)}
                      aria-label={t.idRemoved}
                      title="✎"
                      className="grid min-h-8 w-8 shrink-0 place-items-center border-s border-current/20"
                    >
                      ✎
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={savingId || targetId.trim().length < 3}
                    onClick={() => void saveId(targetId.trim())}
                    className="save-id-chip inline-flex min-h-8 max-w-full items-center truncate rounded-full px-3 text-[11px] font-bold disabled:opacity-60"
                  >
                    {t.saveIdChip}
                  </button>
                )
              ) : null}
            </div>
            <input
              id="target-id"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              placeholder={landline ? t.landlinePh : targetText(t, service.category)}
              dir="ltr"
              inputMode={landline ? "tel" : undefined}
              className={`field mt-2 ${isVault ? "hidden" : ""}`}
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
                if (!isVault && targetId.trim().length < 3) {
                  setFormError(targetText(t, service.category));
                  return;
                }
                if (isVault && vaultStock === 0) {
                  setFormError(t.vaultSoldOut);
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
            <div className={`flex items-center justify-between gap-3 ${isVault ? "hidden" : ""}`}>
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
      {hud.element}
    </main>
  );
}
