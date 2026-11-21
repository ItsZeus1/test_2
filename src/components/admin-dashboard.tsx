"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Boxes, Check, Download, LayoutDashboard, Lock, LockOpen, Mail, MessagesSquare, Pencil, Plus, Search, ShieldAlert, ShieldCheck, SlidersHorizontal, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { HeroPhotoManager } from "@/components/hero-manager";
import { ElapsedTimer } from "@/components/topup-timing";
import { UserDossierModal } from "@/components/user-dossier";
import { SupportInbox } from "@/components/support-inbox";
import { VaultManager } from "@/components/vault-manager";
import { AnalyticsPanel, BalanceEditor, BoxFilter, EMPTY_FILTER, GroupsManager, HoneypotRadar, ImportCatalogBox, PasswordSetter, UnifiedInspector, applyFilter, type Filter } from "@/components/admin-boxes";
import { EnableAlertsButton, PushSetupCard, enableAdminAlerts } from "@/components/admin-alerts";
import { MethodBadge, PayEmblem, methodLabel } from "@/components/pay-emblem";
import type { PaymentAddresses } from "@/lib/store/types";
import { ServiceMark } from "@/components/service-mark";
import { NOVACHARGE_PUSH_SQL, NOVACHARGE_SQL, NOVACHARGE_VAULT_SQL, NOVACHARGE_SECRETS_SQL, NOVACHARGE_SECURITY_SQL } from "@/lib/store/schema-sql";
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
  adminUnlockUser,
  migrateInlineMedia,
  setServiceStock,
  adminLockUser,
  onPresence,
  reportHoneypot,
  normalizeRef,
  downloadAdminBackup,
  getGuardState,
  refreshGuardStatus,
  startOwnerSecureSession,
} from "@/lib/store/api";
import { DEFAULT_SYP_RATE } from "@/lib/money";
import type { StoredBalanceRequest } from "@/lib/store/data";
import { APP_VERSION, useNovaUi } from "@/lib/ui-store";
import {
  categoryLabel,
  type AdminStats,
  type AdminUser,
  type CatalogService,
  type Role,
} from "@/lib/store/types";

