"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Heart } from "lucide-react";
import { BannerCarousel } from "@/components/store/BannerCarousel";
import { ServiceCard } from "@/components/store/ServiceCard";
import { ServiceFormModal } from "@/components/admin/ServiceFormModal";
import { CATEGORIES, type CategorySlug } from "@/lib/constants";
import { toggleFavoriteAction } from "@/app/actions";
import { deleteServiceAction, getServiceForEditAction } from "@/app/admin/services/actions";
import type { StoreService } from "@/lib/types";
import type { ServiceFormInput } from "@/lib/validation";

export function Storefront({
  services,
  isAdmin,
  initialTab = "all",
  showBanner = true,
  heading,
}: {
  services: StoreService[];
  isAdmin: boolean;
  initialTab?: "all" | CategorySlug;
  showBanner?: boolean;
  heading?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").toLowerCase().trim();

  const [tab, setTab] = useState<"all" | CategorySlug>(initialTab);
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(services.filter((s) => s.is_favorite).map((s) => s.id))
  );
  const [editing, setEditing] = useState<ServiceFormInput | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const visible = useMemo(() => {
    const list = services.filter((s) => {
      if (tab !== "all" && s.category !== tab) return false;
      if (favOnly && !favorites.has(s.id)) return false;
      if (query && !`${s.name} ${s.category}`.toLowerCase().includes(query)) return false;
      return true;
    });
    // Pin favorites to the top (stable otherwise).
    return [...list].sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
  }, [services, tab, favOnly, favorites, query]);

  async function toggleFavorite(id: string) {
    const was = favorites.has(id);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (was) next.delete(id);
      else next.add(id);
      return next;
    });
    const res = await toggleFavoriteAction(id);
    if (!res.success) {
      // roll back
      setFavorites((prev) => {
        const next = new Set(prev);
        if (was) next.add(id);
        else next.delete(id);
        return next;
      });
      setMessage(res.error);
    }
  }

  async function openEdit(id: string) {
    setMessage(null);
    const res = await getServiceForEditAction(id);
    if (!res.success) setMessage(res.error);
    else setEditing(res.data);
  }

  async function remove(service: StoreService) {
    if (!window.confirm(`Delete “${service.name}” and all of its packages? This cannot be undone.`)) return;
    const res = await deleteServiceAction(service.id);
    if (!res.success) setMessage(res.error);
    else router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {showBanner && <BannerCarousel />}

      {heading && <h1 className="font-display text-2xl font-medium">{heading}</h1>}

      <div className="flex flex-wrap items-center gap-2">
        {[{ slug: "all" as const, label: "All" }, ...CATEGORIES].map((c) => (
          <button
            key={c.slug}
            onClick={() => setTab(c.slug)}
            aria-pressed={tab === c.slug}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              tab === c.slug
                ? "border-violet bg-violet/20 text-text shadow-neon"
                : "border-white/10 bg-white/5 text-muted hover:text-text"
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => setFavOnly((v) => !v)}
          aria-pressed={favOnly}
          className={`ml-auto flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm transition-colors ${
            favOnly
              ? "border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-300"
              : "border-white/10 bg-white/5 text-muted hover:text-text"
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${favOnly ? "fill-fuchsia-400" : ""}`} /> Favorites
        </button>
      </div>

      {message && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {message}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="py-16 text-center text-muted">
          {favOnly ? "No favorites yet — tap the heart on a game to pin it here." : "No services match your search."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              isFavorite={favorites.has(s.id)}
              isAdmin={isAdmin}
              onToggleFavorite={() => toggleFavorite(s.id)}
              onEdit={() => openEdit(s.id)}
              onDelete={() => remove(s)}
            />
          ))}
        </div>
      )}

      {editing && <ServiceFormModal initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
