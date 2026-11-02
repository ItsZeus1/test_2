import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Search, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { useProfileState } from "@/components/profile";
import { OffersTicker } from "@/components/offers-ticker";
import { categoryName, serviceText, useI18n } from "@/lib/i18n";
import {
  deleteServiceAction,
  getPublicCatalog,
  getViewerCatalog,
  getVisitorCurrency,
  onStoreChange,
  setVisitorCurrency,
} from "@/lib/store/api";
import { currencySymbol, formatMoney } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, CURRENCIES, type CatalogService, type Category, type Currency } from "@/lib/store/types";

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
  const [visitorCurrency, setVisitorCurrencyState] = useState<Currency>("USD");
  const isAdmin = profile?.role === "ADMIN";

  useEffect(() => {
    setFilter(category);
  }, [category]);

  useEffect(() => {
    setVisitorCurrencyState(getVisitorCurrency());
  }, []);

  function pickVisitorCurrency(next: Currency) {
    setVisitorCurrencyState(next);
    setVisitorCurrency(next);
  }

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
      <section className="hero-surface nova-grid-border relative overflow-hidden rounded-[2rem] px-5 py-8 sm:px-10 sm:py-12">
        <div className="glass float-y absolute top-6 end-6 hidden rounded-2xl px-4 py-3 lg:block">
          <p className="text-[10px] font-bold tracking-[0.18em] text-fuchsia uppercase">{t.hotDrop}</p>
          <p className="text-sm font-semibold">{t.hotDropBody}</p>
        </div>
        <div className="glass float-y float-delay absolute bottom-6 end-8 hidden rounded-2xl px-4 py-3 xl:block">
          <p className="text-[10px] font-bold tracking-[0.18em] text-violet uppercase">{t.rolePrice}</p>
          <p className="text-sm font-semibold">{profile?.role === "VIP" || profile?.role === "ADMIN" ? t.vipUnlocked : t.standardRate}</p>
        </div>
        <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.22em] text-fuchsia uppercase">
          <Zap className="size-3.5" /> {t.storeKicker}
        </p>
        <h1 className="mt-3 max-w-xl font-display text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
          <span className="text-gradient">{t.storeTitle}</span>
        </h1>
        <p className="mt-3 max-w-lg text-sm text-muted sm:text-base">
          {t.storeLead}
        </p>
        <label className="glass mt-6 flex min-h-12 max-w-xl items-center gap-2 rounded-full px-4">
          <Search className="size-4 text-violet" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchPh}
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </label>
      </section>

      <OffersTicker className="mt-4" />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((id) => {
          const pill = { id, label: id === "all" ? t.allServices : categoryName(t, id) };
          const active = filter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setFilter(pill.id)}
              className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${active ? "bg-gradient-to-r from-violet to-fuchsia text-white shadow-[0_0_22px_-6px_rgba(232,121,249,0.95)]" : "border border-white/10 bg-white/5 text-muted hover:text-white"}`}
            >
              {pill.label}
            </button>
          );
        })}
        {!profile ? (
          <div
            role="radiogroup"
            aria-label={t.showPricesIn}
            className="ms-auto inline-flex min-h-11 items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1"
          >
            <span className="hidden px-2 text-xs font-semibold text-muted sm:inline">{t.showPricesIn}</span>
            {CURRENCIES.map((code) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={visitorCurrency === code}
                onClick={() => pickVisitorCurrency(code)}
                className={`min-h-9 rounded-full px-3 text-xs font-bold ${visitorCurrency === code ? "bg-gradient-to-r from-violet to-fuchsia text-white" : "text-muted"}`}
              >
                {code} {currencySymbol(code, language)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-6 text-sm text-fuchsia">{error}</p> : null}

      {loading ? (
        <div className="mt-6 grid grid-cols-3 gap-2.5 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/5 sm:h-56 sm:rounded-3xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="glass mt-6 rounded-3xl px-5 py-10 text-center text-sm text-muted">{t.noMatch}</p>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-2.5 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {visible.map((service) => {
            const copy = serviceText(language, service);
            return (
              <article
                key={service.id}
                className="tilt-card glass nova-grid-border group relative flex h-full flex-col rounded-2xl p-2.5 sm:rounded-3xl sm:p-4 hover:shadow-[0_0_28px_-8px_rgba(139,92,246,0.85)]"
              >
                <Link
                  to="/service/$slug"
                  params={{ slug: service.slug }}
                  className="flex flex-1 flex-col items-center text-center sm:items-start sm:text-start"
                >
                  <span className="mx-auto sm:mx-0">
                    <ServiceMark slug={service.slug} category={service.category} name={copy.name} imageUrl={service.imageUrl} size="card" />
                  </span>
                  <p className="mt-3 hidden text-[11px] font-bold tracking-[0.16em] text-violet uppercase sm:block">
                    {categoryName(t, service.category)}
                  </p>
                  <h2 className="mt-2 line-clamp-1 w-full text-xs font-bold break-all sm:mt-1 sm:font-display sm:text-base sm:font-extrabold sm:break-normal lg:text-lg">
                    {copy.name}
                  </h2>
                  {service.badge ? (
                    <span className="mt-1 hidden rounded-full border border-fuchsia/40 bg-fuchsia/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-fuchsia-100 uppercase sm:inline-flex">
                      {service.badge}
                    </span>
                  ) : null}
                  <p className="mt-2 hidden text-sm text-muted sm:line-clamp-2">{copy.description}</p>
                  <p className="mt-1 text-[11px] font-semibold sm:mt-auto sm:pt-3 sm:text-sm">
                    <span className="text-muted">{t.from} </span>
                    <span className="tabular-nums sm:font-display sm:text-lg sm:font-extrabold">
                      {formatMoney(service.startingPriceCents, service.currency, language)}
                    </span>
                    {service.rate === "vip" ? (
                      <span className="ms-2 hidden rounded-full border border-amber-200/40 bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-amber-100 sm:inline">
                        VIP
                      </span>
                    ) : null}
                  </p>
                </Link>
                {isAdmin ? (
                  <div className="mt-2 flex gap-1.5 sm:mt-3 sm:gap-2">
                    <button
                      type="button"
                      aria-label={t.edit}
                      onClick={() => openEditService(service.slug)}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-full border border-white/10 text-xs font-bold hover:border-violet hover:shadow-[0_0_18px_-8px_rgba(139,92,246,0.9)] sm:min-h-11"
                    >
                      <Pencil className="size-3.5" /> <span className="hidden sm:inline">{t.edit}</span>
                    </button>
                    {pendingSlug === service.slug ? (
                      <button
                        type="button"
                        onClick={() => void remove(service.slug)}
                        className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-rose-500/80 text-[10px] font-bold sm:min-h-11 sm:text-xs"
                      >
                        {t.confirmDelete}
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={t.delete}
                        onClick={() => setPendingSlug(service.slug)}
                        className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-full border border-rose-300/30 text-xs font-bold text-rose-100 sm:min-h-11"
                      >
                        <Trash2 className="size-3.5" /> <span className="hidden sm:inline">{t.delete}</span>
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