const ROLES: Role[] = ["NORMAL", "VIP"];
const CATALOG_PREVIEW = 3;
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
  // v29: move old inline photos (icons, banners, group covers, avatars) to the media bucket, once per visit.
  useEffect(() => {
    if (profile?.role !== "ADMIN") return;
    const timer = window.setTimeout(() => {
      void migrateInlineMedia().then((result) => {
        if (result.ok && result.moved) {
          toast.success(language === "ar" ? `تم ضغط ونقل ${result.moved} صورة لتسريع المتجر` : `Compressed and moved ${result.moved} photos to speed up the store`);
        }
      });
    }, 2500);
    return () => window.clearTimeout(timer);
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
  // v35: the catalog list shows 3 services until expanded (a search shows every match).
  const [isCatalogExpanded, setIsCatalogExpanded] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
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

  // v33: who is online right now (Realtime presence; admin-only view).
  const [online, setOnline] = useState<Set<string>>(new Set());
  useEffect(() => (profile?.role === "ADMIN" ? onPresence((ids) => setOnline(new Set(ids))) : undefined), [profile?.role]);

  if (!ready || loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="h-40 animate-pulse rounded-[2rem] bg-white/5" />
      </main>
    );
  }

  // v33: anyone who isn't an admin gets the decoy terminal (and is quietly logged).
  if (!profile || profile.role !== "ADMIN") return <ClearanceTerminal />;


  async function block(user: AdminUser) {
    const result = await toggleBlockUser({ userId: user.userId });
    if (!result.ok) toast.error(result.error);
    else toast.success(result.isBlocked ? t.userBlocked : t.userUnblocked);
  }

  async function lock(user: AdminUser) {
    const result = await adminLockUser(user.userId);
    if (!result.ok) toast.error(result.error);
    else toast.success(language === "ar" ? `تم قفل حساب ${user.name}` : `${user.name} locked`);
  }

  async function unlock(user: AdminUser) {
    const result = await adminUnlockUser(user.userId);
    if (!result.ok) toast.error(result.error);
    else toast.success(language === "ar" ? `تم فك قفل حساب ${user.name} وتصفير المحاولات` : `${user.name} unlocked, limits reset`);
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
  // v35: a reference used by more than one request is flagged (also covers requests saved before v35).
  const refUse = new Map<string, number>();
  for (const item of requests) {
    const ref = normalizeRef(item.transactionRef || item.transferNumber || "");
    if (ref.length >= 3 && !ref.startsWith("LEGACY")) refUse.set(ref, (refUse.get(ref) ?? 0) + 1);
  }
  const isDup = (item: StoredBalanceRequest) => item.isDuplicateRef === true || (refUse.get(normalizeRef(item.transactionRef || item.transferNumber || "")) ?? 0) > 1;
  const processingShown = applyFilter<StoredBalanceRequest>(
    processing,
    queueFilter,
    (item) => [item.receiptNumber, item.username, item.senderName, item.senderPhone, item.transferNumber, item.referenceNote],
    (item) => item.createdAt,
  ).slice(0, 100);
  const catalogNeedle = catalogQuery.trim().toLowerCase();
  const catalogSearching = catalogNeedle.length > 0;
  const filteredServices = catalogSearching
    ? services.filter((service) => [service.name, service.nameAr, service.slug].some((value) => (value ?? "").toLowerCase().includes(catalogNeedle)))
    : services;
  const shownServices = catalogSearching || isCatalogExpanded ? filteredServices : filteredServices.slice(0, CATALOG_PREVIEW);
  const searchingUsers = Boolean(userFilter.q.trim() || userFilter.from || userFilter.to);
  const usersShown = searchingUsers
    ? applyFilter<AdminUser>(users, userFilter, (user) => [user.name, user.username, user.email, user.phone, user.userId], (user) => user.createdAt).slice(0, 100)
    : [...users].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <p className="text-xs font-bold tracking-[0.22em] text-sky-700 uppercase dark:text-sky-300">{t.control}</p>
      <h1 className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-2xl font-extrabold sm:text-4xl lg:text-5xl">
        <span className="brand-gradient">{t.adminTitle}</span>
        <span className="version-chip price-num rounded-lg px-2 py-0.5 text-[11px] font-bold tracking-normal sm:text-xs" dir="ltr">
          ZovaCharge {APP_VERSION}
        </span>
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <OwnerSessionChip />
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
                <article key={item.id} className={`rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 ${isDup(item) ? "dup-card" : ""}`}>
                  {isDup(item) ? (
                    <p role="alert" className="dup-ref mb-2 flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-xs font-extrabold">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden />
                      {language === "ar" ? "⚠️ تحذير: رقم العملية مكرر ومستخدم مسبقاً!" : "⚠️ Warning: this transaction reference was already used!"}
                    </p>
                  ) : null}
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
                      <span className="truncate">@{item.username}</span>
                      <PayEmblem method={item.method ?? "SHAMCASH"} size="sm" />
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
                      <dd className={`font-semibold ${isDup(item) ? "text-rose-600 dark:text-rose-300" : ""}`} dir="ltr">
                        {item.transactionRef || item.transferNumber || "—"}
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
                <span className={`presence-dot ${online.has(user.userId) ? "is-online" : ""}`} aria-hidden />
                <p className="font-semibold">{user.name}</p>
                <span className="text-sm text-muted">@{user.username}</span>
                <RoleBadge role={user.role} />
                <span className={`presence-pill ${online.has(user.userId) ? "is-online" : ""}`}>
                  {online.has(user.userId) ? (language === "ar" ? "متصل الآن" : "Online now") : language === "ar" ? "غير متصل" : "Offline"}
                </span>
                {user.authProvider === "google" ? (
                  <span className="provider-pill is-google" title="Google">
                    <svg viewBox="0 0 48 48" className="size-3.5" aria-hidden focusable="false">
                      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.6h12.1c-.2 2-1.6 5-4.6 7l7.1 5.5c4.2-3.9 6.5-9.6 6.5-16.1z" />
                      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-1.9 1.3-4.4 2.2-7.5 2.2-5.8 0-10.6-3.8-12.4-9.1l-7.3 5.7C7.9 41.1 15.4 46 24 46z" />
                      <path fill="#FBBC05" d="M11.6 28.2c-.5-1.4-.7-2.8-.7-4.2s.3-2.9.7-4.2l-7.3-5.7C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.9z" />
                      <path fill="#EA4335" d="M24 10.6c4.1 0 6.9 1.8 8.5 3.3l6.2-6.1C34.9 4.2 30 2 24 2 15.4 2 7.9 6.9 4.3 14.1l7.3 5.7C13.4 14.5 18.2 10.6 24 10.6z" />
                    </svg>
                    {language === "ar" ? "Google سريع" : "Google"}
                  </span>
                ) : (
                  <span className="provider-pill">
                    <Mail className="size-3.5" strokeWidth={1.75} aria-hidden />
                    {language === "ar" ? "بريد وكلمة مرور" : "Email & password"}
                  </span>
                )}
                {user.emailVerified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300" title={language === "ar" ? "البريد الإلكتروني موثّق" : "Email verified"}>
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                    {t.verifiedBadge}
                  </span>
                ) : null}
                {user.honeypotFlagged ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[11px] font-extrabold text-amber-700 dark:text-amber-300">
                    <ShieldAlert className="size-3.5" strokeWidth={2} aria-hidden />
                    {language === "ar" ? "حاول دخول الإدارة" : "Probed admin"}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setInspectId(user.userId)}
                  className="ms-auto inline-flex min-h-9 items-center rounded-full border border-[#0284c7]/40 bg-[#0284c7]/10 px-3 text-xs font-bold"
                >
                  {t.fullProfile}
                </button>
                {user.isBlocked ? (
                  <span className="rounded-full border border-rose-300/40 px-2 py-1 text-[10px] font-bold tracking-wide text-rose-700 uppercase dark:text-rose-200">
                    {t.blocked}
                  </span>
                ) : null}
                {user.isLocked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-extrabold text-white shadow-sm">
                    <Lock className="size-3.5" strokeWidth={2.25} />
                    {language === "ar" ? "الحساب مقفل" : "Account locked"}
                  </span>
                ) : (user.failedLoginAttempts ?? 0) > 0 ? (
                  <span className="rounded-full border border-amber-400/50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    {language === "ar" ? `محاولات خاطئة: ${user.failedLoginAttempts}/3` : `Wrong passwords: ${user.failedLoginAttempts}/3`}
                  </span>
                ) : null}
                {(user.dailyLoginCount ?? 0) >= 3 ? (
                  <span className="rounded-full border border-amber-400/50 px-2 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                    {language === "ar" ? "وصل لحد الدخول اليومي" : "Daily sign-in limit reached"}
                  </span>
                ) : null}
              </div>
              {user.isLocked || (user.dailyLoginCount ?? 0) >= 3 || (user.failedLoginAttempts ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => void unlock(user)}
                  className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-rose-600 px-3.5 text-xs font-extrabold text-white shadow-sm hover:bg-rose-700"
                >
                  <LockOpen className="size-4" strokeWidth={2} />
                  {language === "ar" ? "فك القفل وتصفير المحاولات" : "Unlock Account & Reset Limits"}
                </button>
              ) : null}
              <p className="mt-1 text-sm text-muted">
                {user.email} · {money(user.balanceCents, user.currency)} ({user.currency}) · <span dir="ltr">{user.lastIp || t.ipMissing}</span>
                {user.lastCountry ? <span className="ms-1 rounded bg-slate-500/12 px-1.5 py-0.5 text-[11px] font-bold" dir="ltr">{user.lastCountry}</span> : null}
              </p>
              {!user.isLocked && user.role !== "ADMIN" ? (
                <button
                  type="button"
                  onClick={() => void lock(user)}
                  className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-full border border-rose-400/50 px-3.5 text-xs font-extrabold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                >
                  <Lock className="size-4" strokeWidth={2} />
                  {language === "ar" ? "قفل الحساب فوراً" : "Lock account"}
                </button>
              ) : null}
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
            <h2 className="font-display text-2xl font-extrabold">
              {t.serviceSlugs} <span className="text-sm font-bold text-muted tabular-nums">({services.length})</span>
            </h2>
            <button type="button" onClick={openCreateService} className="btn-glow keep-white inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-semibold text-white">
              <Plus className="size-4" /> {language === "ar" ? "إضافة خدمة" : "Add Service"}
            </button>
          </div>
          {/* v35: search reaches every service at once; without a search only the first 3 show. */}
          <label className="relative mb-2 block">
            <span className="sr-only">{language === "ar" ? "ابحث في الخدمات" : "Search services"}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              className="field ps-9"
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder={language === "ar" ? "ابحث بالاسم أو الـ slug…" : "Search by name or slug…"}
            />
          </label>
          {catalogSearching && filteredServices.length === 0 ? <p className="py-3 text-sm text-muted">{t.noResults}</p> : null}
          <div className="grid gap-2" id="admin-catalog-list">
            {shownServices.map((service) => (
              <article key={service.id} className="nova-grid-border glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center">
                <ServiceMark slug={service.slug} category={service.category} name={service.name} imageUrl={service.imageUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{service.name}</p>
                  <p className="text-xs text-muted">
                    {categoryLabel(service.category)} · {service.slug} · from {money(service.startingPriceCents, "USD")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* v32: one-tap out-of-stock switch (cover on the card, no sales). */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(service.outOfStock)}
                    onClick={() =>
                      void setServiceStock(service.slug, !service.outOfStock).then((result) => {
                        if (!result.ok) toast.error(result.error);
                        else toast.success(service.outOfStock ? (language === "ar" ? "عادت متوفرة" : "Back in stock") : language === "ar" ? "تم وضعها: نفدت الكمية" : "Marked out of stock");
                      })
                    }
                    className={`oos-switch inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${service.outOfStock ? "is-on" : ""}`}
                  >
                    <span className="oos-switch-dot" aria-hidden />
                    {service.outOfStock ? (language === "ar" ? "نفدت الكمية" : "Out of stock") : language === "ar" ? "متوفرة" : "In stock"}
                  </button>
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
          {!catalogSearching && filteredServices.length > CATALOG_PREVIEW ? (
            <button
              type="button"
              aria-expanded={isCatalogExpanded}
              aria-controls="admin-catalog-list"
              onClick={() => setIsCatalogExpanded((value) => !value)}
              className="catalog-toggle mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] px-4 text-sm font-extrabold"
            >
              {isCatalogExpanded
                ? language === "ar"
                  ? `إخفاء القائمة (عرض ${CATALOG_PREVIEW} فقط) ↑`
                  : `Collapse List (Show ${CATALOG_PREVIEW}) ↑`
                : language === "ar"
                  ? `عرض جميع الخدمات (+${filteredServices.length - CATALOG_PREVIEW} خدمة أخرى) ↓`
                  : `Show All Services (+${filteredServices.length - CATALOG_PREVIEW} more) ↓`}
            </button>
          ) : null}
        </div>
      </section>
          <GroupsManager />
          <VaultManager services={services} sql={NOVACHARGE_VAULT_SQL} />
          <ImportCatalogBox />
          <HoneypotRadar users={users} onLock={(user) => void lock(user)} />
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
          <OwnerSecurityCard />
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
              {language === "ar" ? "نسخ SQL (الأجزاء 4–7: مفاتيح الباقات + المزامنة الفورية + صور الدعم + الحفظ السريع)" : "Copy SQL (parts 4–7: secrets + realtime + support photos + fast saves)"}
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

/* ------------------------------ v33: decoy admin terminal (honeypot) ------------------------------ */

/**
 * Shown to anyone who isn't an admin on /admin (and /admin-panel, /wp-admin, /secret-admin,
 * which point here). The visit is logged silently; a typed PIN is logged too, then they are
 * told access is denied and sent home. Nothing here can unlock anything.
 */
function ClearanceTerminal() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [denied, setDenied] = useState(false);
  const eventId = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    const path = window.location.pathname || "/admin";
    const key = `zc.trap.${path}`;
    let already = false;
    try {
      already = sessionStorage.getItem(key) === "1";
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: log anyway */
    }
    if (!already) eventId.current = reportHoneypot({ path });
  }, []);

  async function verify() {
    if (denied) return;
    setDenied(true);
    const id = (await eventId.current) ?? null;
    if (id) void reportHoneypot({ path: window.location.pathname, pin, eventId: id });
    else void reportHoneypot({ path: `${window.location.pathname} (pin)`, pin });
    window.setTimeout(() => router.replace("/"), 2600);
  }

  return (
    <main className="trap-stage flex min-h-[70vh] items-center justify-center px-4 py-12" dir="ltr">
      <section className="trap-card w-full max-w-md rounded-[24px] p-6" aria-labelledby="trap-title">
        <div className="flex items-center gap-3">
          <span className="trap-seal grid size-11 place-items-center rounded-2xl" aria-hidden>
            <ShieldCheck className="size-5" strokeWidth={1.75} />
          </span>
          <div>
            <p className="trap-kicker">ZC-OPS · SECURE NODE 07</p>
            <h1 id="trap-title" className="text-lg font-extrabold">
              ZovaCharge Internal Clearance Terminal
            </h1>
          </div>
        </div>
        <p className="trap-mono mt-4 text-xs leading-relaxed">
          &gt; session challenge issued
          <br />
          &gt; operator clearance required · level 3
        </p>
        <label htmlFor="trap-pin" className="mt-5 block text-xs font-bold tracking-[0.18em] uppercase">
          Admin PIN
        </label>
        <input
          id="trap-pin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && pin.length === 6) void verify();
          }}
          placeholder="••••••"
          className="trap-input mt-2 w-full rounded-[14px] px-4 text-center text-2xl tracking-[0.6em]"
          disabled={denied}
        />
        <button type="button" disabled={pin.length !== 6 || denied} onClick={() => void verify()} className="trap-button mt-4 min-h-12 w-full rounded-[14px] text-sm font-extrabold disabled:opacity-50">
          Verify Access
        </button>
        {denied ? (
          <p className="trap-denied mt-4 rounded-[14px] px-3 py-2.5 text-center text-sm font-extrabold" role="alert">
            Access Denied — Session &amp; Account Logged
          </p>
        ) : null}
      </section>
    </main>
  );
}

