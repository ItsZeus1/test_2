import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { deleteServiceAction, getAdminService, getStoreSettings, saveServiceAction } from "@/lib/store/api";
import { PRESET_COVERS } from "@/lib/store/data";
import { DEFAULT_SYP_RATE, centsToField as sypToField, dollarsToCents, formatSyp, usdToSypCents } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, type Category } from "@/lib/store/types";

type PackDraft = {
  key: string;
  id?: string;
  sizeName: string;
  /** USD */
  normal: string;
  vip: string;
  /** New Syrian Pound; blank = auto from USD x rate */
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
    instructions: "",
    badge: "",
    imageUrl: "",
    packages: [blankPack()],
  };
}

export function ServiceFormModal() {
  const serviceModal = useNovaUi((state) => state.serviceModal);
  const closeServiceModal = useNovaUi((state) => state.closeServiceModal);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [slugLocked, setSlugLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sypRate, setSypRate] = useState(DEFAULT_SYP_RATE);

  useEffect(() => {
    if (!serviceModal) return;
    void getStoreSettings()
      .then((settings) => setSypRate(settings.sypRate))
      .catch(() => undefined);
  }, [serviceModal]);

  useEffect(() => {
    if (!serviceModal) return;
    let cancel = false;
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
        instructions: service.instructions,
        badge: service.badge ?? "",
        imageUrl: service.imageUrl || "",
        packages: service.packages.map((pack) => ({
          key: pack.id,
          id: pack.id,
          sizeName: pack.sizeName,
          normal: centsToField(pack.normalPriceCents),
          vip: centsToField(pack.vipPriceCents),
          normalSyp: sypToField(pack.normalPriceSypCents),
          vipSyp: sypToField(pack.vipPriceSypCents),
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
    for (const pack of form.packages) {
      const normalPriceCents = dollarsToCents(pack.normal);
      const vipPriceCents = dollarsToCents(pack.vip);
      if (normalPriceCents == null || vipPriceCents == null) {
        setError("Each charge size needs USD prices like 4.99");
        return;
      }
      const normalPriceSypCents = pack.normalSyp.trim() ? dollarsToCents(pack.normalSyp) : 0;
      const vipPriceSypCents = pack.vipSyp.trim() ? dollarsToCents(pack.vipSyp) : 0;
      if (normalPriceSypCents == null || vipPriceSypCents == null) {
        setError("SYP prices must be numbers like 1200 (or leave blank to use the rate).");
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

  /** Fills every SYP field from USD x the store rate (admin can still edit them after). */
  function fillSypFromRate() {
    setForm((current) => ({
      ...current,
      packages: current.packages.map((pack) => {
        const usd = dollarsToCents(pack.normal);
        const vip = dollarsToCents(pack.vip);
        return {
          ...pack,
          normalSyp: usd == null ? pack.normalSyp : sypToField(usdToSypCents(usd, sypRate)),
          vipSyp: vip == null ? pack.vipSyp : sypToField(usdToSypCents(vip, sypRate)),
        };
      }),
    }));
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4 backdrop-blur-md" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-form-title"
        className="glass nova-grid-border mx-auto my-4 w-full max-w-3xl rounded-[1.75rem] border border-violet/30 p-5 shadow-[0_0_50px_-16px_rgba(139,92,246,0.9)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ServiceMark slug={form.slug || "new-slug"} category={form.category} name={form.name || "New"} imageUrl={form.imageUrl} />
            <div>
              <p className="text-[11px] font-bold tracking-[0.18em] text-violet uppercase">
                {serviceModal.mode === "create" ? "New slug" : "Edit slug"}
              </p>
              <h2 id="service-form-title" className="font-display text-3xl font-extrabold">
                <span className="text-gradient">{form.name || "Add service"}</span>
              </h2>
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={closeServiceModal} className="grid size-11 place-items-center rounded-full border border-white/10">
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
              <Field label="Arabic name · الاسم بالعربية">
                <input className="field" dir="rtl" value={form.nameAr} onChange={(event) => patch({ nameAr: event.target.value })} />
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
            <Field label="Arabic description · الوصف بالعربية">
              <textarea
                className="field min-h-20"
                dir="rtl"
                value={form.descriptionAr}
                onChange={(event) => patch({ descriptionAr: event.target.value })}
              />
            </Field>
            <Field label="Checkout instructions">
              <textarea className="field min-h-20" value={form.instructions} onChange={(event) => patch({ instructions: event.target.value })} />
            </Field>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl font-extrabold">Cover image</h3>
                {form.imageUrl ? (
                  <button type="button" className="text-xs font-bold text-muted" onClick={() => patch({ imageUrl: "" })}>
                    Clear
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs font-bold tracking-[0.16em] text-muted uppercase">Preset icons</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {PRESET_COVERS.map((preset) => {
                  const active = form.imageUrl === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      title={preset.label}
                      onClick={() => patch({ imageUrl: preset.url })}
                      className={`grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl border ${active ? "border-violet" : "border-white/10"}`}
                    >
                      <img src={preset.url} alt={preset.label} className="size-full object-cover" />
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-white/15 px-3 text-sm font-semibold">
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
                      // Shrink to a compact icon so the base64 fits in the online database row.
                      void compressImage(file)
                        .then((value) => patch({ imageUrl: value }))
                        .catch(() => setError("That image could not be read. Try a PNG, JPG or WebP."));
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

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-xl font-extrabold">Charge sizes</h3>
                <p className="text-xs text-muted">
                  Prices in USD ($) and New Syrian Pound (ل.س). Blank SYP = USD × {sypRate} (1 USD = {formatSyp(sypRate * 100, "en")}).
                </p>
              </div>
              <button
                type="button"
                onClick={fillSypFromRate}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-white/15 px-3 text-sm font-semibold"
              >
                Fill SYP from rate
              </button>
              <button
                type="button"
                disabled={form.packages.length >= 12}
                onClick={() => patch({ packages: [...form.packages, blankPack()] })}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-violet/40 px-3 text-sm font-semibold"
              >
                <Plus className="size-4" /> Add size
              </button>
            </div>

            <div className="grid gap-3">
              {form.packages.map((pack, index) => (
                <div key={pack.key} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className="field" placeholder="Size name" value={pack.sizeName} onChange={(event) => patchPack(pack.key, { sizeName: event.target.value })} />
                    <input className="field" placeholder="API secret code" value={pack.apiSecretCode} onChange={(event) => patchPack(pack.key, { apiSecretCode: event.target.value })} />
                    <PriceInput label="Normal · USD $" placeholder="4.99" value={pack.normal} onChange={(value) => patchPack(pack.key, { normal: value })} />
                    <PriceInput label="VIP · USD $" placeholder="3.99" value={pack.vip} onChange={(value) => patchPack(pack.key, { vip: value })} />
                    <PriceInput
                      label="Normal · SYP ل.س"
                      placeholder={autoSyp(pack.normal, sypRate)}
                      value={pack.normalSyp}
                      onChange={(value) => patchPack(pack.key, { normalSyp: value })}
                    />
                    <PriceInput
                      label="VIP · SYP ل.س"
                      placeholder={autoSyp(pack.vip, sypRate)}
                      value={pack.vipSyp}
                      onChange={(value) => patchPack(pack.key, { vipSyp: value })}
                    />
                    <input
                      className="field sm:col-span-2"
                      placeholder="https://api.example.com/topup"
                      value={pack.apiEndpoint}
                      onChange={(event) => patchPack(pack.key, { apiEndpoint: event.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>

            {error ? <p className="text-sm text-rose-200">{error}</p> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" disabled={busy} onClick={() => void save()} className="btn-glow min-h-12 flex-1 rounded-full px-5 text-sm font-semibold disabled:opacity-60">
                {busy ? "Saving…" : "Save service"}
              </button>
              {form.id ? (
                <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-12 rounded-full border border-rose-300/40 px-5 text-sm font-semibold text-rose-100">
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

async function compressImage(file: File, max = 384): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("read")));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("decode"));
    element.src = source;
  });
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", 0.86);
  const output = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  return output.length < source.length ? output : source;
}

function autoSyp(usd: string, rate: number): string {
  const cents = dollarsToCents(usd);
  return cents == null ? "auto" : `auto ${sypToField(usdToSypCents(cents, rate)) || "0"}`;
}

function PriceInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold tracking-[0.12em] text-muted uppercase">
      {label}
      <input
        className="field mt-1 font-normal tracking-normal normal-case"
        dir="ltr"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
