"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ClipboardList, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { deleteServiceAction, getAdminService, getPackageSecrets, getServiceGroups, getSypRate, saveServiceAction, uploadMediaAsset } from "@/lib/store/api";
import { useI18n } from "@/lib/i18n";
import { PRESET_COVERS } from "@/lib/store/data";
import { DEFAULT_SYP_RATE, dollarsToCents, sypFromUsd } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, MAX_CUSTOM_FIELDS, MAX_PACKAGES, type Category, type CustomField, type ServiceGroup } from "@/lib/store/types";

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
  instructionsAr: string;
  badge: string;
  imageUrl: string;
  packages: PackDraft[];
  /** v31: what the customer must type at checkout (empty = the classic ID / phone box). */
  customFields: CustomField[];
};

/** Quick presets for the most common customer requirements. */
const FIELD_PRESETS: Array<Pick<CustomField, "labelAr" | "labelEn" | "placeholderEn">> = [
  { labelAr: "رقم اللاعب ID", labelEn: "Player ID", placeholderEn: "512345678" },
  { labelAr: "الاسم الكامل", labelEn: "Full name" },
  { labelAr: "البريد الإلكتروني", labelEn: "Email", placeholderEn: "name@example.com" },
  { labelAr: "السيرفر", labelEn: "Server" },
  { labelAr: "رابط الحساب", labelEn: "Account link", placeholderEn: "https://" },
];

function blankField(preset?: Partial<CustomField>): CustomField {
  return { id: `f-${crypto.randomUUID().slice(0, 8)}`, labelAr: "", labelEn: "", required: true, ...preset };
}

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
    instructionsAr: "",
    badge: "",
    imageUrl: "",
    packages: [blankPack()],
    customFields: [],
  };
}