/* ------------------------------ v35: owner secure session + backup ------------------------------ */

type GuardView = ReturnType<typeof getGuardState>;

function useGuardState(): [GuardView, () => void] {
  const [state, setState] = useState<GuardView>(getGuardState());
  const refresh = useCallback(() => {
    void refreshGuardStatus().then(setState);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return [state, refresh];
}

/** Small header chip: is this browser the verified owner (SQL part 9)? */
function OwnerSessionChip() {
  const { language } = useI18n();
  const ar = language === "ar";
  const [state] = useGuardState();
  if (state === "unknown") return null;
  const on = state === "trusted";
  const label =
    state === "absent"
      ? ar ? "الحماية المالية: شغّل SQL الجزء 9" : "Money guard: run SQL part 9"
      : on
        ? ar ? "🔐 جلسة المالك الآمنة: مفعّلة" : "🔐 Owner secure session: on"
        : ar ? "🔐 جلسة المالك الآمنة: غير مفعّلة" : "🔐 Owner secure session: off";
  return <span className={`owner-chip inline-flex min-h-9 items-center rounded-full px-3 text-xs font-bold ${on ? "is-on" : "is-off"}`}>{label}</span>;
}

function OwnerSecurityCard() {
  const { language } = useI18n();
  const ar = language === "ar";
  const [state, refresh] = useGuardState();
  const [busy, setBusy] = useState(false);

  async function backup() {
    setBusy(true);
    try {
      const result = await downloadAdminBackup();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success(ar ? "تم تنزيل النسخة الاحتياطية" : "Backup downloaded");
    } finally {
      setBusy(false);
    }
  }

  const on = state === "trusted";
  return (
    <section className="admin-box mt-6 rounded-[22px] p-4" aria-labelledby="owner-security-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="owner-security-title" className="inline-flex items-center gap-2 font-display text-base font-extrabold sm:text-lg">
          <ShieldCheck className="size-5 text-sky-600" strokeWidth={1.75} />
          {ar ? "الحماية المالية والنسخ الاحتياطي" : "Money protection & backup"}
        </h2>
        <OwnerSessionChip />
      </div>
      <p className="mt-1 text-sm text-muted">
        {ar
          ? "بعد تشغيل SQL الجزء 9: الشراء يتم على الخادم بعملية واحدة مقفلة (لا خصم مرتين ولا تلاعب بالسعر)، ولا يقبل المتجر تغيير الأرصدة أو الأسعار أو الموافقات إلا من «جلسة المالك الآمنة» — أي بعد الدخول بحساب Google الخاص بالمدير."
          : "After SQL part 9: purchases run on the server in one locked transaction (no double spend, no price tampering), and balances, prices and approvals only change from the owner's secure session — i.e. after signing in with the owner's Google account."}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(NOVACHARGE_SECURITY_SQL).then(() => toast.success(ar ? "تم النسخ — الصقه في Supabase → SQL Editor" : "Copied — paste it in Supabase → SQL Editor"))}
          className="min-h-11 rounded-[14px] border border-slate-300 px-4 text-xs font-bold dark:border-white/15"
        >
          {ar ? "نسخ SQL الجزء 9 (الحماية المالية)" : "Copy SQL part 9 (money protection)"}
        </button>
        {state === "untrusted" ? (
          <button
            type="button"
            onClick={() => void startOwnerSecureSession().then((result) => !result.ok && toast.error(result.error))}
            className="min-h-11 rounded-[14px] border border-sky-500/50 bg-sky-500/10 px-4 text-xs font-bold text-sky-800 dark:text-sky-200"
          >
            {ar ? "تفعيل الجلسة الآمنة عبر Google" : "Start secure session with Google"}
          </button>
        ) : (
          <button type="button" onClick={refresh} className="min-h-11 rounded-[14px] border border-slate-300 px-4 text-xs font-bold dark:border-white/15">
            {ar ? "إعادة فحص الحالة" : "Check again"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void backup()}
          className="btn-glow keep-white inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[14px] px-4 text-xs font-extrabold text-white disabled:opacity-60"
        >
          <Download className="size-4" aria-hidden />
          {busy ? (ar ? "جارٍ التجهيز…" : "Preparing…") : ar ? "💾 تنزيل نسخة احتياطية آمنة (Admin Backup JSON)" : "💾 Download secure backup (Admin Backup JSON)"}
        </button>
      </div>
      {!on ? (
        <p className="mt-2 text-[11px] text-muted">
          {ar
            ? "النسخة الاحتياطية تحتاج جلسة المالك الآمنة (الدخول بـ Google). لا تحتوي كلمات المرور أو الجلسات أو مفاتيح المزودين."
            : "The backup needs the owner's secure session (Google sign-in). It never includes passwords, sessions or provider keys."}
        </p>
      ) : null}
    </section>
  );
}
