"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/lib/nav";
import { Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { useProfileState } from "@/components/profile";
import { OffersTicker } from "@/components/offers-ticker";
import { HeroCarousel } from "@/components/hero-carousel";
import { sellingPrice } from "@/components/vip-margin";
import { categoryName, serviceText, useI18n, useMoney } from "@/lib/i18n";
import { deleteServiceAction, getPublicCatalog, getViewerCatalog, onStoreChange } from "@/lib/store/api";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, type CatalogService, type Category } from "@/lib/store/types";

type Filter = "all" | Category;

const FILTERS: Filter[] = ["all", ...CATEGORIES.map((item) => item.slug)];

export function Storefront({ category = "all" }: { category?: Filter }) {
  const { t, language } = useI18n();
  const { profile } = useProfileState();
  const previewCurrency = useNovaUi((state) => state.previewCurrency);
  const openEditService = useNovaUi((state) => state.openEditService);
  // The category comes from the URL (/ or /category/[slug]); no in-page filter state.
  const filter = category;
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const isAdmin = profile?.role === "ADMIN";
  const armed = useNovaUi((state) => state.isHydratedAndVisible);
  const setArmed = useNovaUi((state) => state.setHydratedAndVisible);
  const [skeleton, setSkeleton] = useState<"show" | "fade" | "gone">(() => (armed ? "gone" : "show"));
  const mountedAt = useRef(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Startup skeleton: stays exactly 1 s minimum (until data + fonts are ready, capped at 1.5 s), then fades.
  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);
  useEffect(() => {
    if (skeleton !== "show" || loading) return;
    let cancel = false;
    const fonts = typeof document !== "undefined" && "fonts" in document ? document.fonts.ready : Promise.resolve();
    void Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 1500))]).then(() => {
      const left = Math.max(0, 1000 - (performance.now() - mountedAt.current));
      window.setTimeout(() => {
        if (!cancel) setSkeleton("fade");
      }, left);
    });
    return () => {
      cancel = true;
    };
  }, [skeleton, loading]);
  // The gate flips exactly when the fade-out ends (with a fallback if transitionend never fires).
  const finishSkeleton = useCallback(() => {
    setSkeleton("gone");
    setArmed(true);
  }, [setArmed]);
  useEffect(() => {
    if (skeleton !== "fade") return;
    const fallback = window.setTimeout(finishSkeleton, 450);
    return () => window.clearTimeout(fallback);
  }, [skeleton, finishSkeleton]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const rows = profile ? await getViewerCatalog() : await getPublicCatalog(previewCurrency);
        if (!cancel) {
          setCatalog(rows);
          setError(null);
        }
      } catch (caught) {
        if (!cancel) setError(caught instanceof Error ? caught.message : t.catalogError);
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
  }, [profile, previewCurrency]);

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

  const remove = useCallback(
    async (slug: string) => {
      const result = await deleteServiceAction({ slug });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPendingSlug(null);
      toast.success(t.removed);
    },
    [t],
  );

  return (
    <main className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      {skeleton !== "gone" ? (
        <StoreSkeleton fading={skeleton === "fade"} onFaded={finishSkeleton} />
      ) : null}
      <div className={skeleton === "show" ? "invisible" : ""}>
      <HeroCarousel />

      <OffersTicker className="mt-4" />

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((id, position) => {
          const pill = { id, label: id === "all" ? t.allServices : categoryName(t, id) };
          const active = filter === pill.id;
          return (
            <Link
              key={pill.id}
              {...(pill.id === "all" ? { to: "/" } : { to: "/category/$slug", params: { slug: pill.id } })}
              aria-current={active ? "page" : undefined}
              style={{ ["--btn-index" as string]: position }}
              className={`wave-pill relative inline-flex min-h-11 shrink-0 items-center overflow-hidden rounded-full px-4 text-sm font-semibold ${active ? "keep-white bg-gradient-to-r from-violet to-fuchsia text-white shadow-[0_0_22px_-6px_rgba(232,121,249,0.95)]" : "border border-white/10 bg-white/5 text-muted hover:text-white"}`}
            >
              {armed ? <span className="wave-sheen" aria-hidden /> : null}
              <span className="relative inline-flex min-h-11 items-center">{pill.label}</span>
            </Link>
          );
        })}
        {/* Compact search: an icon pill that expands inline */}
        <div
          className={`search-pill flex min-h-11 shrink-0 items-center overflow-hidden rounded-full border border-white/10 bg-white/5 transition-all duration-300 ease-out ${searchOpen || query ? "w-56 sm:w-72" : "w-11"}`}
        >
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={t.searchPh}
            className="grid size-11 shrink-0 place-items-center text-violet"
          >
            <Search className="size-4" />
          </button>
          <input
            ref={searchRef}
            value={query}
            tabIndex={searchOpen || query ? 0 : -1}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => {
              if (!query.trim()) setSearchOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                setSearchOpen(false);
              }
            }}
            placeholder={t.searchPh}
            className="h-11 w-full min-w-0 bg-transparent pe-3 text-sm outline-none placeholder:text-muted"
          />
        </div>
      </div>

      {/* Impulse strip: pulls attention straight into the grid */}
      <p className="impulse-strip mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-bold sm:text-sm">
        <span className="live-dot" aria-hidden />
        <span className="min-w-0 flex-1">
          {language === "ar" ? "⚡ تسليم فوري تلقائي بالثواني — اختر باقتك واشحن الآن" : "⚡ Automatic instant delivery in seconds — pick your pack and top up now"}
        </span>
      </p>

      {error ? <p className="mt-6 text-sm text-fuchsia">{error}</p> : null}

      {loading ? (
        <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-2xl bg-white/5 sm:h-52 sm:rounded-3xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="glass mt-6 rounded-3xl px-5 py-10 text-center text-sm text-muted">{t.noMatch}</p>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {visible.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              isAdmin={isAdmin}
              vipMargin={profile?.role === "VIP" ? profile.vipProfitMargin : 0}
              pending={pendingSlug === service.slug}
              onEdit={openEditService}
              onAskDelete={setPendingSlug}
              onDelete={remove}
            />
          ))}
        </div>
      )}
      </div>
    </main>
  );
}

