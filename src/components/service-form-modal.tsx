"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ClipboardList, Globe, Hourglass, ImagePlus, Layers, LockKeyhole, Plus, ScrollText, SlidersHorizontal, Trash2, Upload, X, Zap, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { deleteServiceAction, getAdminService, getPackageSecrets, getServiceGroups, getSypRate, saveServiceAction, uploadMediaAsset } from "@/lib/store/api";
import { useI18n } from "@/lib/i18n";
import { PRESET_COVERS } from "@/lib/store/data";
import { DEFAULT_SYP_RATE, dollarsToCents, sypFromUsd } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, MAX_CUSTOM_FIELDS, MAX_PACKAGES, MAX_REGIONS, type Category, type CustomField, type ServiceGroup, type ServiceRegion } from "@/lib/store/types";

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
  /** v32.1: region / type this size belongs to ("" = every region). */
  regionId: string;
  /** v38: read-only Mega link (the save keeps it; prices follow Mega automatically). */
  mega?: { id: number; name?: string; cost?: number; active: boolean };
  /** v38.1: this size asks the customer for its own fields (null = same as the service). */
  fields: CustomField[] | null;
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
  counter: {
    per100: string;
    vipPer100: string;
    per100Syp: string;
    vipPer100Syp: string;
    minPoints: string;
    stepPoints: string;
    /** v38 */
    maxPoints: string;
    unitName: string;
    per: number;
    mega?: { id: number; name?: string; cost?: number; active: boolean };
  };
  targetInputType: "PLAYER_ID" | "LANDLINE_PHONE";
  instructions: string;
  instructionsAr: string;
  badge: string;
  imageUrl: string;
  packages: PackDraft[];
  /** v31: what the customer must type at checkout (empty = the classic ID / phone box). */
  customFields: CustomField[];
  /** v32.1: region / type options, picked by the customer before the sizes. */
  regions: ServiceRegion[];
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

/** Trimmed fields without empty labels (what gets saved). */
function cleanFields(fields: CustomField[]): CustomField[] {
  return fields
    .map((field) => ({ ...field, labelAr: field.labelAr.trim(), labelEn: field.labelEn.trim(), placeholderAr: field.placeholderAr?.trim() || undefined, placeholderEn: field.placeholderEn?.trim() || undefined }))
    .filter((field) => field.labelAr || field.labelEn);
}