export function ServiceFormModal() {
  const serviceModal = useNovaUi((state) => state.serviceModal);
  const closeServiceModal = useNovaUi((state) => state.closeServiceModal);
  const { t, language } = useI18n();
  const ar = language === "ar";
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
        instructionsAr: service.instructionsAr ?? "",
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
        customFields: service.customFields ?? [],
      });
      setSlugLocked(true);
      setLoading(false);
      // Provider endpoints / codes are server-only: load them into the editor separately.
      void getPackageSecrets(service.packages.map((pack) => pack.id)).then((secrets) => {
        if (cancel) return;
        setForm((current) => ({
          ...current,
          packages: current.packages.map((pack) => (pack.id && secrets[pack.id] ? { ...pack, ...secrets[pack.id] } : pack)),
        }));
      });
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
    for (const pack of form.serviceMode === "POINT_COUNTER" ? [] : form.packages.slice(0, MAX_PACKAGES)) {
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
        // Vault sizes are sold from stock, never through a provider API.
        apiEndpoint: form.serviceMode === "VAULT" ? "" : pack.apiEndpoint.trim(),
        apiSecretCode: form.serviceMode === "VAULT" ? "" : pack.apiSecretCode.trim(),
      });
    }
    const customFields = form.customFields
      .map((field) => ({ ...field, labelAr: field.labelAr.trim(), labelEn: field.labelEn.trim(), placeholderAr: field.placeholderAr?.trim() || undefined, placeholderEn: field.placeholderEn?.trim() || undefined }))
      .filter((field) => field.labelAr || field.labelEn);
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
        instructionsAr: form.instructionsAr,
        badge: form.badge,
        imageUrl: form.imageUrl.trim(),
        packages,
        customFields: form.serviceMode === "VAULT" ? [] : customFields,
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
    <div data-lenis-prevent className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overflow-x-hidden bg-black/75 py-4 backdrop-blur-md sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-form-title"
        className="svc-form nova-grid-border glass mx-auto box-border max-h-[88vh] w-[94vw] max-w-2xl overflow-x-hidden overflow-y-auto overscroll-contain rounded-[1.5rem] border border-[#0284c7]/30 p-3.5 shadow-[0_0_50px_-16px_rgba(14,165,233,0.9)] sm:my-auto sm:rounded-[1.75rem] sm:p-6"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ServiceMark slug={form.slug || "new-slug"} category={form.category} name={form.name || "New"} imageUrl={form.imageUrl} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-[0.18em] text-[#1e3a8a] uppercase">
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
                {form.customFields.length ? (
                  <p className="mt-1.5 text-[11px] text-muted">{ar ? "تم استبداله بالحقول المطلوبة أدناه." : "Replaced by the customer fields below."}</p>
                ) : null}
              </Field>
            </div>

            {/* v31 — Customer requirements builder */}
            {form.serviceMode === "VAULT" ? null : (
              <section className="cf-builder min-w-0 rounded-2xl p-3" aria-labelledby="cf-title">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="cf-title" className="inline-flex items-center gap-1.5 text-sm font-extrabold">
                    <ClipboardList className="size-4 shrink-0 text-sky-600" strokeWidth={1.75} aria-hidden />
                    {ar ? "الحقول المطلوبة من الزبون" : "Customer requirements"}
                  </h3>
                  <span className="text-[11px] font-bold text-muted tabular-nums">
                    {form.customFields.length}/{MAX_CUSTOM_FIELDS}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {ar
                    ? "اتركها فارغة لاستخدام خانة المعرّف / الهاتف المعتادة. أول حقل يُرسل كمعرّف الطلب."
                    : "Leave empty to use the usual ID / phone box. The first field is sent as the order's target ID."}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {FIELD_PRESETS.map((preset) => (
                    <button
                      key={preset.labelEn}
                      type="button"
                      disabled={form.customFields.length >= MAX_CUSTOM_FIELDS}
                      onClick={() => patch({ customFields: [...form.customFields, blankField(preset)] })}
                      className="cf-preset min-h-9 rounded-full px-3 text-[11px] font-bold disabled:opacity-50"
                    >
                      + {ar ? preset.labelAr : preset.labelEn}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid gap-2.5">
                  {form.customFields.map((field, index) => {
                    const set = (partial: Partial<CustomField>) =>
                      patch({ customFields: form.customFields.map((item) => (item.id === field.id ? { ...item, ...partial } : item)) });
                    return (
                      <div key={field.id} className="cf-row min-w-0 rounded-[14px] p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-muted">
                            {ar ? "حقل" : "Field"} {index + 1}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={field.required}
                              onClick={() => set({ required: !field.required })}
                              className={`cf-toggle min-h-9 rounded-full px-3 text-[11px] font-bold ${field.required ? "is-on" : ""}`}
                            >
                              {field.required ? (ar ? "إلزامي" : "Required") : ar ? "اختياري" : "Optional"}
                            </button>
                            <button
                              type="button"
                              onClick={() => patch({ customFields: form.customFields.filter((item) => item.id !== field.id) })}
                              aria-label={ar ? `حذف الحقل ${index + 1}` : `Delete field ${index + 1}`}
                              className="grid size-9 place-items-center rounded-lg border border-rose-400/40 text-rose-500"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                          <input className="field" dir="rtl" placeholder="اسم الحقل (عربي)" aria-label="اسم الحقل (عربي)" value={field.labelAr} onChange={(event) => set({ labelAr: event.target.value })} />
                          <input className="field" dir="ltr" placeholder="Field name (English)" aria-label="Field name (English)" value={field.labelEn} onChange={(event) => set({ labelEn: event.target.value })} />
                          <input className="field" dir="rtl" placeholder="مثال يظهر داخل الخانة (اختياري)" aria-label="مثال (عربي)" value={field.placeholderAr ?? ""} onChange={(event) => set({ placeholderAr: event.target.value })} />
                          <input className="field" dir="ltr" placeholder="Hint inside the box (optional)" aria-label="Hint (English)" value={field.placeholderEn ?? ""} onChange={(event) => set({ placeholderEn: event.target.value })} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={form.customFields.length >= MAX_CUSTOM_FIELDS}
                  onClick={() => patch({ customFields: [...form.customFields, blankField()] })}
                  className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-full border border-[#0284c7]/40 px-4 text-sm font-semibold disabled:opacity-50"
                >
                  <Plus className="size-4" /> {ar ? "إضافة حقل مطلوب" : "Add required field"}
                </button>
              </section>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Checkout instructions (English)">
                <textarea className="field min-h-24" dir="ltr" value={form.instructions} onChange={(event) => patch({ instructions: event.target.value })} />
              </Field>
              <Field label="تعليمات الشحن (عربي)">
                <textarea
                  className="field min-h-24"
                  dir="rtl"
                  placeholder="اتركه فارغاً لاستخدام تعليمات عربية تلقائية"
                  value={form.instructionsAr}
                  onChange={(event) => patch({ instructionsAr: event.target.value })}
                />
              </Field>
            </div>

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
                      className={`grid aspect-square w-full max-w-16 place-items-center overflow-hidden rounded-2xl border ${active ? "border-[#0284c7] ring-2 ring-[#0284c7]/40" : "border-white/10"}`}
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
                      if (file.size > 12 * 1024 * 1024) {
                        setError("Use an image under 12 MB.");
                        return;
                      }
                      // v29: 512 px WebP in the media bucket; the service keeps only the link.
                      const pending = toast.loading("Uploading image…");
                      void uploadMediaAsset(file, "service").then((result) => {
                        toast.dismiss(pending);
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        patch({ imageUrl: result.url });
                      });
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
            {form.serviceMode === "VAULT" ? (
              <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-xs text-muted">
                {ar
                  ? "كل حجم هنا يظهر في «خزنة الحسابات» لإضافة أكواده أو حساباته الخاصة به."
                  : "Each size here appears in the Vault manager, where you add its own codes or accounts."}
              </p>
            ) : null}

            <div className={`mt-2 flex flex-wrap items-center justify-between gap-2 ${form.serviceMode === "POINT_COUNTER" ? "hidden" : ""}`}>
              <h3 className="font-display text-lg font-extrabold sm:text-xl">
                {ar ? "الأحجام / الباقات" : "Charge sizes"}{" "}
                <span className="text-xs font-bold text-muted tabular-nums">
                  {form.packages.length}/{MAX_PACKAGES}
                </span>
              </h3>
              <button
                type="button"
                disabled={form.packages.length >= MAX_PACKAGES}
                onClick={() => patch({ packages: [...form.packages, blankPack()] })}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#0284c7]/40 px-3 text-sm font-semibold disabled:opacity-50"
              >
                <Plus className="size-4" /> {ar ? "إضافة حجم / باقة" : "Add size / package"}
              </button>
            </div>

            <div className="grid gap-3">
              {form.serviceMode === "POINT_COUNTER" ? null : form.packages.slice(0, MAX_PACKAGES).map((pack, index) => (
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
                      className="min-h-10 w-full rounded-full border border-[#0284c7]/40 px-3 text-xs font-bold"
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
                    <label className={`pf-label ${form.serviceMode === "VAULT" ? "hidden" : ""}`}>
                      API endpoint
                      <input
                        className="field mt-1"
                        dir="ltr"
                        placeholder="https://api.example.com/topup"
                        value={pack.apiEndpoint}
                        onChange={(event) => patchPack(pack.key, { apiEndpoint: event.target.value })}
                      />
                    </label>
                    <label className={`pf-label ${form.serviceMode === "VAULT" ? "hidden" : ""}`}>
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
