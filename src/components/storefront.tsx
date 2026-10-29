import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Search, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { OffersTicker } from "@/components/offers-ticker";
import { ServiceMark } from "@/components/service-mark";
import { useProfileState } from "@/components/profile";
import { badgeText, categoryName, serviceText, useI18n } from "@/lib/i18n";
import { deleteServiceAction, getPublicCatalog, getViewerCatalog, onStoreChange } from "@/lib/store/api";
import { formatUsd } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, type CatalogService, type Category } from "@/lib/store/types";

type Filter = "all" | Category;

const FILTERS: Filter[] = ["all", ...CATEGORIES.map((item) => item.slug)];

export function Storefront({ category = "all" }: { category?: Filter }) {
  const { language, t } = useI18n();
  const { profile } = useProfileState();
  const openEditService = useNovaUi((state) => state.openEditService);
  const [filter, setFilter] = useState<Filter>(category);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const isAdmin = profile?.role === "ADMIN";

  useEffect(() => {
    setFilter(category);
  }, [category]);

  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const rows = profile ? await getViewerCatalog() : await getPublicCatalog();
        if (!cancel) {
          setCatalog(rows);
          setError(null);
        }
      } catch (caught) {
        if (!cancel) setError(caught instanceof Error ? caught.message : t.catalogUnavailable);
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    void load();
    const stop = onStoreChange(() => {
      void load();
    });
    return () => {
      cancel = true;
      stop();
    };
  }, [profile]);

  const needle = query.trim().toLowerCase();
  const visible = catalog.filter((service) => {
    if (filter !== "all" && service.category !== filter) return false;
    if (!needle) return true;
    return (
      service.name.toLowerCase().includes(needle) ||
      service.nameAr.toLowerCase().includes(needle) ||
      service.slug.includes(needle) ||
      service.description.toLowerCase().includes(needle) ||
      service.descriptionAr.toLowerCase().includes(needle)
    );
  });

  async function remove(slug: string) {
    const result = await deleteServiceAction({ slug });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPendingSlug(null);
    toast.success(t.removed);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <section className="hero-surface relative overflow-hidden rounded-[1.5rem] px-4 py-8 sm:rounded-[2rem] sm:px-10 sm:py-12">
        <div className="glass float-y absolute top-6 end-6 hidden max-w-[14rem] rounded-2xl px-4 py-3 lg:block">
          <p className="text-[10px] font-bold tracking-[0.18em] text-fuchsia uppercase">{t.hotDrop}</p>
          <p className="text-sm font-semibold">{t.hotDropBody}</p>
        </div>
        <div className="glass float-y float-delay absolute bottom-6 end-8 hidden max-w-[14rem] rounded-2xl px-4 py-3 lg:block">
          <p className="text-[10px] font-bold tracking-[0.18em] text-violet uppercase">{t.rolePrice}</p>
          <p className="text-sm font-semibold">{profile?.role === "VIP" || profile?.role === "ADMIN" ? t.vipUnlocked : t.standardRate}</p>
        </div>
        <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.22em] text-fuchsia uppercase">
          <Zap className="size-3.5" /> {t.storeKicker}
        </p>
        <h1 className="mt-3 max-w-xl font-display text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
          <span className="text-gradient">{t.storeTitle}</span>
        </h1>
        <p className="mt-3 max-w-lg text-sm text-muted sm:text-base">{t.storeLead}</p>
        <label className="glass mt-6 flex min-h-12 max-w-xl items-center gap-2 rounded-full px-4">
          <Search className="size-4 shrink-0 text-violet" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchPh}
            className="h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </label>
      </section>

      <OffersTicker className="mt-4 sm:mt-5" />

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((id) => {
          const active = filter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${active ? "keep-white bg-gradient-to-r from-indigo to-violet text-white shadow-[0_8px_20px_-8px_rgba(79,70,229,0.6)]" : "border border-white/10 bg-white/5 text-muted hover:text-white"}`}
            >
              {id === "all" ? t.all : categoryName(t, id)}
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-6 text-sm text-fuchsia">{error}</p> : null}

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="glass mt-6 rounded-3xl px-5 py-10 text-center text-sm text-muted">{t.noMatch}</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((service) => (
            <article
              key={service.id}
              className="tilt-card glass group relative flex h-full min-h-[17rem] flex-col rounded-3xl p-4 hover:shadow-[0_0_28px_-8px_rgba(139,92,246,0.85)]"
            >
              <Link to="/service/$slug" params={{ slug: service.slug }} className="flex flex-1 flex-col">
                <div className="flex items-start gap-3">
                  <ServiceMark slug={service.slug} category={service.category} name={serviceText(language, service).name} imageUrl={service.imageUrl} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-[0.16em] text-violet uppercase">{categoryName(t, service.category)}</p>
                    <h2 className="truncate font-display text-lg font-extrabold sm:text-xl">{serviceText(language, service).name}</h2>
                    {service.badge ? (
                      <span className="mt-1 inline-flex rounded-full border border-fuchsia/40 bg-fuchsia/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-fuchsia-100 uppercase">
                        {badgeText(t, service.badge)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted">{serviceText(language, service).description}</p>
                <p className="mt-4 text-sm">
                  <span className="text-muted">{t.from} </span>
                  <span className="font-display text-lg font-extrabold tabular-nums">{formatUsd(service.startingPriceCents)}</span>
                  {service.rate === "vip" ? (
                    <span className="ms-2 rounded-full border border-amber-200/40 bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-amber-100">
                      VIP
                    </span>
                  ) : null}
                </p>
              </Link>
              {isAdmin ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditService(service.slug)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-white/10 text-xs font-bold hover:border-violet hover:shadow-[0_0_18px_-8px_rgba(139,92,246,0.9)]"
                  >
                    <Pencil className="size-3.5" /> {t.edit}
                  </button>
                  {pendingSlug === service.slug ? (
                    <button
                      type="button"
                      onClick={() => void remove(service.slug)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full keep-white bg-rose-500/90 text-xs font-bold text-white"
                    >
                      {t.confirmDelete}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingSlug(service.slug)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-rose-300/30 text-xs font-bold text-rose-100"
                    >
                      <Trash2 className="size-3.5" /> {t.delete}
                    </button>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
