"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/lib/nav";
import { Boxes, LayoutDashboard, MessagesSquare, Pencil, Plus, ShieldCheck, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { HeroPhotoManager } from "@/components/hero-manager";
import { ElapsedTimer } from "@/components/topup-timing";
import { UserDossierModal } from "@/components/user-dossier";
import { SupportInbox } from "@/components/support-inbox";
import { VaultManager } from "@/components/vault-manager";
import { AnalyticsPanel, BalanceEditor, BoxFilter, EMPTY_FILTER, GroupsManager, PasswordSetter, UnifiedInspector, applyFilter, type Filter } from "@/components/admin-boxes";
import { EnableAlertsButton, PushSetupCard, enableAdminAlerts } from "@/components/admin-alerts";
import { MethodBadge, PayEmblem, methodLabel } from "@/components/pay-emblem";
import type { PaymentAddresses } from "@/lib/store/types";
import { ServiceMark } from "@/components/service-mark";
import { NOVACHARGE_PUSH_SQL, NOVACHARGE_SQL, NOVACHARGE_VAULT_SQL, NOVACHARGE_SECRETS_SQL } from "@/lib/store/schema-sql";
import { RoleBadge } from "@/components/receipt-badge";
import { useProfileState } from "@/components/profile";
import { useI18n, useMoney } from "@/lib/i18n";
import {
  approveBalanceRequest,
  deleteServiceAction,
  getAdminDashboard,
  getDatabaseStatus,
  getTopupTiming,
  setAvgTopupMinutes,
  getSypRate,
  setSypRate,
  getPaymentAddresses,
  getViewerCatalog,
  listBalanceRequests,
  onStoreChange,
  rejectBalanceRequest,
  setPaymentAddresses,
  setUserRole,
  getOffersTicker,
  setOffersTicker,
  toggleBlockUser,
  migratePackageSecrets,
} from "@/lib/store/api";
import { DEFAULT_SYP_RATE } from "@/lib/money";
import type { StoredBalanceRequest } from "@/lib/store/data";
import { useNovaUi } from "@/lib/ui-store";
import {
  categoryLabel,
  type AdminStats,
  type AdminUser,
  type CatalogService,
  type Role,
} from "@/lib/store/types";

const ROLES: Role[] = ["NORMAL", "VIP"];
const OWNER_EMAIL = "majd@elmadani.com";

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

type AdminTab = "overview" | "users" | "catalog" | "settings" | "support";
const ADMIN_TABS: Array<{ id: AdminTab; ar: string; en: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", ar: "نظرة عامة", en: "Overview", icon: LayoutDashboard },
  { id: "users", ar: "المستخدمون", en: "Users", icon: Users },
  { id: "catalog", ar: "الكتالوج", en: "Catalog", icon: Boxes },
  { id: "settings", ar: "الإعدادات", en: "Settings", icon: SlidersHorizontal },
  { id: "support", ar: "الدعم", en: "Support", icon: MessagesSquare },
];

export function AdminDashboard() {
  const { t, language } = useI18n();
  const money = useMoney();
  const { profile, ready } = useProfileState();
  const openCreateService = useNovaUi((state) => state.openCreateService);
  const openEditService = useNovaUi((state) => state.openEditService);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [secretsNote, setSecretsNote] = useState<string | null>(null);
  // Security: move any provider endpoints / codes still in the public store to the server-only table.
  useEffect(() => {
    if (profile?.role !== "ADMIN") return;
    void migratePackageSecrets().then((result) => {
      if (result.moved) toast.success(language === "ar" ? `تم نقل ${result.moved} من مفاتيح المزودين إلى الخادم بأمان` : `Moved ${result.moved} provider secrets to the server`);
      if (result.error) setSecretsNote(result.error);
    });
  }, [profile?.role]); // eslint-disable-line react-hooks/exhaustive-deps
  // Deep links from alerts / notifications (#support-inbox, #topup-queue, #manual-queue …) open the right tab.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "support-inbox") setTab("support");
    else if (hash === "groups-manager" || hash === "vault-manager") setTab("catalog");
    else if (hash) setTab("overview");
  }, []);
  const [queueFilter, setQueueFilter] = useState<Filter>(EMPTY_FILTER);
  const [userFilter, setUserFilter] = useState<Filter>(EMPTY_FILTER);
  const closeInspector = useCallback(() => setInspectId(null), []);
  const [avgMinutes, setAvgMinutes] = useState("3");
  const [services, setServices] = useState<CatalogService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<PaymentAddresses>({ SHAMCASH: "", SYRIATEL_CASH: "", MTN_CASH: "" });
  const addressesEdited = useRef(false);
  const [ticker, setTicker] = useState("");
  const [tickerAr, setTickerAr] = useState("");
  const [requests, setRequests] = useState<StoredBalanceRequest[]>([]);
  const rateEdited = useRef(false);
  const [rate, setRate] = useState(String(DEFAULT_SYP_RATE));

  useEffect(() => {
    if (!ready || profile?.role !== "ADMIN") {
      setLoading(false);
      return;
    }
    let cancel = false;
    async function load() {
      try {
        const [dash, catalog, sham, queue, offers, sypRate] = await Promise.all([
          getAdminDashboard(),
          getViewerCatalog(),
          getPaymentAddresses(),
          listBalanceRequests().catch(() => [] as StoredBalanceRequest[]),
          getOffersTicker(),
          getSypRate(),
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
        if (!addressesEdited.current) setAddresses(sham);
        setTicker(offers.text);
        setTickerAr(offers.textAr);
        setRequests(queue);
        setRate((current) => (rateEdited.current ? current : String(sypRate)));
        setError(null);
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
  }, [ready, profile?.role]);

  useEffect(() => {
    void getTopupTiming().then((timing) => setAvgMinutes(String(timing.fallbackMinutes)));
  }, []);

  useEffect(() => {
    if (profile?.role !== "ADMIN") return;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void enableAdminAlerts();
    }
  }, [profile?.role]);

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
        <h1 className="font-display text-3xl font-extrabold">{t.adminOnly}</h1>
        <p className="mt-3 text-muted">{t.adminOnlyBody}</p>
        <Link to="/login" search={{ tab: undefined }} className="btn-glow mt-6 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold">
          {t.signIn}
        </Link>
      </main>
    );
  }


  async function block(user: AdminUser) {
    const result = await toggleBlockUser({ userId: user.userId });
    if (!result.ok) toast.error(result.error);
    else toast.success(result.isBlocked ? t.userBlocked : t.userUnblocked);
  }

  async function changeRole(userId: string, role: Role) {
    const result = await setUserRole({ userId, role });
    if (!result.ok) toast.error(result.error);
    else toast.success(`${t.roleSet} ${role}`);
  }


  async function remove(slug: string) {
    const result = await deleteServiceAction({ slug });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setPendingSlug(null);
    toast.success(t.removed);
  }

  async function saveAddress() {
    const result = await setPaymentAddresses(addresses);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    addressesEdited.current = false;
    toast.success(t.paymentSaved);
  }

  async function saveTicker() {
    const result = await setOffersTicker({ text: ticker, textAr: tickerAr });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t.tickerSaved);
  }

  async function saveAvgMinutes() {
    const result = await setAvgTopupMinutes({ minutes: Number(avgMinutes) });
    if (!result.ok) toast.error(result.error);
    else toast.success(t.sypRateSaved);
  }

  async function saveRate() {
    const value = Number(rate);
    const result = await setSypRate({ rate: value });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    rateEdited.current = false;
    toast.success(t.sypRateSaved);
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
  const processingShown = applyFilter<StoredBalanceRequest>(
    processing,
    queueFilter,
    (item) => [item.receiptNumber, item.username, item.senderName, item.senderPhone, item.transferNumber, item.referenceNote],
    (item) => item.createdAt,
  ).slice(0, 100);
  const searchingUsers = Boolean(userFilter.q.trim() || userFilter.from || userFilter.to);
  const usersShown = searchingUsers
    ? applyFilter<AdminUser>(users, userFilter, (user) => [user.name, user.username, user.email, user.phone, user.userId], (user) => user.createdAt).slice(0, 100)
    : [...users].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <p className="text-xs font-bold tracking-[0.22em] text-sky-700 uppercase dark:text-sky-300">{t.control}</p>
      <h1 className="mt-2 font-display text-2xl font-extrabold sm:text-4xl lg:text-5xl">
        <span className="brand-gradient">{t.adminTitle}</span>
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(() => {
          const db = getDatabaseStatus();
          return (
            <span
              title={db.detail}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-bold ${db.online ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100" : "border-amber-300/40 bg-amber-300/10 text-amber-100"}`}
            >
              <span className={`size-2 rounded-full ${db.online ? "pulse-dot bg-emerald-400" : "bg-amber-400"}`} />
              {t.dbStatus}: {db.online ? t.dbOnline : t.dbLocal}
            </span>
          );
        })()}
        <button
          type="button"
          onClick={() => {
            void copyToClipboard(NOVACHARGE_SQL).then(() => toast.success(t.sqlCopied));
          }}
          className="inline-flex min-h-9 items-center rounded-full border border-white/15 bg-white/5 px-3 text-xs font-bold hover:border-[#0284c7]"
        >
          {t.copySql}
        </button>
        <EnableAlertsButton />
        <a href="#support-inbox" onClick={() => setTab("support")} className="inline-flex min-h-9 items-center rounded-full border border-[#0284c7]/40 bg-[#0284c7]/10 px-3 text-xs font-bold">
          {t.supportInbox}
        </a>
      </div>

      <nav className="admin-tabs sticky top-16 z-30 mt-5 flex gap-1.5 overflow-x-auto rounded-2xl p-1.5" role="tablist" aria-label={language === "ar" ? "أقسام لوحة التحكم" : "Dashboard sections"}>
        {ADMIN_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3.5 text-xs font-bold sm:text-sm ${tab === item.id ? "keep-white bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow" : "text-muted hover:bg-white/5"}`}
          >
            <item.icon className="size-4" strokeWidth={1.75} aria-hidden />
            {language === "ar" ? item.ar : item.en}
            {item.id === "overview" && processing.length ? <span className="keep-white grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] text-white">{processing.length}</span> : null}
          </button>
        ))}
      </nav>
      {tab === "overview" ? (
        <>
          <AnalyticsPanel users={users} services={services} />
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <Kpi label={t.online} value={String(stats?.onlineSessions ?? 0)} live />
        <Kpi label={t.slugsAdded} value={String(stats?.serviceCount ?? 0)} />
        <Kpi label={`${t.income} · ${t.incomeNote}`} value={money(stats?.revenueCents ?? 0, "USD")} />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="nova-grid-border glass rounded-[1.75rem] p-4 sm:p-5">
          <h2 className="font-display text-xl font-extrabold">{t.paymentAddresses}</h2>
          <p className="mt-1 text-xs text-muted">{t.paymentAddressesHint}</p>
          <div className="mt-3 grid gap-3">
            {(["SHAMCASH", "SYRIATEL_CASH", "MTN_CASH"] as const).map((id) => (
              <label key={id} className="flex min-w-0 items-center gap-3">
                <PayEmblem method={id} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-muted">{methodLabel(t, id)}</span>
                  <input
                    className="field mt-1"
                    dir="ltr"
                    value={addresses[id]}
                    onChange={(event) => {
                      addressesEdited.current = true;
                      setAddresses((current) => ({ ...current, [id]: event.target.value }));
                    }}
                  />
                </span>
              </label>
            ))}
          </div>
          <button type="button" onClick={() => void saveAddress()} className="btn-glow keep-white mt-3 min-h-11 rounded-full px-4 text-sm font-semibold text-white">
            {t.shamSave}
          </button>
        </div>
        <div id="topup-queue" className="nova-grid-border glass scroll-mt-24 overflow-hidden rounded-[1.75rem] p-4 sm:p-5">
          <h2 className="font-display text-xl font-extrabold">
            {t.queue} {processing.length ? <span className="text-sm text-rose-500">({processing.length})</span> : null}
          </h2>
          <BoxFilter value={queueFilter} onChange={setQueueFilter} />
          <div className="mt-3 max-h-[19rem] space-y-2 overflow-y-auto pe-1">
            {processingShown.length === 0 ? (
              <p className="text-sm text-muted">{t.queueEmpty}</p>
            ) : (
              processingShown.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
                      <span className="truncate">@{item.username}</span>
                      <MethodBadge method={item.method ?? "SHAMCASH"} t={t} />
                      {item.receiptNumber ? <span className="price-num text-[11px] text-muted" dir="ltr">#{item.receiptNumber}</span> : null}
                    </p>
                    <p className="shrink-0 text-sm font-bold tabular-nums">{money(item.cents, item.currency ?? "USD")}</p>
                  </div>
                  <dl className="mt-1.5 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                    <div className="rounded-xl bg-white/5 px-2.5 py-1.5">
                      <dt className="text-muted">{(item.method ?? "SHAMCASH") === "SHAMCASH" ? t.senderName : t.senderPhone}</dt>
                      <dd className="font-semibold" dir={(item.method ?? "SHAMCASH") === "SHAMCASH" ? undefined : "ltr"}>
                        {((item.method ?? "SHAMCASH") === "SHAMCASH" ? item.senderName : item.senderPhone) || item.referenceNote}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-white/5 px-2.5 py-1.5">
                      <dt className="text-muted">{t.transferNumber}</dt>
                      <dd className="font-semibold" dir="ltr">
                        {item.transferNumber || "—"}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-1 text-[11px] text-amber-500">
                    {t.pendingFor} <ElapsedTimer since={item.createdAt} />
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
          <UnifiedInspector />
        </>
      ) : null}
      {tab === "users" ? (
        <>
      <section className="mt-10">
        <h2 className="font-display text-2xl font-extrabold">{t.usersBalances}</h2>
        <div className="mt-3 grid gap-3">
          <BoxFilter value={userFilter} onChange={setUserFilter} />
          {!searchingUsers ? (
            <p className="mt-2 text-xs font-semibold text-muted">
              {language === "ar"
                ? `عرض آخر 5 مستخدمين مسجلين — استخدم شريط البحث للوصول لأي حساب من أصل ${users.length} مستخدم`
                : `Showing the 5 newest users — search to reach any of ${users.length} accounts`}
            </p>
          ) : null}
          {usersShown.map((user) => (
            <article key={user.userId} className="nova-grid-border glass rounded-3xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{user.name}</p>
                <span className="text-sm text-muted">@{user.username}</span>
                <RoleBadge role={user.role} />
                <button
                  type="button"
                  onClick={() => setInspectId(user.userId)}
                  className="ms-auto inline-flex min-h-9 items-center rounded-full border border-[#0284c7]/40 bg-[#0284c7]/10 px-3 text-xs font-bold"
                >
                  {t.fullProfile}
                </button>
                {user.isBlocked ? (
                  <span className="rounded-full border border-rose-300/40 px-2 py-1 text-[10px] font-bold tracking-wide text-rose-100 uppercase">
                    {t.blocked}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                {user.email} · {money(user.balanceCents, user.currency)} ({user.currency}) · {user.lastIp || t.ipMissing}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                {user.email.toLowerCase() === OWNER_EMAIL ? (
                  <p className="text-xs font-bold tracking-[0.14em] text-muted uppercase">
                    {t.role}
                    <span className="mt-1 flex min-h-11 items-center rounded-xl border border-white/10 px-3 normal-case tracking-normal">
                      ADMIN · {t.ownerLocked}
                    </span>
                  </p>
                ) : (
                <label className="text-xs font-bold tracking-[0.14em] text-muted uppercase">
                  {t.role}
                  <select
                    className="field mt-1"
                    value={user.role === "ADMIN" ? "NORMAL" : user.role}
                    onChange={(event) => void changeRole(user.userId, event.target.value as Role)}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                )}
                <div className="grid w-full gap-3 sm:grid-cols-2">
                  <BalanceEditor userId={user.userId} currency={user.currency} />
                  {user.email.toLowerCase() !== OWNER_EMAIL ? <PasswordSetter userId={user.userId} /> : null}
                </div>
                {user.userId !== profile.userId && user.email.toLowerCase() !== OWNER_EMAIL ? (
                  <button
                    type="button"
                    onClick={() => void block(user)}
                    className="min-h-10 rounded-full border border-rose-300/40 px-3 text-xs font-bold text-rose-500"
                  >
                    {user.isBlocked ? t.unblock : t.block}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
        </>
      ) : null}
      {tab === "catalog" ? (
        <>
      <section className="mt-6 grid gap-4">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-extrabold">{t.serviceSlugs}</h2>
            <button type="button" onClick={openCreateService} className="btn-glow inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-semibold">
              <Plus className="size-4" /> Add Service
            </button>
          </div>
          <div className="grid gap-2">
            {services.map((service) => (
              <article key={service.id} className="nova-grid-border glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
                <ServiceMark slug={service.slug} category={service.category} name={service.name} imageUrl={service.imageUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{service.name}</p>
                  <p className="text-xs text-muted">
                    {categoryLabel(service.category)} · {service.slug} · from {money(service.startingPriceCents, "USD")}
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
          <GroupsManager />
          <VaultManager services={services} sql={NOVACHARGE_VAULT_SQL} />
      <section className="nova-grid-border glass mt-6 rounded-[1.75rem] p-4 sm:p-5">
        <h2 className="font-display text-xl font-extrabold">{t.heroPhotosTitle}</h2>
        <div className="mt-2">
          <HeroPhotoManager />
        </div>
      </section>
        </>
      ) : null}
      {tab === "settings" ? (
        <>
          <section className="admin-box mt-6 rounded-[22px] p-4">
            <h2 className="inline-flex items-center gap-2 font-display text-base font-extrabold sm:text-lg">
              <ShieldCheck className="size-5 text-sky-600" strokeWidth={1.75} />
              {language === "ar" ? "حماية مفاتيح المزودين" : "Provider secrets protection"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {language === "ar"
                ? "روابط API والرموز السرية للباقات محفوظة على الخادم فقط ولا تصل إلى متصفح أي زائر. شغّل الجزء 4 من SQL مرة واحدة في Supabase."
                : "Package API endpoints and secret codes live on the server only and never reach a visitor's browser. Run SQL part 4 once in Supabase."}
            </p>
            {secretsNote ? <p className="mt-2 text-xs font-semibold text-rose-600">{secretsNote}</p> : null}
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(NOVACHARGE_SECRETS_SQL).then(() => toast.success(language === "ar" ? "تم النسخ" : "Copied"))}
              className="mt-3 min-h-10 rounded-[12px] border border-slate-300 px-4 text-xs font-bold dark:border-white/15"
            >
              {language === "ar" ? "نسخ SQL (الجزء 4 و5: مفاتيح الباقات + المزامنة الفورية)" : "Copy SQL (parts 4 & 5: package secrets + realtime)"}
            </button>
          </section>
      <section className="nova-grid-border glass mt-6 rounded-[1.75rem] p-4 sm:p-5">
        <h2 className="font-display text-xl font-extrabold">{t.sypRateTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.sypRateHint}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block text-xs font-bold tracking-[0.14em] text-muted uppercase sm:max-w-xs sm:flex-1">
            {t.sypRateLabel}
            <input
              className="field mt-2 font-normal tracking-normal normal-case"
              dir="ltr"
              inputMode="decimal"
              value={rate}
              onChange={(event) => {
                rateEdited.current = true;
                setRate(event.target.value);
              }}
            />
          </label>
          <button type="button" onClick={() => void saveRate()} className="btn-glow min-h-11 rounded-full px-5 text-sm font-semibold">
            {t.sypRateSave}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">{t.sypOverview}</p>
        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-end">
          <label className="block text-xs font-bold text-muted sm:max-w-xs sm:flex-1">
            {t.avgTopupSetting}
            <input className="field mt-2" dir="ltr" inputMode="numeric" value={avgMinutes} onChange={(event) => setAvgMinutes(event.target.value)} />
          </label>
          <button type="button" onClick={() => void saveAvgMinutes()} className="min-h-11 rounded-full border border-white/15 px-5 text-sm font-semibold">
            {t.sypRateSave}
          </button>
        </div>
      </section>
      <section className="nova-grid-border glass mt-6 rounded-[1.75rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="ticker-badge">
            <span className="pulse-dot size-2 rounded-full bg-current" />
            {t.tickerBadge}
          </span>
          <h2 className="font-display text-xl font-extrabold">{t.tickerCardTitle}</h2>
        </div>
        <p className="mt-1 text-sm text-muted">{t.tickerCardHint}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-bold tracking-[0.14em] text-muted uppercase">
            {t.tickerEnLabel}
            <textarea
              className="field mt-2 min-h-24 font-normal tracking-normal normal-case"
              dir="ltr"
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
            />
          </label>
          <label className="block text-xs font-bold tracking-[0.14em] text-muted uppercase">
            {t.tickerArLabel}
            <textarea
              className="field mt-2 min-h-24 font-normal tracking-normal normal-case"
              dir="rtl"
              value={tickerAr}
              onChange={(event) => setTickerAr(event.target.value)}
            />
          </label>
        </div>
        <button type="button" onClick={() => void saveTicker()} className="btn-glow mt-3 min-h-11 rounded-full px-4 text-sm font-semibold">
          {t.tickerSave}
        </button>
      </section>
      <PushSetupCard sql={NOVACHARGE_PUSH_SQL} />
        </>
      ) : null}
      {tab === "support" ? (
        <>
      <SupportInbox />

      {error ? <p className="mt-4 text-sm text-rose-200">{error}</p> : null}
        </>
      ) : null}
      <UserDossierModal userId={inspectId} onClose={closeInspector} />
    </main>
  );
}

function Kpi({ label, value, live = false }: { label: string; value: string; live?: boolean }) {
  return (
    <article className="nova-grid-border glass relative overflow-hidden rounded-3xl p-5">
      <div className="pointer-events-none absolute -top-8 -right-6 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.4),transparent_70%)]" />
      <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] text-muted uppercase">
        {live ? <span className="pulse-dot size-2 rounded-full bg-emerald-400" /> : null}
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-extrabold tabular-nums">{value}</p>
    </article>
  );
}
