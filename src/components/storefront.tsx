import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Search, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { useProfileState } from "@/components/profile";
import { deleteServiceAction, getPublicCatalog, getViewerCatalog, onStoreChange } from "@/lib/store/api";
import { formatUsd } from "@/lib/money";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, categoryLabel, type CatalogService, type Category } from "@/lib/store/types";

type Filter = "all" | Category;

const PILLS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  ...CATEGORIES.map((item) => ({ id: item.slug, label: item.label })),
];

export function Storefront({ category = "all" }: { category?: Filter }) {
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
        if (!cancel) setError(caught instanceof Error ? caught.message : "Catalog unavailable");
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
      service.slug.includes(needle) ||
      service.description.toLowerCase().includes(needle)
    );
  });

  async function remove(slug: string) {
    const result = await deleteServiceAction({ slug });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPendingSlug(null);
    toast.success("Service removed");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_15%_20%,rgba(232,121,249,0.45),transparent_36%),radial-gradient(circle_at_90%_0%,rgba(99,102,241,0.5),transparent_42%),linear-gradient(145deg,#140a24,#07080d_62%)] px-5 py-8 sm:px-10 sm:py-12">
        <div className="glass float-y absolute top-6 right-6 hidden rounded-2xl px-4 py-3 sm:block">
          <p className="text-[10px] font-bold tracking-[0.18em] text-fuchsia uppercase">Hot drop</p>
          <p className="text-sm font-semibold">UC & diamonds under 5 min</p>
        </div>
        <div className="glass float-y float-delay absolute bottom-6 left-8 hidden rounded-2xl px-4 py-3 md:block">
          <p className="text-[10px] font-bold tracking-[0.18em] text-violet uppercase">Role price</p>
          <p className="text-sm font-semibold">{profile?.role === "VIP" || profile?.role === "ADMIN" ? "VIP rate unlocked" : "Standard rate until VIP"}</p>
        </div>
        <p className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.22em] text-fuchsia uppercase">
          <Zap className="size-3.5" /> NovaCharge store
        </p>
        <h1 className="mt-3 max-w-xl font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
          <span className="bg-gradient-to-br from-white via-fuchsia-100 to-violet-300 bg-clip-text text-transparent">
            Top up the lobby.
          </span>
        </h1>
        <p className="mt-3 max-w-lg text-sm text-muted sm:text-base">
          Pick a slug, choose a charge size, paste the player ID. Your wallet pays the price your role is allowed to see.
        </p>
        <label className="glass mt-6 flex min-h-12 max-w-xl items-center gap-2 rounded-full px-4">
          <Search className="size-4 text-violet" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search PUBG, Netflix, data bundles…"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </label>
      </section>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {PILLS.map((pill) => {
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
      </div>

      {error ? <p className="mt-6 text-sm text-fuchsia">{error}</p> : null}

      {loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-3xl bg-white/5" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="glass mt-6 rounded-3xl px-5 py-10 text-center text-sm text-muted">No slugs match that search.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((service) => (
            <article
              key={service.id}
              className="tilt-card glass group relative flex flex-col rounded-3xl p-4 hover:shadow-[0_0_28px_-8px_rgba(139,92,246,0.85)]"
            >
              <Link to="/service/$slug" params={{ slug: service.slug }} className="flex flex-1 flex-col">
                <div className="flex items-start gap-3">
                  <ServiceMark slug={service.slug} category={service.category} name={service.name} imageUrl={service.imageUrl} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold tracking-[0.16em] text-violet uppercase">{categoryLabel(service.category)}</p>
                    <h2 className="truncate font-display text-xl font-extrabold">{service.name}</h2>
                    {service.badge ? (
                      <span className="mt-1 inline-flex rounded-full border border-fuchsia/40 bg-fuchsia/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-fuchsia-100 uppercase">
                        {service.badge}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted">{service.description}</p>
                <p className="mt-4 text-sm">
                  <span className="text-muted">From </span>
                  <span className="font-display text-lg font-extrabold tabular-nums">{formatUsd(service.startingPriceCents)}</span>
                  {service.rate === "vip" ? (
                    <span className="ml-2 rounded-full border border-amber-200/40 bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-amber-100">
                      VIP
                    </span>
                  ) : null}
                </p>
              </Link>
              {isAdmin ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditService(service.slug)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-white/10 text-xs font-bold hover:border-violet hover:shadow-[0_0_18px_-8px_rgba(139,92,246,0.9)]"
                  >
                    <Pencil className="size-3.5" /> Edit
                  </button>
                  {pendingSlug === service.slug ? (
                    <button
                      type="button"
                      onClick={() => void remove(service.slug)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-rose-500/80 text-xs font-bold"
                    >
                      Confirm delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingSlug(service.slug)}
                      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full border border-rose-300/30 text-xs font-bold text-rose-100"
                    >
                      <Trash2 className="size-3.5" /> Delete
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
