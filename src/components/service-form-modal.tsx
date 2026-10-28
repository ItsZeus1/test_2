import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { deleteServiceAction, getAdminService, saveServiceAction } from "@/lib/store/api";
import { dollarsToCents } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, type Category } from "@/lib/store/types";

type PackDraft = {
  key: string;
  id?: string;
  sizeName: string;
  normal: string;
  vip: string;
  apiEndpoint: string;
  apiSecretCode: string;
};

type FormState = {
  id?: string;
  name: string;
  slug: string;
  category: Category;
  description: string;
  instructions: string;
  badge: string;
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
    apiEndpoint: "",
    apiSecretCode: "",
  };
}

function emptyForm(): FormState {
  return {
    name: "",
    slug: "",
    category: "games",
    description: "",
    instructions: "",
    badge: "",
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
        slug: service.slug,
        category: service.category,
        description: service.description,
        instructions: service.instructions,
        badge: service.badge ?? "",
        packages: service.packages.map((pack) => ({
          key: pack.id,
          id: pack.id,
          sizeName: pack.sizeName,
          normal: centsToField(pack.normalPriceCents),
          vip: centsToField(pack.vipPriceCents),
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
        setError("Each charge size needs prices like 4.99");
        return;
      }
      packages.push({
        id: pack.id,
        sizeName: pack.sizeName,
        normalPriceCents,
        vipPriceCents,
        apiEndpoint: pack.apiEndpoint.trim(),
        apiSecretCode: pack.apiSecretCode.trim(),
      });
    }
    setBusy(true);
    try {
      const result = await saveServiceAction({
        id: form.id,
        name: form.name,
        slug: form.slug,
        category: form.category,
        description: form.description,
        instructions: form.instructions,
        badge: form.badge,
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4 backdrop-blur-md" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-form-title"
        className="glass mx-auto my-4 w-full max-w-3xl rounded-[1.75rem] border border-violet/30 p-5 shadow-[0_0_50px_-16px_rgba(139,92,246,0.9)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ServiceMark slug={form.slug || "new-slug"} category={form.category} name={form.name || "New"} />
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
            <Field label="Checkout instructions">
              <textarea className="field min-h-20" value={form.instructions} onChange={(event) => patch({ instructions: event.target.value })} />
            </Field>

            <div className="mt-2 flex items-center justify-between">
              <h3 className="font-display text-xl font-extrabold">Charge sizes</h3>
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
                    <input className="field" placeholder="Normal price 4.99" inputMode="decimal" value={pack.normal} onChange={(event) => patchPack(pack.key, { normal: event.target.value })} />
                    <input className="field" placeholder="VIP price 3.99" inputMode="decimal" value={pack.vip} onChange={(event) => patchPack(pack.key, { vip: event.target.value })} />
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-1.5 font-normal">{children}</div>
    </label>
  );
}
