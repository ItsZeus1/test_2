"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { deleteServiceAction, getAdminService, getServiceGroups, getSypRate, saveServiceAction } from "@/lib/store/api";
import { useI18n } from "@/lib/i18n";
import { PRESET_COVERS } from "@/lib/store/data";
import { DEFAULT_SYP_RATE, dollarsToCents, sypFromUsd } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, type Category, type ServiceGroup } from "@/lib/store/types";

type PackDraft = {
  key: string;
  id?: string;
  sizeName: string;
  normal: string;
  vip: string;
  normalSyp: string;
  vipSyp: string;
  apiEndpoint: string;
  apiSecretCode: string;
};

type FormState = {
  id?: string;
  name: string;
  nameAr: string;
  slug: string;
  category: Category;
  description: string;
  descriptionAr: string;
  deliverySpeed: "INSTANT" | "MANUAL";
  groupId: string;
  serviceMode: "PACKAGES" | "POINT_COUNTER" | "VAULT";
  counter: { per100: string; vipPer100: string; per100Syp: string; vipPer100Syp: string; minPoints: string; stepPoints: string };
  targetInputType: "PLAYER_ID" | "LANDLINE_PHONE";
  instructions: string;
  badge: string;
  imageUrl: string;
  packages: PackDraft[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function centsToField(cents: number) {
  return (cents / 100).toFixed(2);
}

/** SYP fields stay blank when the package follows "USD x rate". */
function sypField(minor: number) {
  return minor > 0 ? centsToField(minor) : "";
}

function blankPack(): PackDraft {
  return {
    key: crypto.randomUUID(),
    id: `draft-${crypto.randomUUID()}`,
    sizeName: "",
    normal: "",
    vip: "",
    normalSyp: "",
    vipSyp: "",
    apiEndpoint: "",
    apiSecretCode: "",
  };
}

function emptyForm(): FormState {
  return {
    name: "",
    nameAr: "",
    slug: "",
    category: "games",
    description: "",
    descriptionAr: "",
    deliverySpeed: "INSTANT",
    groupId: "",
    serviceMode: "PACKAGES",
    counter: { per100: "1.00", vipPer100: "0.90", per100Syp: "", vipPer100Syp: "", minPoints: "100", stepPoints: "100" },
    targetInputType: "PLAYER_ID",
    instructions: "",
    badge: "",
    imageUrl: "",
    packages: [blankPack()],
  };
}

export function ServiceFormModal() {
  const serviceModal = useNovaUi((state) => state.serviceModal);
  const closeServiceModal = useNovaUi((state) => state.closeServiceModal);
  const { t, language } = useI18n();
  const [rate, setRate] = useState(DEFAULT_SYP_RATE);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  useEffect(() => {
    void getServiceGroups().then(setGroups);
  }, []);
  const [slugLocked, setSlugLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!serviceModal) return;
    let cancel = false;
    void getSypRate().then((value) => {
      if (!cancel) setRate(value);
    });
    if (serviceModal.mode === "create") {
      setForm(emptyForm());
      setSlugLocked(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void getAdminService({ slug: serviceModal.slug }).then((result) => {
      if (cancel) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      const service = result.service;
      setForm({
        id: service.id,
        name: service.name,
        nameAr: service.nameAr,
        slug: service.slug,
        category: service.category,
        description: service.description,
        descriptionAr: service.descriptionAr,
        deliverySpeed: service.deliverySpeed,
        groupId: service.groupId ?? "",
        serviceMode: service.serviceMode,
        counter: {
          per100: centsToField(service.counter.pricePer100UsdCents),
          vipPer100: centsToField(service.counter.vipPricePer100UsdCents),
          per100Syp: sypField(service.counter.pricePer100SypCents),
          vipPer100Syp: sypField(service.counter.vipPricePer100SypCents),
          minPoints: String(service.counter.minPoints),
          stepPoints: String(service.counter.stepPoints),
        },
        targetInputType: service.targetInputType,
        instructions: service.instructions,
        badge: service.badge ?? "",
        imageUrl: service.imageUrl || "",
        packages: service.packages.map((pack) => ({
          key: pack.id,
          id: pack.id,
          sizeName: pack.sizeName,
          normal: centsToField(pack.normalPriceCents),
          vip: centsToField(pack.vipPriceCents),
          normalSyp: sypField(pack.normalPriceSypCents),
          vipSyp: sypField(pack.vipPriceSypCents),
          apiEndpoint: pack.apiEndpoint,
          apiSecretCode: pack.apiSecretCode,
        })),
      });
      setSlugLocked(true);
      setLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, [serviceModal]);

  if (!serviceModal) return null;

  function patch(partial: Partial<FormState>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  function patchPack(key: string, partial: Partial<PackDraft>) {
    setForm((current) => ({
      ...current,
      packages: current.packages.map((pack) => (pack.key === key ? { ...pack, ...partial } : pack)),
    }));
  }

  async function save() {
    setError(null);
    const packages = [];
    let counter: {
      pricePer100UsdCents: number;
      vipPricePer100UsdCents: number;
      pricePer100SypCents: number;
      vipPricePer100SypCents: number;
      minPoints: number;
      stepPoints: number;
    } | undefined;
    if (form.serviceMode === "POINT_COUNTER") {
      const per100 = dollarsToCents(form.counter.per100);
      const vipPer100 = dollarsToCents(form.counter.vipPer100);
      const per100Syp = form.counter.per100Syp.trim() ? dollarsToCents(form.counter.per100Syp) : 0;
      const vipPer100Syp = form.counter.vipPer100Syp.trim() ? dollarsToCents(form.counter.vipPer100Syp) : 0;
      const minPoints = Number.parseInt(form.counter.minPoints, 10);
      const stepPoints = Number.parseInt(form.counter.stepPoints, 10);
      if (per100 == null || vipPer100 == null || per100Syp == null || vipPer100Syp == null || !(minPoints > 0) || !(stepPoints > 0)) {
        setError(t.pricesHint);
        return;
      }
      counter = { pricePer100UsdCents: per100, vipPricePer100UsdCents: vipPer100, pricePer100SypCents: per100Syp, vipPricePer100SypCents: vipPer100Syp, minPoints, stepPoints };
    }
    for (const pack of form.serviceMode === "POINT_COUNTER" ? [] : form.serviceMode === "VAULT" ? form.packages.slice(0, 1) : form.packages) {
      const normalPriceCents = dollarsToCents(pack.normal);
      const vipPriceCents = dollarsToCents(pack.vip);
      if (normalPriceCents == null || vipPriceCents == null) {
        setError("Each charge size needs prices like 4.99");
        return;
      }
      const normalPriceSypCents = pack.normalSyp.trim() ? dollarsToCents(pack.normalSyp) : 0;
      const vipPriceSypCents = pack.vipSyp.trim() ? dollarsToCents(pack.vipSyp) : 0;
      if (normalPriceSypCents == null || vipPriceSypCents == null) {
        setError(t.pricesHint);
        return;
      }
      packages.push({
        id: pack.id,
        sizeName: pack.sizeName,
        normalPriceCents,
        vipPriceCents,
        normalPriceSypCents,
        vipPriceSypCents,
        apiEndpoint: pack.apiEndpoint.trim(),
        apiSecretCode: pack.apiSecretCode.trim(),
      });
    }
    setBusy(true);
    try {
      const result = await saveServiceAction({
        id: form.id,
        name: form.name,
        nameAr: form.nameAr,
        slug: form.slug,
        category: form.category,
        description: form.description,
        descriptionAr: form.descriptionAr,
        deliverySpeed: form.deliverySpeed,
        groupId: form.groupId,
        serviceMode: form.serviceMode,
        counter,
        targetInputType: form.targetInputType,
        instructions: form.instructions,
        badge: form.badge,
        imageUrl: form.imageUrl.trim(),
        packages,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(form.id ? "Service updated" : "Service added");
      closeServiceModal();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!form.slug) return;
    setBusy(true);
    try {
      const result = await deleteServiceAction({ slug: form.slug });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Service deleted");
      closeServiceModal();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overflow-x-hidden bg-black/75 py-4 backdrop-blur-md sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-form-title"
        className="svc-form nova-grid-border glass mx-auto box-border max-h-[88vh] w-[94vw] max-w-2xl overflow-x-hidden overflow-y-auto overscroll-contain rounded-[1.5rem] border border-violet/30 p-3.5 shadow-[0_0_50px_-16px_rgba(139,92,246,0.9)] sm:my-auto sm:rounded-[1.75rem] sm:p-6"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ServiceMark slug={form.slug || "new-slug"} category={form.category} name={form.name || "New"} imageUrl={form.imageUrl} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-[0.18em] text-violet uppercase">
                {serviceModal.mode === "create" ? "New slug" : "Edit slug"}
              </p>
              <h2 id="service-form-title" className="truncate font-display text-xl font-extrabold sm:text-3xl">
                <span className="text-gradient">{form.name || "Add service"}</span>
              </h2>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={closeServiceModal} className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10">
            <X className="size-4" />
          </button>
        </div>

        {loading ? (
          <div className="mt-6 h-40 animate-pulse rounded-3xl bg-white/5" />
        ) : (
          <div className="mt-5 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input
                  className="field"
                  value={form.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    patch({
                      name,
                      slug: slugLocked || form.id ? form.slug : slugify(name),
                    });
                  }}
                />
              </Field>
              <Field label="Slug">
                <input
                  className="field"
                  value={form.slug}
                  onChange={(event) => {
                    setSlugLocked(true);
                    patch({ slug: event.target.value });
                  }}
                />
              </Field>
              <Field label="Category">
                <select className="field" value={form.category} onChange={(event) => patch({ category: event.target.value as Category })}>
                  {CATEGORIES.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Badge">
                <input className="field" value={form.badge} maxLength={16} placeholder="Hot" onChange={(event) => patch({ badge: event.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <textarea className="field min-h-20" value={form.description} onChange={(event) => patch({ description: event.target.value })} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.nameArLabel}>
                <input className="field" dir="rtl" value={form.nameAr} onChange={(event) => patch({ nameAr: event.target.value })} />
              </Field>
              <Field label={t.descriptionArLabel}>
                <textarea className="field min-h-20" dir="rtl" value={form.descriptionAr} onChange={(event) => patch({ descriptionAr: event.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.deliverySpeed}>
                <div className="grid grid-cols-1 gap-1.5">
                  {(["INSTANT", "MANUAL"] as const).map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      aria-pressed={form.deliverySpeed === speed}
                      onClick={() => patch({ deliverySpeed: speed, ...(speed === "MANUAL" ? {} : { targetInputType: "PLAYER_ID" as const }) })}
                      className={`min-h-10 rounded-xl border px-3 text-start text-xs font-bold ${form.deliverySpeed === speed ? (speed === "MANUAL" ? "manual-badge border-transparent" : "border-emerald-400/60 bg-emerald-500/10 text-emerald-600") : "border-white/10 bg-white/5 text-muted"}`}
                    >
                      {speed === "MANUAL" ? t.speedManual : t.speedInstant}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={language === "ar" ? "القسم / المجموعة" : "Service group"}>
                <select className="field" value={form.groupId} onChange={(event) => patch({ groupId: event.target.value })}>
                  <option value="">{language === "ar" ? "تلقائي (حسب الفئة)" : "Automatic (by category)"}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.icon} {language === "ar" ? group.nameAr || group.name : group.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.targetType}>
                <div className="grid grid-cols-1 gap-1.5">
                  {(["PLAYER_ID", "LANDLINE_PHONE"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={form.targetInputType === kind}
                      onClick={() => patch({ targetInputType: kind })}
                      className={`min-h-10 rounded-xl border px-3 text-start text-xs font-bold ${form.targetInputType === kind ? "border-indigo-400/60 bg-indigo-500/10 text-indigo-600" : "border-white/10 bg-white/5 text-muted"}`}
                    >
                      {kind === "LANDLINE_PHONE" ? t.targetLandline : t.targetPlayer}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Checkout instructions">
              <textarea className="field min-h-20" value={form.instructions} onChange={(event) => patch({ instructions: event.target.value })} />
            </Field>

            <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-extrabold sm:text-xl">Cover image</h3>
                {form.imageUrl ? (
                  <button type="button" className="text-xs font-bold text-muted" onClick={() => patch({ imageUrl: "" })}>
                    Clear
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs font-bold tracking-[0.16em] text-muted uppercase">Preset icons</p>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {PRESET_COVERS.map((preset) => {
                  const active = form.imageUrl === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.label}
                      onClick={() => patch({ imageUrl: preset.url })}
                      className={`grid aspect-square w-full max-w-16 place-items-center overflow-hidden rounded-2xl border ${active ? "border-violet ring-2 ring-violet/40" : "border-white/10"}`}
                    >
                      <img src={preset.url} alt={preset.label} className="size-full object-cover" />
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="box-border inline-flex min-h-11 w-full min-w-0 cursor-pointer items-center justify-center rounded-full border border-white/15 px-3 text-sm font-semibold">
                  Upload image
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (file.size > 4 * 1024 * 1024) {
                        setError("Use an image under 4 MB.");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        const value = typeof reader.result === "string" ? reader.result : "";
                        if (value.startsWith("data:image/")) patch({ imageUrl: value });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                <input
                  className="field"
                  dir="ltr"
                  placeholder="https://cdn.example.com/cover.png"
                  value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl}
                  onChange={(event) => patch({ imageUrl: event.target.value.trim() })}
                />
              </div>
              {form.imageUrl ? (
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs font-bold tracking-[0.16em] text-muted uppercase">Preview</span>
                  <img src={form.imageUrl} alt="" className="size-16 rounded-2xl object-cover" />
                </div>
              ) : null}
            </div>

            <Field label={t.serviceModeLabel}>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {(["PACKAGES", "POINT_COUNTER", "VAULT"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={form.serviceMode === mode}
                    onClick={() => patch({ serviceMode: mode })}
                    className={`min-h-11 rounded-xl border px-3 text-start text-xs font-bold ${form.serviceMode === mode ? "border-indigo-400/60 bg-indigo-500/10 text-indigo-600" : "border-white/10 bg-white/5 text-muted"}`}
                  >
                    {mode === "POINT_COUNTER" ? t.modeCounter : mode === "VAULT" ? t.modeVault : t.modePackages}
                  </button>
                ))}
              </div>
            </Field>

            {form.serviceMode === "POINT_COUNTER" ? (
              <div className="grid min-w-0 grid-cols-2 gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                {([
                  ["per100", t.per100Usd, "1.00"],
                  ["vipPer100", t.vipPer100Usd, "0.90"],
                  ["per100Syp", t.per100Syp, "auto"],
                  ["vipPer100Syp", t.vipPer100Syp, "auto"],
                  ["minPoints", t.minPoints, "100"],
                  ["stepPoints", t.stepPoints, "100"],
                ] as const).map(([key, label, placeholder]) => (
                  <label key={key} className="pf-label">
                    {label}
                    <input
                      className="field mt-1"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder={placeholder}
                      value={form.counter[key]}
                      onChange={(event) => patch({ counter: { ...form.counter, [key]: event.target.value } })}
                    />
                  </label>
                ))}
              </div>
            ) : null}
            {form.serviceMode === "VAULT" ? <p className="rounded-xl bg-indigo-500/10 px-3 py-2 text-xs text-muted">{t.vaultPriceHint}</p> : null}

            <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 ${form.serviceMode === "POINT_COUNTER" ? "hidden" : ""}`}>
              <h3 className="font-display text-lg font-extrabold sm:text-xl">Charge sizes</h3>
              <button
                type="button"
                disabled={form.packages.length >= 12 || form.serviceMode === "VAULT"}
                onClick={() => patch({ packages: [...form.packages, blankPack()] })}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-violet/40 px-3 text-sm font-semibold"
              >
                <Plus className="size-4" /> Add size
              </button>
            </div>

            <div className="grid gap-3">
              {form.serviceMode === "POINT_COUNTER" ? null : form.packages.slice(0, form.serviceMode === "VAULT" ? 1 : 12).map((pack, index) => (
                <div key={pack.key} className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold tracking-[0.16em] text-muted uppercase">Package {index + 1}</p>
                    <button
                      type="button"
                      disabled={form.packages.length === 1}
                      onClick={() => patch({ packages: form.packages.filter((item) => item.key !== pack.key) })}
                      className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-rose-200 disabled:opacity-40"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </div>
                  <div className="grid min-w-0 grid-cols-1 gap-2.5">
                    <label className="pf-label">
                      Name / الاسم
                      <input className="field mt-1" placeholder="60 UC" value={pack.sizeName} onChange={(event) => patchPack(pack.key, { sizeName: event.target.value })} />
                    </label>
                    <div className="grid min-w-0 grid-cols-2 gap-2">
                      <label className="pf-label">
                        {t.priceUsdNormal}
                        <input className="field mt-1" placeholder="4.99" dir="ltr" inputMode="decimal" value={pack.normal} onChange={(event) => patchPack(pack.key, { normal: event.target.value })} />
                      </label>
                      <label className="pf-label">
                        {t.priceUsdVip}
                        <input className="field mt-1" placeholder="3.99" dir="ltr" inputMode="decimal" value={pack.vip} onChange={(event) => patchPack(pack.key, { vip: event.target.value })} />
                      </label>
                    </div>
                    <div className="grid min-w-0 grid-cols-2 gap-2">
                      <label className="pf-label">
                        {t.priceSypNormal}
                        <input className="field mt-1" placeholder="auto" dir="ltr" inputMode="decimal" value={pack.normalSyp} onChange={(event) => patchPack(pack.key, { normalSyp: event.target.value })} />
                      </label>
                      <label className="pf-label">
                        {t.priceSypVip}
                        <input className="field mt-1" placeholder="auto" dir="ltr" inputMode="decimal" value={pack.vipSyp} onChange={(event) => patchPack(pack.key, { vipSyp: event.target.value })} />
                      </label>
                    </div>
                    <p className="text-[11px] text-muted">{t.priceSypAuto}</p>
                    <button
                      type="button"
                      className="min-h-10 w-full rounded-full border border-violet/40 px-3 text-xs font-bold"
                      onClick={() => {
                        const normal = dollarsToCents(pack.normal);
                        const vip = dollarsToCents(pack.vip);
                        patchPack(pack.key, {
                          normalSyp: normal == null ? pack.normalSyp : centsToField(sypFromUsd(normal, rate)),
                          vipSyp: vip == null ? pack.vipSyp : centsToField(sypFromUsd(vip, rate)),
                        });
                      }}
                    >
                      {t.fillFromRate} (1 USD = {rate} SYP)
                    </button>
                    <label className="pf-label">
                      API endpoint
                      <input
                        className="field mt-1"
                        dir="ltr"
                        placeholder="https://api.example.com/topup"
                        value={pack.apiEndpoint}
                        onChange={(event) => patchPack(pack.key, { apiEndpoint: event.target.value })}
                      />
                    </label>
                    <label className="pf-label">
                      Secret code
                      <input
                        className="field mt-1"
                        dir="ltr"
                        placeholder="API secret code"
                        autoComplete="off"
                        value={pack.apiSecretCode}
                        onChange={(event) => patchPack(pack.key, { apiSecretCode: event.target.value })}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {error ? <p className="text-sm text-rose-200">{error}</p> : null}
            <div className="grid grid-cols-1 gap-2 pt-1 sm:flex sm:flex-wrap">
              <button type="button" disabled={busy} onClick={() => void save()} className="btn-glow min-h-12 w-full rounded-full px-5 text-sm font-semibold disabled:opacity-60 sm:w-auto sm:flex-1">
                {busy ? "Saving…" : "Save service"}
              </button>
              {form.id ? (
                <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-12 rounded-full border border-rose-300/40 px-5 text-sm font-semibold text-rose-100">
                  Delete
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={closeServiceModal} className="min-h-12 rounded-full border border-white/15 px-5 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-1.5 font-normal">{children}</div>
    </label>
  );
}
