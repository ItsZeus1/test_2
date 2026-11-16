"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { getHeroBanners, setHeroBanners } from "@/lib/store/api";
import { useNovaUi } from "@/lib/ui-store";

const MAX_BYTES = 2 * 1024 * 1024;

/** Add / upload / reorder / delete hero offer photos. Used in the admin panel and the hero modal. */
export function HeroPhotoManager({ onSaved }: { onSaved?: () => void }) {
  const { t } = useI18n();
  const [items, setItems] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getHeroBanners().then(setItems);
  }, []);

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    setItems(next);
  }

  function addUrl() {
    const value = url.trim();
    if (!value.startsWith("https://")) {
      toast.error(t.heroAddUrl);
      return;
    }
    setItems((current) => [...current, value].slice(0, 12));
    setUrl("");
  }

  function upload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_BYTES) {
      toast.error(t.heroTooBig);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setItems((current) => [...current, reader.result as string].slice(0, 12));
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    try {
      const result = await setHeroBanners({ banners: items });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t.heroSaved);
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-muted">{t.heroPhotosHint}</p>
      {items.length === 0 ? <p className="mt-3 text-sm text-muted">{t.heroEmpty}</p> : null}
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((src, position) => (
          <li key={`${position}-${src.slice(0, 32)}`} className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2">
            <img src={src} alt="" className="h-14 w-24 shrink-0 rounded-xl object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs text-muted" dir="ltr">
              {position + 2}. {src.startsWith("data:") ? "upload" : src}
            </span>
            <button type="button" aria-label={t.moveUp} onClick={() => move(position, position - 1)} className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10">
              <ArrowUp className="size-4" />
            </button>
            <button type="button" aria-label={t.moveDown} onClick={() => move(position, position + 1)} className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10">
              <ArrowDown className="size-4" />
            </button>
            <button
              type="button"
              aria-label={t.delete}
              onClick={() => setItems((current) => current.filter((_, i) => i !== position))}
              className="grid size-9 shrink-0 place-items-center rounded-full border border-rose-300/40 text-rose-100"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="field min-w-0 flex-1"
          dir="ltr"
          placeholder="https://cdn.example.com/offer.jpg"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="button" onClick={addUrl} className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold">
          {t.heroAddUrl}
        </button>
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-white/15 px-4 text-sm font-semibold">
          <Upload className="size-4" />
          {t.heroUpload}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => {
              upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <button type="button" disabled={busy} onClick={() => void save()} className="btn-glow mt-3 min-h-11 rounded-full px-5 text-sm font-semibold disabled:opacity-60">
        {busy ? t.saving : t.heroSave}
      </button>
    </div>
  );
}

/** Modal opened from the hero's admin-only "Edit Hero Photos" button. */
export function HeroManagerModal() {
  const { t } = useI18n();
  const open = useNovaUi((state) => state.heroManagerOpen);
  const setOpen = useNovaUi((state) => state.setHeroManagerOpen);
  if (!open) return null;
  return (
    <div data-lenis-prevent className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={t.heroPhotosTitle} className="nova-grid-border glass my-auto w-full max-w-2xl rounded-3xl p-4 sm:p-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-display text-xl font-extrabold">{t.heroPhotosTitle}</h2>
          <button type="button" aria-label={t.close} onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full border border-white/10">
            <X className="size-4" />
          </button>
        </div>
        <HeroPhotoManager onSaved={() => setOpen(false)} />
      </div>
    </div>
  );
}
