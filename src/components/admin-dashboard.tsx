import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Plus, Radio, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ServiceMark } from "@/components/service-mark";
import { RoleBadge } from "@/components/role-badge";
import { useProfileState } from "@/components/profile";
import { useI18n } from "@/lib/i18n";
import {
  approveBalanceRequest,
  deleteServiceAction,
  getAdminDashboard,
  getShamcashAddress,
  getViewerCatalog,
  listBalanceRequests,
  onStoreChange,
  rejectBalanceRequest,
  setShamcashAddress,
  setUserRole,
  topUpUser,
} from "@/lib/store/api";
import { dollarsToCents, formatUsd } from "@/lib/money";
import type { StoredBalanceRequest } from "@/lib/store/data";
import { useNovaUi } from "@/lib/ui-store";
import {
  categoryLabel,
  type AdminStats,
  type AdminUser,
  type CatalogService,
  type Role,
} from "@/lib/store/types";

const ROLES: Role[] = ["NORMAL", "VIP", "ADMIN"];

export function AdminDashboard() {
  const { t } = useI18n();
  const { profile, ready } = useProfileState();
  const openCreateService = useNovaUi((state) => state.openCreateService);
  const openEditService = useNovaUi((state) => state.openEditService);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<Record<string, string>>({});
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [requests, setRequests] = useState<StoredBalanceRequest[]>([]);

  useEffect(() => {
    if (!ready || profile?.role !== "ADMIN") {
      setLoading(false);
      return;
    }
    let cancel = false;
    async function load() {
      try {
        const [dash, catalog, sham, queue] = await Promise.all([
          getAdminDashboard(),
          getViewerCatalog(),
          getShamcashAddress(),
          listBalanceRequests().catch(() => [] as StoredBalanceRequest[]),
        ]);
        if (cancel) return;
        if (!dash.ok) {
          setError(dash.error);
          setLoading(false);
          return;
        }
        setStats(dash.stats);
        setUsers(dash.users);
        setServices(catalog);
        setAddress(sham);
        setRequests(queue);
        setError(null);
      } catch (caught) {
        if (!cancel) setError(caught instanceof Error ? caught.message : "Dashboard unavailable");
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
  }, [ready, profile?.role]);

  if (!ready || loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="h-40 animate-pulse rounded-[2rem] bg-white/5" />
      </main>
    );
  }

  if (!profile || profile.role !== "ADMIN") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-extrabold">Admin only</h1>
        <p className="mt-3 text-muted">Sign in with an admin account to open the control center.</p>
        <Link to="/login" search={{ tab: undefined }} className="btn-glow mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
          Sign in
        </Link>
      </main>
    );
  }

  async function changeRole(userId: string, role: Role) {
    const result = await setUserRole({ userId, role });
    if (!result.ok) toast.error(result.error);
    else toast.success(`Role set to ${role}`);
  }

  async function credit(user: AdminUser) {
    const cents = dollarsToCents(credits[user.userId] ?? "");
    if (cents == null || cents < 100) {
      toast.error("Enter at least $1.00");
      return;
    }
    const result = await topUpUser({ userId: user.userId, cents });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setCredits((current) => ({ ...current, [user.userId]: "" }));
    toast.success(`Added ${formatUsd(cents)} to ${user.name}`);
  }

  async function remove(slug: string) {
    const result = await deleteServiceAction({ slug });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPendingSlug(null);
    toast.success("Service removed");
  }

  async function saveAddress() {
    const result = await setShamcashAddress({ address });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t.shamSaved);
  }

  async function decide(id: string, action: "approve" | "reject") {
    const result = action === "approve" ? await approveBalanceRequest({ id }) : await rejectBalanceRequest({ id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(action === "approve" ? t.approvedToast : t.rejectedToast);
  }

  const processing = requests.filter((item) => item.status === "PROCESSING");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <p className="text-xs font-bold tracking-[0.22em] text-fuchsia uppercase">Control center</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        <span className="text-gradient">NovaCharge admin</span>
      </h1>

      {error ? <p className="mt-4 text-sm text-rose-200">{error}</p> : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <Kpi label="Online Sessions" value={String(stats?.onlineSessions ?? 0)} live />
        <Kpi label="Total Slugs Added" value={String(stats?.serviceCount ?? 0)} />
        <Kpi label="Total Incomes ($)" value={formatUsd(stats?.revenueCents ?? 0)} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="glass rounded-[1.75rem] p-4 sm:p-5">
          <h2 className="font-display text-xl font-extrabold">{t.shamSettings}</h2>
          <label className="mt-3 block text-xs font-bold tracking-[0.14em] text-muted uppercase">
            {t.shamcash}
            <input
              className="field mt-2 font-normal tracking-normal normal-case"
              dir="ltr"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void saveAddress()} className="btn-glow mt-3 min-h-11 rounded-full px-4 text-sm font-semibold">
            {t.shamSave}
          </button>
        </div>
        <div className="glass max-h-[28rem] overflow-hidden rounded-[1.75rem] p-4 sm:p-5">
          <h2 className="font-display text-xl font-extrabold">{t.queue}</h2>
          <div className="mt-3 h-[calc(100%-2.5rem)] space-y-2 overflow-y-auto pe-1">
            {processing.length === 0 ? (
              <p className="text-sm text-muted">{t.queueEmpty}</p>
            ) : (
              processing.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">@{item.username}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums">{formatUsd(item.cents)}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {t.reference}: <span dir="ltr">{item.referenceNote}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void decide(item.id, "approve")} className="min-h-11 rounded-full bg-emerald-400/20 px-3 text-xs font-bold text-emerald-100">
                      {t.approve}
                    </button>
                    <button type="button" onClick={() => void decide(item.id, "reject")} className="min-h-11 rounded-full border border-rose-300/40 px-3 text-xs font-bold text-rose-100">
                      {t.reject}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="glass aspect-square max-h-[28rem] overflow-hidden rounded-[1.75rem] p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold">Recent purchases</h2>
            <Radio className="size-4 text-fuchsia" />
          </div>
          <div className="mt-3 h-[calc(100%-2.5rem)] space-y-2 overflow-y-auto pr-1">
            {(stats?.recent ?? []).length === 0 ? (
              <p className="text-sm text-muted">No purchases yet.</p>
            ) : (
              stats?.recent.map((order) => (
                <article key={order.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{order.serviceName}</p>
                    <p className="shrink-0 text-sm font-bold tabular-nums">{formatUsd(order.priceCents)}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {order.userName} · {order.packageName}
                  </p>
                  <p className="text-xs text-violet">{order.ipAddress || "IP not captured"}</p>
                </article>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-extrabold">Service slugs</h2>
            <button type="button" onClick={openCreateService} className="btn-glow inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-semibold">
              <Plus className="size-4" /> Add Service
            </button>
          </div>
          <div className="grid gap-2">
            {services.map((service) => (
              <article key={service.id} className="glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
                <ServiceMark slug={service.slug} category={service.category} name={service.name} imageUrl={service.imageUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{service.name}</p>
                  <p className="text-xs text-muted">
                    {categoryLabel(service.category)} · {service.slug} · from {formatUsd(service.startingPriceCents)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => openEditService(service.slug)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-white/10 px-3 text-xs font-bold">
                    <Pencil className="size-3.5" /> Edit
                  </button>
                  {pendingSlug === service.slug ? (
                    <button type="button" onClick={() => void remove(service.slug)} className="min-h-11 rounded-full bg-rose-500/80 px-3 text-xs font-bold">
                      Confirm
                    </button>
                  ) : (
                    <button type="button" onClick={() => setPendingSlug(service.slug)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-rose-300/30 px-3 text-xs font-bold text-rose-100">
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-extrabold">Users & balances</h2>
        <div className="mt-3 grid gap-3">
          {users.map((user) => (
            <article key={user.userId} className="glass rounded-3xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{user.name}</p>
                <span className="text-sm text-muted">@{user.username}</span>
                <RoleBadge role={user.role} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {user.email} · {formatUsd(user.balanceCents)} · {user.lastIp || "no IP yet"}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="text-xs font-bold tracking-[0.14em] text-muted uppercase">
                  Role
                  <select
                    className="field mt-1"
                    value={user.role}
                    onChange={(event) => void changeRole(user.userId, event.target.value as Role)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold tracking-[0.14em] text-muted uppercase sm:ml-auto">
                  Top-up user balance
                  <span className="mt-1 flex gap-2">
                    <input
                      className="field w-28"
                      inputMode="decimal"
                      placeholder="10.00"
                      value={credits[user.userId] ?? ""}
                      onChange={(event) => setCredits((current) => ({ ...current, [user.userId]: event.target.value }))}
                    />
                    <button type="button" onClick={() => void credit(user)} className="btn-glow min-h-11 rounded-full px-4 text-sm font-semibold">
                      Add
                    </button>
                  </span>
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, live = false }: { label: string; value: string; live?: boolean }) {
  return (
    <article className="glass relative overflow-hidden rounded-3xl p-5">
      <div className="pointer-events-none absolute -top-8 -right-6 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(232,121,249,0.4),transparent_70%)]" />
      <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] text-muted uppercase">
        {live ? <span className="pulse-dot size-2 rounded-full bg-emerald-400" /> : null}
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-extrabold tabular-nums">{value}</p>
    </article>
  );
}