/** v38.1: the customer-fields editor, shared by the service and by single sizes. */
function FieldsEditor({ ar, fields, onChange, compact = false }: { ar: boolean; fields: CustomField[]; onChange: (fields: CustomField[]) => void; compact?: boolean }) {
  return (
    <>
      <div className={`${compact ? "" : "mt-2 "}flex flex-wrap gap-1.5`}>
        {FIELD_PRESETS.map((preset) => (
          <button
            key={preset.labelEn}
            type="button"
            disabled={fields.length >= MAX_CUSTOM_FIELDS}
            onClick={() => onChange([...fields, blankField(preset)])}
            className="cf-preset min-h-9 rounded-full px-3 text-[11px] font-bold disabled:opacity-50"
          >
            + {ar ? preset.labelAr : preset.labelEn}
          </button>
        ))}
      </div>
      <div className="mt-2 grid gap-2">
        {fields.map((field, index) => {
          const set = (partial: Partial<CustomField>) => onChange(fields.map((item) => (item.id === field.id ? { ...item, ...partial } : item)));
          return (
            <div key={field.id} className="cf-row grid min-w-0 grid-cols-2 gap-1.5 rounded-[14px] p-2">
              <div className="col-span-2 flex items-center justify-between gap-2">
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
                    onClick={() => onChange(fields.filter((item) => item.id !== field.id))}
                    aria-label={ar ? `حذف الحقل ${index + 1}` : `Delete field ${index + 1}`}
                    className="grid size-9 place-items-center rounded-[10px] border border-rose-400/40 text-rose-500"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <input className="field" dir="rtl" placeholder="اسم الحقل (عربي)" aria-label="اسم الحقل (عربي)" value={field.labelAr} onChange={(event) => set({ labelAr: event.target.value })} />
              <input className="field" dir="ltr" placeholder="Field name (English)" aria-label="Field name (English)" value={field.labelEn} onChange={(event) => set({ labelEn: event.target.value })} />
              <input className="field" dir="rtl" placeholder="مثال داخل الخانة (اختياري)" aria-label="مثال (عربي)" value={field.placeholderAr ?? ""} onChange={(event) => set({ placeholderAr: event.target.value })} />
              <input className="field" dir="ltr" placeholder="Hint inside the box" aria-label="Hint (English)" value={field.placeholderEn ?? ""} onChange={(event) => set({ placeholderEn: event.target.value })} />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={fields.length >= MAX_CUSTOM_FIELDS}
        onClick={() => onChange([...fields, blankField()])}
        className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-full border border-[#0284c7]/40 px-4 text-sm font-semibold disabled:opacity-50"
      >
        <Plus className="size-4" /> {ar ? "إضافة حقل مطلوب" : "Add required field"}{" "}
        <span className="text-[11px] text-muted tabular-nums">
          {fields.length}/{MAX_CUSTOM_FIELDS}
        </span>
      </button>
    </>
  );
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

function blankPack(regionId = ""): PackDraft {
  return {
    regionId,
    key: crypto.randomUUID(),
    id: `draft-${crypto.randomUUID()}`,
    sizeName: "",
    normal: "",
    vip: "",
    normalSyp: "",
    vipSyp: "",
    apiEndpoint: "",
    apiSecretCode: "",
    fields: null,
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
    counter: { per100: "1.00", vipPer100: "0.90", per100Syp: "", vipPer100Syp: "", minPoints: "100", stepPoints: "100", maxPoints: "", unitName: "", per: 100 },
    targetInputType: "PLAYER_ID",
    instructions: "",
    instructionsAr: "",
    badge: "",
    imageUrl: "",
    packages: [blankPack()],
    customFields: [],
    regions: [],
  };
}

export function ServiceFormModal() {
  const serviceModal = useNovaUi((state) => state.serviceModal);
  const closeServiceModal = useNovaUi((state) => state.closeServiceModal);
  const { t, language } = useI18n();
  const ar = language === "ar";
  const [rate, setRate] = useState(DEFAULT_SYP_RATE);
  // v32.1: which region's sizes the editor shows ("" = all).
  const [editRegion, setEditRegion] = useState("");
  const secretsReady = useRef(false);
  /** v33: move a package to position `to` (0-based) in the list. */
  function movePack(key: string, to: number) {
    setForm((current) => {
      const from = current.packages.findIndex((pack) => pack.key === key);
      if (from < 0 || !Number.isFinite(to)) return current;
      const target = Math.max(0, Math.min(current.packages.length - 1, Math.round(to)));
      if (target === from) return current;
      const packages = [...current.packages];
      const [moved] = packages.splice(from, 1);
      packages.splice(target, 0, moved);
      return { ...current, packages };
    });
  }
  /** The next visible package up / down (skips sizes of other regions while one is filtered). */
  function neighbour(index: number, step: -1 | 1): number {
    let next = index + step;
    while (editRegion && next >= 0 && next < form.packages.length && form.packages[next].regionId !== editRegion) next += step;
    return next;
  }
  const [form, setForm] = useState<FormState>(emptyForm);
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  useEffect(() => {
    void getServiceGroups().then(setGroups);
  }, []);
  const [slugLocked, setSlugLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // v35: which accordions are open (packages start open for a new service) and which package shows its extra options.
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({});
  const [openPack, setOpenPack] = useState<string | null>(null);
  const toggleSec = (key: string) => setOpenSec((current) => ({ ...current, [key]: !current[key] }));
  useEffect(() => {
    if (!serviceModal) return;
    setOpenSec({ packs: serviceModal.mode === "create" });
    setOpenPack(null);
  }, [serviceModal]);
  // A save problem is usually in the sizes: open them so the admin sees it.
  useEffect(() => {
    if (error) setOpenSec((current) => (current.packs ? current : { ...current, packs: true }));
  }, [error]);

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
    secretsReady.current = false;
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
          maxPoints: service.counter.maxPoints ? String(service.counter.maxPoints) : "",
          unitName: service.counter.unitName ?? "",
          per: service.counter.per ?? 100,
          mega: service.counter.megaProductId
            ? { id: service.counter.megaProductId, name: service.counter.megaName, cost: service.counter.megaCostUsd, active: service.counter.megaActive !== false }
            : undefined,
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
          regionId: pack.regionId ?? "",
          mega: pack.megaProductId ? { id: pack.megaProductId, name: pack.megaName, cost: pack.megaCostUsd, active: pack.megaActive !== false } : undefined,
          fields: pack.customFields?.length ? pack.customFields : null,
        })),
        customFields: service.customFields ?? [],
        regions: service.regions ?? [],
      });
      setSlugLocked(true);
      setLoading(false);
      // Provider endpoints / codes are server-only: load them into the editor separately.
      void getPackageSecrets(service.packages.map((pack) => pack.id)).then((secrets) => {
        if (cancel || !secrets) return;
        secretsReady.current = true;
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

  /** v29/v35: 512 px WebP in the media bucket; the service keeps only the link. */
  function onIconFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setError("Use an image under 12 MB.");
      return;
    }
    const pending = toast.loading(ar ? "جارٍ رفع الصورة…" : "Uploading image…");
    void uploadMediaAsset(file, "service").then((result) => {
      toast.dismiss(pending);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      patch({ imageUrl: result.url });
    });
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
      per: number;
      maxPoints: number;
      unitName: string;
    } | undefined;
    if (form.serviceMode === "POINT_COUNTER") {
      const per100 = dollarsToCents(form.counter.per100);
      const vipPer100 = dollarsToCents(form.counter.vipPer100);
      const per100Syp = form.counter.per100Syp.trim() ? dollarsToCents(form.counter.per100Syp) : 0;
      const vipPer100Syp = form.counter.vipPer100Syp.trim() ? dollarsToCents(form.counter.vipPer100Syp) : 0;
      const minPoints = Number.parseInt(form.counter.minPoints, 10);
      const stepPoints = Number.parseInt(form.counter.stepPoints, 10);
      const maxPoints = form.counter.maxPoints.trim() ? Number.parseInt(form.counter.maxPoints, 10) : 0;
      if (per100 == null || vipPer100 == null || per100Syp == null || vipPer100Syp == null || !(minPoints > 0) || !(stepPoints > 0) || !(maxPoints >= 0)) {
        setError(t.pricesHint);
        return;
      }
      if (maxPoints && maxPoints < minPoints) {
        setError(ar ? "الحد الأعلى أصغر من الحد الأدنى." : "The maximum is below the minimum.");
        return;
      }
      counter = {
        pricePer100UsdCents: per100,
        vipPricePer100UsdCents: vipPer100,
        pricePer100SypCents: per100Syp,
        vipPricePer100SypCents: vipPer100Syp,
        minPoints,
        stepPoints,
        per: form.counter.per,
        maxPoints,
        unitName: form.counter.unitName.trim(),
      };
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
        regionId: pack.regionId && form.regions.some((region) => region.id === pack.regionId) ? pack.regionId : undefined,
        customFields: form.serviceMode === "VAULT" || !pack.fields ? undefined : cleanFields(pack.fields),
      });
    }
    const regions = form.regions
      .map((region) => ({ ...region, nameAr: region.nameAr.trim(), nameEn: region.nameEn.trim() }))
      .filter((region) => region.nameAr || region.nameEn);
    const customFields = cleanFields(form.customFields);
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
        regions: form.serviceMode === "POINT_COUNTER" ? [] : regions,
        secretsLoaded: secretsReady.current,
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
          <div className="mt-4 grid gap-2.5">
            {/* v35 — compact core: names side by side, then one control row. */}
            <div className="grid grid-cols-2 gap-2">
              <CompactField label={ar ? "الاسم (EN)" : "Name (EN)"}>
                <input
                  className="field"
                  dir="ltr"
                  value={form.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    patch({
                      name,
                      slug: slugLocked || form.id ? form.slug : slugify(name),
                    });
                  }}
                />
              </CompactField>
              <CompactField label={ar ? "الاسم (عربي)" : t.nameArLabel}>
                <input className="field" dir="rtl" value={form.nameAr} onChange={(event) => patch({ nameAr: event.target.value })} />
              </CompactField>
              <CompactField label="Slug">
                <input
                  className="field"
                  dir="ltr"
                  value={form.slug}
                  onChange={(event) => {
                    setSlugLocked(true);
                    patch({ slug: event.target.value });
                  }}
                />
              </CompactField>
              <CompactField label={ar ? "شارة" : "Badge"}>
                <input className="field" value={form.badge} maxLength={16} placeholder="Hot" onChange={(event) => patch({ badge: event.target.value })} />
              </CompactField>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <CompactField label={ar ? "الفئة" : "Category"}>
                <select className="field" value={form.category} onChange={(event) => patch({ category: event.target.value as Category })}>
                  {CATEGORIES.map((item) => (
                    <option key={item.slug} value={item.slug}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </CompactField>
              <CompactField label={ar ? "القسم" : "Group"}>
                <select className="field" value={form.groupId} onChange={(event) => patch({ groupId: event.target.value })}>
                  <option value="">{ar ? "تلقائي" : "Automatic"}</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.icon} {ar ? group.nameAr || group.name : group.name}
                    </option>
                  ))}
                </select>
              </CompactField>
              {/* Icon: tap to upload (512 px WebP in the media bucket). */}
              <label className="svc-icon-tile grid size-[52px] cursor-pointer place-items-center overflow-hidden rounded-[16px]" title={ar ? "رفع الأيقونة" : "Upload icon"}>
                {form.imageUrl ? <img src={form.imageUrl} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5 text-sky-600" strokeWidth={1.75} aria-hidden />}
                <span className="sr-only">{ar ? "رفع أيقونة الخدمة" : "Upload service icon"}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={onIconFile} />
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Segmented
                label={ar ? "طريقة التنفيذ" : "Fulfillment"}
                value={form.serviceMode === "VAULT" ? "VAULT" : form.deliverySpeed}
                options={[
                  { value: "INSTANT", label: ar ? "فوري" : "Instant", icon: Zap },
                  { value: "MANUAL", label: ar ? "غير فوري" : "Manual", icon: Hourglass },
                  { value: "VAULT", label: ar ? "مخزن" : "Vault", icon: LockKeyhole },
                ]}
                onChange={(value) => {
                  if (value === "VAULT") patch({ serviceMode: "VAULT" });
                  else
                    patch({
                      deliverySpeed: value as "INSTANT" | "MANUAL",
                      serviceMode: form.serviceMode === "VAULT" ? "PACKAGES" : form.serviceMode,
                      ...(value === "MANUAL" ? {} : { targetInputType: "PLAYER_ID" as const }),
                    });
                }}
              />
              {form.serviceMode === "VAULT" ? (
                <p className="rounded-[14px] bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-muted sm:self-end">
                  {ar ? "كل حجم يظهر في «خزنة الحسابات» لإضافة أكواده أو حساباته." : "Each size appears in the Vault manager, where you add its codes or accounts."}
                </p>
              ) : (
                <Segmented
                  label={t.serviceModeLabel}
                  value={form.serviceMode}
                  options={[
                    { value: "PACKAGES", label: ar ? "باقات" : "Packages", icon: Layers },
                    { value: "POINT_COUNTER", label: ar ? "عدّاد نقاط" : "Points", icon: SlidersHorizontal },
                  ]}
                  onChange={(value) => patch({ serviceMode: value as FormState["serviceMode"] })}
                />
              )}
            </div>

            {form.serviceMode === "VAULT" ? null : (
              <Segmented
                label={t.targetType}
                value={form.targetInputType}
                hint={form.customFields.length ? (ar ? "تم استبداله بالحقول المطلوبة أدناه." : "Replaced by the customer fields below.") : undefined}
                options={[
                  { value: "PLAYER_ID", label: t.targetPlayer },
                  { value: "LANDLINE_PHONE", label: t.targetLandline },
                ]}
                onChange={(value) => patch({ targetInputType: value as FormState["targetInputType"] })}
              />
            )}

            {form.serviceMode === "POINT_COUNTER" ? (
              <div className="grid min-w-0 grid-cols-2 gap-2 rounded-[18px] border border-white/10 bg-white/[0.03] p-2 sm:grid-cols-3">
                {form.counter.mega ? (
                  <p className={`pk-mega col-span-2 sm:col-span-3 ${form.counter.mega.active ? "" : "is-off"}`} title={form.counter.mega.name}>
                    <span className="pk-mega-dot" aria-hidden />
                    <span className="truncate">
                      Mega #{form.counter.mega.id}
                      {form.counter.mega.cost != null ? ` · $${form.counter.mega.cost} / ${ar ? "وحدة" : "unit"}` : ""} ·{" "}
                      {ar ? "السعر والحدود تتحدث تلقائياً من Mega" : "price and limits follow Mega automatically"}
                    </span>
                  </p>
                ) : null}
                {(
                  [
                    ["per100", form.counter.per === 100 ? t.per100Usd : `${form.counter.per.toLocaleString("en-US")} → USD`, "1.00"],
                    ["vipPer100", form.counter.per === 100 ? t.vipPer100Usd : `${form.counter.per.toLocaleString("en-US")} → VIP USD`, "0.90"],
                    ["per100Syp", t.per100Syp, "auto"],
                    ["vipPer100Syp", t.vipPer100Syp, "auto"],
                    ["minPoints", t.minPoints, "100"],
                    ["stepPoints", t.stepPoints, "100"],
                    ["maxPoints", ar ? "أعلى كمية (اختياري)" : "Maximum (optional)", "∞"],
                    ["unitName", ar ? "اسم الوحدة" : "Unit name", ar ? "توكن، ل.س…" : "tokens, SYP…"],
                  ] as const
                )
                  .filter(([key]) => !form.counter.mega || key === "unitName")
                  .map(([key, label, placeholder]) => (
                    <label key={key} className="pf-label">
                      {label}
                      <input
                        className="field mt-1"
                        dir={key === "unitName" ? "auto" : "ltr"}
                        inputMode={key === "unitName" ? "text" : "decimal"}
                        placeholder={placeholder}
                        value={form.counter[key]}
                        onChange={(event) => patch({ counter: { ...form.counter, [key]: event.target.value } })}
                      />
                    </label>
                  ))}
              </div>
            ) : null}

            {/* v35 — secondary sections as one-tap accordions with live counts. */}
            <Accordion
              id="acc-details"
              icon={ScrollText}
              title={ar ? "الوصف والتعليمات والصورة" : "Description, instructions & image"}
              badge={[form.description || form.descriptionAr ? (ar ? "وصف ✓" : "Text ✓") : "", form.imageUrl ? (ar ? "صورة ✓" : "Image ✓") : ""].filter(Boolean).join(" · ") || (ar ? "اختياري" : "Optional")}
              open={Boolean(openSec.details)}
              onToggle={() => toggleSec("details")}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <CompactField label="Description (EN)">
                  <textarea className="field min-h-16" dir="ltr" value={form.description} onChange={(event) => patch({ description: event.target.value })} />
                </CompactField>
                <CompactField label={t.descriptionArLabel}>
                  <textarea className="field min-h-16" dir="rtl" value={form.descriptionAr} onChange={(event) => patch({ descriptionAr: event.target.value })} />
                </CompactField>
                <CompactField label="Checkout instructions (EN)">
                  <textarea className="field min-h-16" dir="ltr" value={form.instructions} onChange={(event) => patch({ instructions: event.target.value })} />
                </CompactField>
                <CompactField label="تعليمات الشحن (عربي)">
                  <textarea
                    className="field min-h-16"
                    dir="rtl"
                    placeholder="اتركه فارغاً لاستخدام تعليمات عربية تلقائية"
                    value={form.instructionsAr}
                    onChange={(event) => patch({ instructionsAr: event.target.value })}
                  />
                </CompactField>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{ar ? "أيقونات جاهزة" : "Preset icons"}</p>
                {form.imageUrl ? (
                  <button type="button" className="min-h-9 px-2 text-xs font-bold text-muted" onClick={() => patch({ imageUrl: "" })}>
                    {ar ? "مسح الصورة" : "Clear"}
                  </button>
                ) : null}
              </div>
              <div className="mt-1.5 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                {PRESET_COVERS.map((preset) => {
                  const active = form.imageUrl === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.label}
                      aria-pressed={active}
                      onClick={() => patch({ imageUrl: preset.url })}
                      className={`grid aspect-square w-full place-items-center overflow-hidden rounded-[12px] border ${active ? "border-[#0284c7] ring-2 ring-[#0284c7]/40" : "border-white/10"}`}
                    >
                      <img src={preset.url} alt={preset.label} className="size-full object-cover" />
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs font-bold">
                  <Upload className="size-3.5" aria-hidden /> {ar ? "رفع صورة" : "Upload"}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={onIconFile} />
                </label>
                <input
                  className="field"
                  dir="ltr"
                  aria-label="Image URL"
                  placeholder="https://cdn.example.com/cover.png"
                  value={form.imageUrl.startsWith("data:") ? "" : form.imageUrl}
                  onChange={(event) => patch({ imageUrl: event.target.value.trim() })}
                />
              </div>
            </Accordion>

            {form.serviceMode === "VAULT" ? null : (
              <Accordion
                id="acc-fields"
                icon={ClipboardList}
                title={ar ? "الحقول المطلوبة من الزبون" : "Customer requirements"}
                badge={fieldsBadge(form.customFields.length, ar)}
                active={form.customFields.length > 0}
                open={Boolean(openSec.fields)}
                onToggle={() => toggleSec("fields")}
              >
                <p className="text-[11px] leading-relaxed text-muted">
                  {ar
                    ? "اتركها فارغة لاستخدام خانة المعرّف / الهاتف المعتادة. أول حقل يُرسل كمعرّف الطلب."
                    : "Leave empty to use the usual ID / phone box. The first field is sent as the order's target ID."}
                </p>
                <FieldsEditor ar={ar} fields={form.customFields} onChange={(customFields) => patch({ customFields })} />
              </Accordion>
            )}

            {form.serviceMode === "POINT_COUNTER" ? null : (
              <Accordion
                id="acc-regions"
                icon={Globe}
                title={ar ? "المناطق / الأنواع" : "Regions / types"}
                badge={form.regions.length ? (ar ? `${form.regions.length} مناطق` : `${form.regions.length} regions`) : ar ? "بدون مناطق" : "None"}
                active={form.regions.length > 0}
                open={Boolean(openSec.regions)}
                onToggle={() => toggleSec("regions")}
              >
                <p className="text-[11px] leading-relaxed text-muted">
                  {ar
                    ? "مثل: أمريكي، إماراتي، تركي — أو Plus / Go. يختار الزبون المنطقة أولاً ثم تظهر أحجامها. اتركها فارغة إن لم تحتج إليها."
                    : "e.g. USA, UAE, Turkey — or Plus / Go. The customer picks one first, then sees its sizes. Leave empty if not needed."}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {form.regions.map((region, index) => {
                    const setRegion = (partial: Partial<ServiceRegion>) =>
                      patch({ regions: form.regions.map((item) => (item.id === region.id ? { ...item, ...partial } : item)) });
                    const sizes = form.packages.filter((pack) => pack.regionId === region.id).length;
                    return (
                      <div key={region.id} className="cf-row grid min-w-0 grid-cols-[1fr_1fr_auto] items-center gap-1.5 rounded-[14px] p-1.5">
                        <input className="field" dir="rtl" placeholder={`المنطقة ${index + 1}`} aria-label={`اسم المنطقة ${index + 1}`} value={region.nameAr} onChange={(event) => setRegion({ nameAr: event.target.value })} />
                        <input className="field" dir="ltr" placeholder={`Region ${index + 1}`} aria-label={`Region ${index + 1} name`} value={region.nameEn} onChange={(event) => setRegion({ nameEn: event.target.value })} />
                        <button
                          type="button"
                          onClick={() => {
                            patch({
                              regions: form.regions.filter((item) => item.id !== region.id),
                              packages: form.packages.map((pack) => (pack.regionId === region.id ? { ...pack, regionId: "" } : pack)),
                            });
                            if (editRegion === region.id) setEditRegion("");
                          }}
                          aria-label={ar ? `حذف المنطقة ${index + 1} (${sizes} حجم)` : `Delete region ${index + 1} (${sizes} sizes)`}
                          className="grid size-10 place-items-center rounded-[10px] border border-rose-400/40 text-rose-500"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={form.regions.length >= MAX_REGIONS}
                  onClick={() => patch({ regions: [...form.regions, { id: `rgn-${crypto.randomUUID().slice(0, 8)}`, nameAr: "", nameEn: "" }] })}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-full border border-[#0284c7]/40 px-4 text-sm font-semibold disabled:opacity-50"
                >
                  <Plus className="size-4" /> {ar ? "إضافة منطقة / نوع" : "Add region / type"}{" "}
                  <span className="text-[11px] text-muted tabular-nums">
                    {form.regions.length}/{MAX_REGIONS}
                  </span>
                </button>
              </Accordion>
            )}

            {form.serviceMode === "POINT_COUNTER" ? null : (
              <Accordion
                id="acc-packs"
                icon={Layers}
                title={ar ? `الباقات والأسعار — حتى ${MAX_PACKAGES} باقة` : `Packages & prices — up to ${MAX_PACKAGES}`}
                badge={packsBadge(form.packages.length, ar)}
                active={form.packages.length > 0}
                open={Boolean(openSec.packs)}
                onToggle={() => toggleSec("packs")}
              >
                {form.regions.length ? (
                  <div className="mb-2 flex flex-wrap gap-1.5" role="tablist" aria-label={ar ? "أحجام كل منطقة" : "Sizes per region"}>
                    {[{ id: "", nameAr: "الكل", nameEn: "All" }, ...form.regions].map((region) => {
                      const count = region.id ? form.packages.filter((pack) => pack.regionId === region.id).length : form.packages.length;
                      return (
                        <button
                          key={region.id || "all"}
                          type="button"
                          role="tab"
                          aria-selected={editRegion === region.id}
                          onClick={() => setEditRegion(region.id)}
                          className={`cf-toggle min-h-9 rounded-full px-3 text-xs font-bold ${editRegion === region.id ? "is-on" : ""}`}
                        >
                          {(ar ? region.nameAr || region.nameEn : region.nameEn || region.nameAr) || "—"} · {count}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  {form.packages.slice(0, MAX_PACKAGES).map((pack, index) => {
                    const more = openPack === pack.key;
                    return (
                      <div key={pack.key} className={`pk-row min-w-0 rounded-[14px] p-1.5 ${editRegion && pack.regionId !== editRegion ? "hidden" : ""}`}>
                        {/* v33 order inspector, compact: number + ↑ / ↓ (the shop shows sizes in this order). */}
                        <div className="pk-ord">
                          <label className="sr-only" htmlFor={`order-${pack.key}`}>
                            {ar ? "ترتيب الباقة" : "Package order"}
                          </label>
                          <input
                            id={`order-${pack.key}`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={form.packages.length}
                            value={index + 1}
                            onChange={(event) => movePack(pack.key, Number(event.target.value) - 1)}
                            className="pack-order-input h-10 w-11 rounded-[10px] text-center text-sm font-extrabold tabular-nums"
                          />
                          <span className="flex gap-1">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => movePack(pack.key, neighbour(index, -1))}
                              aria-label={ar ? `تحريك الباقة ${index + 1} للأعلى` : `Move package ${index + 1} up`}
                              className="pack-order-btn grid h-10 w-9 place-items-center rounded-[10px] disabled:opacity-35"
                            >
                              <ArrowUp className="size-4" strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              disabled={index === form.packages.length - 1}
                              onClick={() => movePack(pack.key, neighbour(index, 1))}
                              aria-label={ar ? `تحريك الباقة ${index + 1} للأسفل` : `Move package ${index + 1} down`}
                              className="pack-order-btn grid h-10 w-9 place-items-center rounded-[10px] disabled:opacity-35"
                            >
                              <ArrowDown className="size-4" strokeWidth={2} />
                            </button>
                          </span>
                        </div>
                        <input
                          className="field pk-name"
                          aria-label={ar ? `اسم الباقة ${index + 1}` : `Package ${index + 1} name`}
                          placeholder={ar ? "الاسم، مثال: 60 UC" : "Name, e.g. 60 UC"}
                          value={pack.sizeName}
                          onChange={(event) => patchPack(pack.key, { sizeName: event.target.value })}
                        />
                        <label className="pk-money pk-usd">
                          <span aria-hidden>$</span>
                          <input className="field" dir="ltr" inputMode="decimal" placeholder="4.99" aria-label={`${t.priceUsdNormal} · ${index + 1}`} value={pack.normal} onChange={(event) => patchPack(pack.key, { normal: event.target.value })} />
                        </label>
                        <label className="pk-money pk-vip is-vip">
                          <span aria-hidden>VIP</span>
                          <input className="field" dir="ltr" inputMode="decimal" placeholder="3.99" aria-label={`${t.priceUsdVip} · ${index + 1}`} value={pack.vip} onChange={(event) => patchPack(pack.key, { vip: event.target.value })} />
                        </label>
                        <button
                          type="button"
                          aria-expanded={more}
                          aria-controls={`pk-more-${pack.key}`}
                          onClick={() => setOpenPack(more ? null : pack.key)}
                          aria-label={ar ? `خيارات الباقة ${index + 1} (ليرة، منطقة، API)` : `Package ${index + 1} options (SYP, region, API)`}
                          className={`pk-more grid size-10 place-items-center rounded-[10px] border ${more ? "border-[#0284c7] bg-sky-500/10 text-sky-700 dark:text-sky-300" : "border-white/10 text-muted"}`}
                        >
                          <SlidersHorizontal className="size-4" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          disabled={form.packages.length === 1}
                          onClick={() => patch({ packages: form.packages.filter((item) => item.key !== pack.key) })}
                          aria-label={ar ? `حذف الباقة ${index + 1}` : `Delete package ${index + 1}`}
                          className="pk-del grid size-10 place-items-center rounded-[10px] border border-rose-400/40 text-rose-500 disabled:opacity-35"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                        {pack.mega ? (
                          <p className={`pk-mega ${pack.mega.active ? "" : "is-off"}`} title={pack.mega.name}>
                            <span className="pk-mega-dot" aria-hidden />
                            <span className="truncate">
                              Mega #{pack.mega.id}
                              {pack.mega.cost != null ? ` · $${pack.mega.cost.toFixed(2)}` : ""}
                              {" · "}
                              {pack.mega.active ? (ar ? "السعر يتحدث تلقائياً" : "price auto-updates") : ar ? "غير متوفر حالياً" : "unavailable now"}
                            </span>
                          </p>
                        ) : null}
                        {more ? (
                          <div id={`pk-more-${pack.key}`} className="pk-adv grid min-w-0 grid-cols-2 gap-1.5 rounded-[10px] bg-white/[0.04] p-1.5">
                            {form.regions.length ? (
                              <label className="pf-label col-span-2">
                                {ar ? "المنطقة / النوع" : "Region / type"}
                                <select className="field mt-1" value={pack.regionId} onChange={(event) => patchPack(pack.key, { regionId: event.target.value })}>
                                  <option value="">{ar ? "كل المناطق" : "Every region"}</option>
                                  {form.regions.map((region) => (
                                    <option key={region.id} value={region.id}>
                                      {(ar ? region.nameAr || region.nameEn : region.nameEn || region.nameAr) || "—"}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}
                            {form.serviceMode === "VAULT" ? null : (
                              <div className="pk-fields col-span-2 rounded-[10px] p-1.5">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={Boolean(pack.fields)}
                                  onClick={() => patchPack(pack.key, { fields: pack.fields ? null : form.customFields.map((field) => ({ ...field, id: `f-${crypto.randomUUID().slice(0, 8)}` })) })}
                                  className={`cf-toggle min-h-10 w-full rounded-full px-3 text-xs font-bold ${pack.fields ? "is-on" : ""}`}
                                >
                                  {pack.fields
                                    ? ar
                                      ? "✓ معلومات خاصة بهذا الحجم (اضغط للعودة لمعلومات الخدمة)"
                                      : "✓ This size asks its own info (tap to use the service's)"
                                    : ar
                                      ? "معلومات مطلوبة مختلفة لهذا الحجم (اختياري)"
                                      : "Different required info for this size (optional)"}
                                </button>
                                {pack.fields ? (
                                  <div className="mt-1.5">
                                    <FieldsEditor ar={ar} compact fields={pack.fields} onChange={(fields) => patchPack(pack.key, { fields })} />
                                  </div>
                                ) : null}
                              </div>
                            )}
                            <label className="pf-label">
                              {t.priceSypNormal}
                              <input className="field mt-1" placeholder="auto" dir="ltr" inputMode="decimal" value={pack.normalSyp} onChange={(event) => patchPack(pack.key, { normalSyp: event.target.value })} />
                            </label>
                            <label className="pf-label">
                              {t.priceSypVip}
                              <input className="field mt-1" placeholder="auto" dir="ltr" inputMode="decimal" value={pack.vipSyp} onChange={(event) => patchPack(pack.key, { vipSyp: event.target.value })} />
                            </label>
                            <button
                              type="button"
                              className="col-span-2 min-h-10 rounded-full border border-[#0284c7]/40 px-3 text-xs font-bold"
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
                            <p className="col-span-2 text-[11px] text-muted">{t.priceSypAuto}</p>
                            {form.serviceMode === "VAULT" ? null : (
                              <>
                                <label className="pf-label col-span-2 sm:col-span-1">
                                  API endpoint
                                  <input className="field mt-1" dir="ltr" placeholder="https://api.example.com/topup" value={pack.apiEndpoint} onChange={(event) => patchPack(pack.key, { apiEndpoint: event.target.value })} />
                                </label>
                                <label className="pf-label col-span-2 sm:col-span-1">
                                  Secret code
                                  <input className="field mt-1" dir="ltr" placeholder="API secret code" autoComplete="off" value={pack.apiSecretCode} onChange={(event) => patchPack(pack.key, { apiSecretCode: event.target.value })} />
                                </label>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={form.packages.length >= MAX_PACKAGES}
                  onClick={() => patch({ packages: [...form.packages, blankPack(editRegion)] })}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-full border border-[#0284c7]/40 px-4 text-sm font-semibold disabled:opacity-50"
                >
                  <Plus className="size-4" />{" "}
                  {editRegion
                    ? ar
                      ? `إضافة حجم إلى «${form.regions.find((region) => region.id === editRegion)?.nameAr || form.regions.find((region) => region.id === editRegion)?.nameEn || ""}»`
                      : `Add size to “${form.regions.find((region) => region.id === editRegion)?.nameEn || form.regions.find((region) => region.id === editRegion)?.nameAr || ""}”`
                    : ar
                      ? "إضافة حجم / باقة"
                      : "Add size / package"}{" "}
                  <span className="text-[11px] text-muted tabular-nums">
                    {form.packages.length}/{MAX_PACKAGES}
                  </span>
                </button>
              </Accordion>
            )}

            {error ? (
              <p className="text-sm font-semibold text-rose-600 dark:text-rose-300" role="alert">
                {error}
              </p>
            ) : null}
            {/* v35: the actions stay in reach while scrolling a long form. */}
            <div className="svc-footer sticky bottom-[-14px] z-10 -mx-3.5 flex gap-2 px-3.5 pt-2 pb-3.5 sm:bottom-[-24px] sm:-mx-6 sm:px-6 sm:pb-6">
              <button type="button" disabled={busy} onClick={() => void save()} className="btn-glow keep-white min-h-12 flex-1 rounded-full px-5 text-sm font-bold text-white disabled:opacity-60">
                {busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : ar ? "حفظ الخدمة" : "Save service"}
              </button>
              {form.id ? (
                <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-12 rounded-full border border-rose-400/50 px-4 text-sm font-semibold text-rose-600 dark:text-rose-300">
                  {ar ? "حذف" : "Delete"}
                </button>
              ) : null}
              <button type="button" disabled={busy} onClick={closeServiceModal} className="min-h-12 rounded-full border border-slate-300 px-4 text-sm font-semibold dark:border-white/15">
                {ar ? "إلغاء" : "Cancel"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small top label + control (keeps rows short). */
function CompactField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 text-[11px] font-bold text-muted">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

/** v35: segmented pill selector (one row instead of stacked option blocks). */
function Segmented({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; icon?: LucideIcon }>;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="min-w-0" role="radiogroup" aria-label={label}>
      <p className="text-[11px] font-bold text-muted">{label}</p>
      <div className="seg-track mt-1 grid gap-1 rounded-[16px] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => {
          const on = option.value === value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(option.value)}
              className={`seg-pill inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-[12px] px-2 text-xs font-bold ${on ? "is-on" : ""}`}
            >
              {Icon ? <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden /> : null}
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

/** v35: one-tap collapsible section with a live count badge. */
function Accordion({
  id,
  icon: Icon,
  title,
  badge,
  active = false,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  badge: string;
  active?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`acc min-w-0 rounded-[22px] ${open ? "is-open" : ""}`}>
      <button
        type="button"
        id={`${id}-head`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="acc-head flex min-h-[52px] w-full min-w-0 items-center gap-2 rounded-[22px] px-3 text-start"
      >
        <Icon className="size-4 shrink-0 text-sky-600 dark:text-sky-300" strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{title}</span>
        <span className={`acc-badge shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${active ? "is-active" : ""}`}>{badge}</span>
        <ChevronDown className="acc-chevron size-4 shrink-0" aria-hidden />
      </button>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-head`} className="acc-panel" inert={!open}>
        <div className="acc-inner">
          <div className="px-2 pb-2">{children}</div>
        </div>
      </div>
    </section>
  );
}

function fieldsBadge(count: number, ar: boolean): string {
  if (!count) return ar ? "خانة المعرّف المعتادة" : "Usual ID box";
  if (!ar) return `${count} required field${count === 1 ? "" : "s"}`;
  return count === 1 ? "حقل واحد مطلوب" : count === 2 ? "حقلان مطلوبان" : `${count} حقول مطلوبة`;
}

function packsBadge(count: number, ar: boolean): string {
  if (!ar) return `${count} package${count === 1 ? "" : "s"} added`;
  if (count === 0) return "لا توجد باقات";
  return count === 1 ? "باقة واحدة مضافة" : count === 2 ? "باقتان مضافتان" : count <= 10 ? `${count} باقات مضافة` : `${count} باقة مضافة`;
}