/**
 * One catalog card. Memoized: typing in search or switching pages only re-renders cards whose props changed.
 */
const ServiceCard = memo(function ServiceCard({
  service,
  isAdmin,
  vipMargin,
  pending,
  onEdit,
  onAskDelete,
  onDelete,
}: {
  service: CatalogService;
  isAdmin: boolean;
  vipMargin: number;
  pending: boolean;
  onEdit: (slug: string) => void;
  onAskDelete: (slug: string | null) => void;
  onDelete: (slug: string) => Promise<void>;
}) {
  const { language, t } = useI18n();
  const money = useMoney();
  const copy = serviceText(language, service);
  const profile = vipMargin > 0 ? { role: "VIP" as const, vipProfitMargin: vipMargin } : null;
  return (
    <article
      key={service.id}
      className="card-lazy nova-grid-border studio-card tilt-card group relative flex h-full min-w-0 flex-col rounded-2xl p-2 sm:min-h-[17rem] sm:rounded-3xl sm:p-4"
              >
      <Link to="/service/$slug" params={{ slug: service.slug }} className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:items-start sm:gap-3 sm:text-start">
          <span className="icon-pedestal">
            <ServiceMark slug={service.slug} category={service.category} name={copy.name} imageUrl={service.imageUrl} size="card" />
          </span>
          <div className="min-w-0 max-w-full flex-1">
            <p className="hidden text-[11px] font-bold tracking-[0.16em] text-violet uppercase sm:block">{categoryName(t, service.category)}</p>
            <h2 className="item-name line-clamp-1 text-center text-xs font-bold sm:text-start sm:text-base lg:text-lg">{copy.name}</h2>
            {service.deliverySpeed === "MANUAL" ? (
              <span className="manual-badge mx-auto mt-1 inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold sm:mx-0 sm:px-2 sm:text-[10px]">
                {t.manualBadge}
              </span>
            ) : service.badge ? (
              <span className="mt-1 hidden rounded-full border border-fuchsia/40 bg-fuchsia/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-fuchsia-100 uppercase sm:inline-flex">
                {service.badge}
              </span>
            ) : null}
          </div>
        </div>
        <p className="mt-3 hidden text-sm text-muted sm:mb-3 sm:block sm:line-clamp-2">{copy.description}</p>
        <p className="price-pill price-capsule mx-auto mt-1.5 flex-wrap justify-center gap-x-1 text-center text-[11px] font-semibold sm:mx-0 sm:mt-auto sm:justify-start sm:text-start sm:text-sm">
          <span className="text-muted">{t.from}</span>
          <span className="price-num text-[12px] sm:text-base">{money(service.startingPriceCents, service.currency)}</span>
          {service.rate === "vip" ? (
            <span className="hidden rounded-full border border-amber-200/40 bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-amber-100 sm:inline">
              VIP
            </span>
          ) : null}
        </p>
        {profile?.role === "VIP" && profile.vipProfitMargin > 0 ? (
          <p className="mt-0.5 text-center text-[10px] font-bold text-emerald-500 tabular-nums sm:text-start sm:text-xs" dir="ltr">
            → {money(sellingPrice(service.startingPriceCents, profile.vipProfitMargin), service.currency)} (+{profile.vipProfitMargin}%)
          </p>
        ) : null}
      </Link>
      {isAdmin ? (
        <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
          <button
            type="button"
            aria-label={t.edit}
            onClick={() => onEdit(service.slug)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-white/10 text-xs font-bold hover:border-violet sm:min-h-11"
          >
            <Pencil className="size-3.5" /> <span className="hidden sm:inline">{t.edit}</span>
          </button>
          {pending ? (
            <button
              type="button"
              onClick={() => void onDelete(service.slug)}
              className="keep-white inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-rose-500/90 px-2 text-[11px] font-bold text-white sm:min-h-11 sm:text-xs"
            >
              {t.confirmDelete}
            </button>
          ) : (
            <button
              type="button"
              aria-label={t.delete}
              onClick={() => onAskDelete(service.slug)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-rose-300/30 text-xs font-bold text-rose-100 sm:min-h-11"
            >
              <Trash2 className="size-3.5" /> <span className="hidden sm:inline">{t.delete}</span>
            </button>
          )}
        </div>
      ) : null}
              </article>
  );
});

/** Layout-accurate placeholder for the first paint: hero, ticker, pills, 3-per-row grid. */
function StoreSkeleton({ fading, onFaded }: { fading: boolean; onFaded: () => void }) {
  return (
    <div
      className={`store-skeleton absolute inset-x-4 top-6 z-20 sm:inset-x-6 sm:top-10 lg:inset-x-8 ${fading ? "is-fading" : ""}`}
      onTransitionEnd={(event) => {
        if (fading && event.target === event.currentTarget) onFaded();
      }}
      aria-hidden
    >
      <div className="sk h-48 rounded-[1.5rem] sm:h-64 sm:rounded-[2rem] lg:h-80" />
      <div className="sk mt-4 h-12 rounded-2xl" />
      <div className="mt-5 flex flex-wrap gap-2">
        {[7, 5, 6, 6, 7, 2.75].map((width, index) => (
          <div key={index} className="sk h-11 rounded-full" style={{ width: `${width}rem` }} />
        ))}
      </div>
      <div className="sk mt-3 h-9 rounded-2xl" />
      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-5 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="sk h-36 rounded-2xl sm:h-52 sm:rounded-3xl" />
        ))}
      </div>
    </div>
  );
}

