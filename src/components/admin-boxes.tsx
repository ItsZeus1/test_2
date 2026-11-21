"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, Coins, Flame, Gamepad2, Globe, History, ImagePlus, KeyRound, Layers, LayoutGrid, LineChart, OctagonX, Plus, ReceiptText, ScanSearch, Search, Trash2, Trophy, Upload, Wallet, X, Zap } from "lucide-react";
import { toast } from "sonner";

import { GROUP_ICON_KEYS, GroupIcon, MethodBadge, methodLabel } from "@/components/pay-emblem";
import { ReceiptBadge, ReceiptModal, type ReceiptData } from "@/components/receipt-badge";
import { orderStatusText, useI18n, useMoney } from "@/lib/i18n";
import { currencyCode, dollarsToCents } from "@/lib/money";
import {
  adjustUserBalance,
  adminSetUserPassword,
  listAdminOrders,
  listBalanceRequests,
  onStoreChange,
  resolveManualOrder,
  getServiceGroups,
  saveServiceGroups,
  getServiceVisits,
  getSypRate,
  cancelOrDeleteStuckOrder,
  isStuckStatus,
  uploadMediaAsset,
  fetchOfficialIcon,
  importCatalog,
  importSlug,
  planCatalogImport,
  servicesNeedingIcons,
  setServiceIcons,
  listHoneypotEvents,
  sanitizePackageNames,
  normalizeRef,
  getMegaSettings,
  megaAdmin,
  saveMegaSettings,
  type MegaLinkService,
  type MegaOverview,
  type ImportPlan,
  type ImportService,
} from "@/lib/store/api";
import { megaPrices, type MegaSettings, type StoredBalanceRequest } from "@/lib/store/data";
import type { AdminOrder, AdminUser, CatalogService, Currency, HoneypotEvent, OrderField, ServiceGroup } from "@/lib/store/types";
import { ServiceMark } from "@/components/service-mark";

/* ------------------------------ shared filter ------------------------------ */

export type Filter = { q: string; from: string; to: string };
export const EMPTY_FILTER: Filter = { q: "", from: "", to: "" };
const MAX_ROWS = 100;

function localDay(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Text search across the given fields + inclusive date range on `date`. */
export function applyFilter<T>(rows: T[], filter: Filter, text: (row: T) => Array<string | null | undefined>, date: (row: T) => string): T[] {
  const needle = filter.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.from || filter.to) {
      const day = localDay(date(row));
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
    }
    if (!needle) return true;
    return text(row).some((value) => (value ?? "").toLowerCase().includes(needle));
  });
}

/** Today's date in the admin's own timezone (YYYY-MM-DD). */
export function todayIso(): string {
  return localDay(new Date().toISOString());
}

/** Activity logs open on today; pending queues and users open on all time (nothing gets hidden). */
export function todayFilter(): Filter {
  const today = todayIso();
  return { q: "", from: today, to: today };
}

/**
 * Compact search + from/to row inside each admin box, with Today / All time shortcuts.
 * The range can never be reversed: from ≤ to is enforced by min/max and auto-corrected on input.
 */
export function BoxFilter({ value, onChange }: { value: Filter; onChange: (next: Filter) => void }) {
  const { t, language } = useI18n();
  const ar = language === "ar";
  const today = todayIso();
  const isToday = value.from === today && value.to === today;
  const allTime = !value.from && !value.to;
  const setFrom = (from: string) => onChange({ ...value, from, to: value.to && from && from > value.to ? from : value.to });
  const setTo = (to: string) => onChange({ ...value, to, from: value.from && to && to < value.from ? to : value.from });
  return (
    <div className="box-filter mt-3 box-border grid w-full min-w-0 grid-cols-1 items-center gap-2.5 sm:grid-cols-2 lg:flex lg:flex-wrap">
      <label className="flex min-h-10 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 sm:col-span-2 lg:min-w-[14rem] lg:flex-1">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          value={value.q}
          onChange={(event) => onChange({ ...value, q: event.target.value })}
          placeholder={t.searchBox}
          className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>
      <input type="date" aria-label={t.fromDate} value={value.from} max={value.to || undefined} onChange={(event) => setFrom(event.target.value)} className="field !min-h-10 min-w-0 !py-1.5 text-xs lg:w-40" dir="ltr" />
      <input type="date" aria-label={t.toDate} value={value.to} min={value.from || undefined} onChange={(event) => setTo(event.target.value)} className="field !min-h-10 min-w-0 !py-1.5 text-xs lg:w-40" dir="ltr" />
      <div className="flex min-w-0 gap-1.5 sm:col-span-2 lg:col-span-1">
        <button
          type="button"
          aria-pressed={isToday}
          onClick={() => onChange({ ...value, from: today, to: today })}
          className={`min-h-10 flex-1 rounded-xl px-2.5 text-[11px] font-bold sm:flex-none ${isToday ? "keep-white bg-indigo-600 text-white" : "border border-white/10 bg-white/5 text-muted"}`}
        >
          {ar ? "اليوم" : "Today"}
        </button>
        <button
          type="button"
          aria-pressed={allTime}
          onClick={() => onChange({ ...value, from: "", to: "" })}
          className={`min-h-10 flex-1 rounded-xl px-2.5 text-[11px] font-bold sm:flex-none ${allTime ? "keep-white bg-indigo-600 text-white" : "border border-white/10 bg-white/5 text-muted"}`}
        >
          {ar ? "كل الأوقات" : "All time"}
        </button>
        {value.q ? (
          <button type="button" onClick={() => onChange({ ...value, q: "" })} aria-label="Clear" className="grid min-h-10 place-items-center rounded-xl border border-white/10 px-2.5">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Count({ shown, total }: { shown: number; total: number }) {
  const { t } = useI18n();
  return <span className="text-[11px] font-semibold text-muted">{t.showingOf.replace("{shown}", String(shown)).replace("{total}", String(total))}</span>;
}

/** High-density admin box shell. */
export function AdminBox({ id, title, badge, children, right, icon: Icon }: { id?: string; title: string; badge?: number; children: ReactNode; right?: ReactNode; icon?: typeof Search }) {
  return (
    <section id={id} className="admin-box mt-6 scroll-mt-24 rounded-2xl p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="inline-flex items-center gap-2 font-display text-base font-extrabold sm:text-lg">
          {Icon ? <Icon className="lux-icon size-5" strokeWidth={1.75} aria-hidden /> : null}
          {title}
        </h2>
        {badge ? <span className="keep-white grid min-w-6 place-items-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white">{badge}</span> : null}
        <span className="ms-auto">{right}</span>
      </header>
      {children}
    </section>
  );
}

/* ------------------------------ data hooks ------------------------------ */

type AdminOrderRow = Awaited<ReturnType<typeof listAdminOrders>> extends infer R ? (R extends { ok: true; orders: infer O } ? O extends Array<infer X> ? X : never : never) : never;

function useAdminOrders(): AdminOrderRow[] {
  const [rows, setRows] = useState<AdminOrderRow[]>([]);
  useEffect(() => {
    let cancel = false;
    const load = () =>
      void listAdminOrders().then((result) => {
        if (!cancel && result.ok) setRows(result.orders);
      });
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, []);
  return rows;
}

function useAllRequests(): StoredBalanceRequest[] {
  const [rows, setRows] = useState<StoredBalanceRequest[]>([]);
  useEffect(() => {
    let cancel = false;
    const load = () =>
      void listBalanceRequests()
        .then((result) => {
          if (!cancel) setRows(result);
        })
        .catch(() => undefined);
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, []);
  return rows;
}

const orderText = (row: AdminOrderRow) => [
  row.receiptNumber,
  row.userName,
  row.username,
  row.email,
  row.phone,
  row.targetId,
  row.serviceName,
  row.packageName,
  ...(row.fields ?? []).map((field) => field.value),
];

/** v31: the customer's custom checkout answers as receipt lines (falls back to the single ID). */
function orderFieldLines(row: { targetId: string; fields?: OrderField[] }, ar: boolean): Array<{ label: string; value: string; ltr?: boolean }> {
  if (row.fields?.length) return row.fields.map((field) => ({ label: (ar ? field.labelAr || field.labelEn : field.labelEn || field.labelAr) || "—", value: field.value }));
  return [{ label: ar ? "المعرّف / الرقم" : "Player ID / phone", value: row.targetId, ltr: true }];
}

/** v31: every field the customer typed, shown clearly on the admin order row. */
function OrderFields({ fields }: { fields?: OrderField[] }) {
  const { language } = useI18n();
  if (!fields?.length) return null;
  const ar = language === "ar";
  return (
    <dl className="order-fields col-span-2 mt-1 flex min-w-0 flex-wrap gap-1.5">
      {fields.map((field) => (
        <div key={field.id} className="order-field inline-flex max-w-full min-w-0 items-baseline gap-1 rounded-lg px-2 py-1 text-xs">
          <dt className="shrink-0 font-bold">{(ar ? field.labelAr || field.labelEn : field.labelEn || field.labelAr) || "—"}:</dt>
          <dd className="min-w-0 break-all select-all" dir="auto">
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------ boxes ------------------------------ */

export function OrdersBox() {
  const { t, language } = useI18n();
  const money = useMoney();
  const rows = useAdminOrders();
  const [filter, setFilter] = useState<Filter>(todayFilter);
  const filtered = useMemo(() => applyFilter(rows, filter, orderText, (row) => row.createdAt), [rows, filter]);
  return (
    <AdminBox id="orders-box" icon={ReceiptText} title={t.ordersBox} right={<Count shown={Math.min(filtered.length, MAX_ROWS)} total={filtered.length} />}>
      <BoxFilter value={filter} onChange={setFilter} />
      <div className="admin-table mt-3 max-h-[26rem] overflow-auto rounded-xl">
        {filtered.length === 0 ? <p className="p-4 text-sm text-muted">{t.noResults}</p> : null}
        {filtered.slice(0, MAX_ROWS).map((row) => (
          <div key={row.id} className="admin-row grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
            <p className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
              <ReceiptBadge value={row.receiptNumber} />
              <span className="truncate">{row.serviceName} · {row.packageName}</span>
            </p>
            <p className="price-num text-end text-sm">{money(row.priceCents, row.currency)}</p>
            <p className="min-w-0 truncate text-xs text-muted">
              {row.userName} · <span dir="ltr">{row.email}</span> · ID <span dir="ltr">{row.targetId}</span> · IP <span dir="ltr">{row.ipAddress || "—"}</span>
            </p>
            <p className="text-end text-[11px] text-muted">
              {orderStatusText(t, row.status)} · {new Date(row.createdAt).toLocaleString(language === "ar" ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "short", timeStyle: "short" })}
            </p>
            <OrderFields fields={row.fields} />
          </div>
        ))}
      </div>
    </AdminBox>
  );
}

export function ManualQueueBox() {
  const { t, language } = useI18n();
  const money = useMoney();
  const rows = useAdminOrders();
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [busy, setBusy] = useState<string | null>(null);
  // Manual services + vault orders the vault could not fill (refund or deliver by hand).
  const pending = useMemo(() => rows.filter((row) => row.status === "PENDING_MANUAL" || row.status === "PENDING_VAULT"), [rows]);
  const filtered = useMemo(() => applyFilter(pending, filter, orderText, (row) => row.createdAt), [pending, filter]);

  async function decide(orderId: string, action: "ACCEPT" | "DECLINE") {
    setBusy(orderId);
    try {
      const result = await resolveManualOrder({ orderId, action });
      if (!result.ok) toast.error(result.error);
      else toast.success(action === "ACCEPT" ? t.manualAccepted : t.manualDeclined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminBox id="manual-queue" icon={Globe} title={t.manualQueue} badge={pending.length}>
      <BoxFilter value={filter} onChange={setFilter} />
      <div className="mt-3 grid gap-2">
        {filtered.length === 0 ? <p className="text-sm text-muted">{pending.length ? t.noResults : t.queueEmpty}</p> : null}
        {filtered.slice(0, MAX_ROWS).map((row) => (
          <article key={row.id} className="admin-row rounded-xl px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <ReceiptBadge value={row.receiptNumber} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">
                {row.serviceName} · {row.packageName}
              </span>
              <span className="price-num text-sm">{money(row.priceCents, row.currency)}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {row.userName} · <span dir="ltr">{row.email}</span> · {new Date(row.createdAt).toLocaleString(language === "ar" ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "short", timeStyle: "short" })}
            </p>
            {row.status === "PENDING_VAULT" ? (
              <p className="mt-1 text-sm font-semibold text-amber-600">{t.vaultSoldOut}</p>
            ) : row.fields?.length ? (
              <OrderFields fields={row.fields} />
            ) : (
              <p className="mt-1 text-sm">
                {t.landlineLabel}:{" "}
                <span className="price-num" dir="ltr">
                  {row.targetId}
                </span>
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy === row.id} onClick={() => void decide(row.id, "ACCEPT")} className="keep-white min-h-10 rounded-xl bg-emerald-600 text-xs font-bold text-white disabled:opacity-60">
                <Check className="me-1 inline size-4 align-[-3px]" strokeWidth={2} />
                {t.acceptOrder}
              </button>
              <button type="button" disabled={busy === row.id} onClick={() => void decide(row.id, "DECLINE")} className="min-h-10 rounded-xl border border-rose-400/50 text-xs font-bold text-rose-500 disabled:opacity-60">
                <X className="me-1 inline size-4 align-[-3px]" strokeWidth={2} />
                {t.declineOrder}
              </button>
            </div>
          </article>
        ))}
      </div>
    </AdminBox>
  );
}

export function TopupHistoryBox() {
  const { t, language } = useI18n();
  const money = useMoney();
  const rows = useAllRequests();
  const [filter, setFilter] = useState<Filter>(todayFilter);
  const processed = useMemo(() => rows.filter((row) => row.status !== "PROCESSING"), [rows]);
  const filtered = useMemo(
    () =>
      applyFilter<StoredBalanceRequest>(
        processed,
        filter,
        (row) => [row.receiptNumber, row.username, row.senderName, row.senderPhone, row.transferNumber, row.referenceNote],
        (row) => row.createdAt,
      ),
    [processed, filter],
  );
  const stamp = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(language === "ar" ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "short", timeStyle: "short" }) : "—";
  return (
    <AdminBox id="topup-history" icon={History} title={t.topupHistory} right={<Count shown={Math.min(filtered.length, MAX_ROWS)} total={filtered.length} />}>
      <BoxFilter value={filter} onChange={setFilter} />
      <div className="admin-table mt-3 max-h-[26rem] overflow-auto rounded-xl">
        {filtered.length === 0 ? <p className="p-4 text-sm text-muted">{t.noResults}</p> : null}
        {filtered.slice(0, MAX_ROWS).map((row) => {
          const approved = row.status === "APPROVED";
          const method = row.method ?? "SHAMCASH";
          return (
            <div key={row.id} className="admin-row grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <p className="flex min-w-0 flex-wrap items-center gap-1.5">
                <ReceiptBadge value={row.receiptNumber ?? ""} />
                <MethodBadge method={method} t={t} />
                <span className="truncate font-semibold">@{row.username}</span>
              </p>
              <p className="price-num text-end text-sm">{money(row.cents, row.currency ?? "USD")}</p>
              <p className="min-w-0 truncate text-xs text-muted">
                {method === "SHAMCASH" ? row.senderName || row.referenceNote : <span dir="ltr">{row.senderPhone}</span>} · #<span dir="ltr">{row.transferNumber || "—"}</span>
              </p>
              <p className={`text-end text-[11px] font-bold ${approved ? "text-emerald-500" : "text-rose-500"}`}>{approved ? t.statusApproved : t.statusRejected}</p>
              <p className="col-span-2 text-[11px] text-muted">
                {stamp(row.createdAt)} → {t.approvedAt}: {stamp(row.resolvedAt)}
              </p>
            </div>
          );
        })}
      </div>
    </AdminBox>
  );
}

/* ------------------------------ user controls ------------------------------ */

/** Set exact / add / deduct, with an optional reason. */
export function BalanceEditor({ userId, currency }: { userId: string; currency: Currency }) {
  const { t, language } = useI18n();
  const [mode, setMode] = useState<"SET" | "ADD" | "DEDUCT">("ADD");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    const cents = dollarsToCents(amount);
    if (cents == null) {
      toast.error(t.minDollar);
      return;
    }
    setBusy(true);
    try {
      const result = await adjustUserBalance({ userId, mode, cents, reason });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(t.balanceSaved);
        setAmount("");
        setReason("");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold text-muted">
        <Coins className="me-1 inline size-3.5 align-[-2px]" strokeWidth={1.75} />
        {t.editBalance} ({currencyCode(currency, language)})
      </p>
      <div className="mt-1 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/5 p-1" role="group">
        {([
          ["SET", t.setExact],
          ["ADD", t.addBalance],
          ["DEDUCT", t.deductBalance],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} className={`min-h-8 rounded-lg text-[11px] font-bold ${mode === id ? "keep-white bg-indigo-600 text-white" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)_auto] gap-1.5">
        <input className="field !min-h-9 !py-1.5 text-sm" dir="ltr" inputMode="decimal" placeholder={currency === "SYP" ? "5000" : "10.00"} value={amount} onChange={(event) => setAmount(event.target.value)} />
        <input className="field !min-h-9 !py-1.5 text-xs" placeholder={t.reasonPh} value={reason} onChange={(event) => setReason(event.target.value)} />
        <button type="button" disabled={busy || !amount} onClick={() => void save()} className="btn-glow keep-white min-h-9 rounded-xl px-3 text-xs font-bold text-white disabled:opacity-60">
          {t.save}
        </button>
      </div>
    </div>
  );
}

/** Admin sets a new password (stored hashed; current password is never shown). */
export function PasswordSetter({ userId }: { userId: string }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const result = await adminSetUserPassword({ userId, password: value });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(t.passwordSet);
        setValue("");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold text-muted">
        <KeyRound className="me-1 inline size-3.5 align-[-2px]" strokeWidth={1.75} />
        {t.setPassword}
      </p>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <input className="field !min-h-9 !py-1.5 text-sm" dir="ltr" type="text" autoComplete="new-password" placeholder={t.newPasswordPh} value={value} onChange={(event) => setValue(event.target.value)} />
        <button type="button" disabled={busy || value.length < 8} onClick={() => void save()} className="min-h-9 rounded-xl border border-white/15 px-3 text-xs font-bold disabled:opacity-60">
          {t.save}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------ service groups manager ------------------------------ */

/** Rename, re-image, reorder, create and delete (custom) service groups. Saved online with the store. */
export function GroupsManager() {
  const { language } = useI18n();
  const ar = language === "ar";
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRefValue(dirty);

  useEffect(() => {
    let cancel = false;
    const load = () =>
      void getServiceGroups().then((rows) => {
        if (!cancel && !dirtyRef.current) setGroups(rows);
      });
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (id: string, next: Partial<ServiceGroup>) => {
    setDirty(true);
    setGroups((current) => current.map((group) => (group.id === id ? { ...group, ...next } : group)));
  };
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= groups.length) return;
    setDirty(true);
    setGroups((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item) next.splice(target, 0, item);
      return next;
    });
  };
  const add = () => {
    setDirty(true);
    const id = `grp_${Date.now().toString(36)}`;
    setGroups((current) => [...current, { id, slug: id, name: "New group", nameAr: "قسم جديد", imageUrl: "", icon: "grid", order: current.length }]);
  };
  const upload = (id: string, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) {
      toast.error(ar ? "استخدم صورة أصغر من 12 ميغابايت." : "Use an image under 12 MB.");
      return;
    }
    // v29: compressed WebP in the media bucket; the group keeps only the link.
    const pending = toast.loading(ar ? "جارٍ رفع الصورة…" : "Uploading image…");
    void uploadMediaAsset(file, "group").then((result) => {
      toast.dismiss(pending);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      patch(id, { imageUrl: result.url });
    });
  };
  async function save() {
    setBusy(true);
    try {
      const result = await saveServiceGroups({ groups: groups.map((group, order) => ({ ...group, order })) });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDirty(false);
      toast.success(ar ? "تم حفظ الأقسام" : "Groups saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminBox id="groups-manager" icon={LayoutGrid} title={ar ? "إدارة أقسام ومجموعات الخدمات" : "Manage Service Groups"}>
      <div className="mt-3 grid gap-2">
        {groups.map((group, index) => (
          <div key={group.id} className="admin-row grid gap-2 rounded-xl px-3 py-2.5 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
            <label className="relative grid h-16 w-full cursor-pointer place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/5 text-2xl sm:w-20">
              {group.imageUrl ? <img src={group.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <GroupIcon name={group.icon} className="size-7 text-indigo-500" />}
              <span className="absolute end-1 bottom-1 grid size-6 place-items-center rounded-md bg-slate-950/60 text-white">
                <Upload className="size-3" />
              </span>
              <input type="file" accept="image/*" className="sr-only" onChange={(event) => upload(group.id, event.target.files?.[0])} />
            </label>
            <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
              <select className="field !min-h-9 !py-1.5 !px-1 text-xs" aria-label="Icon" value={group.icon} onChange={(event) => patch(group.id, { icon: event.target.value })}>
                {GROUP_ICON_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
              <input className="field !min-h-9 !py-1.5 text-sm" aria-label="Name" value={group.name} onChange={(event) => patch(group.id, { name: event.target.value })} />
              <input className="field !min-h-9 !py-1.5 text-sm" dir="rtl" aria-label="الاسم" value={group.nameAr} onChange={(event) => patch(group.id, { nameAr: event.target.value })} />
              <input
                className="field col-span-3 !min-h-9 !py-1.5 text-xs"
                dir="ltr"
                placeholder="https://… cover image (optional)"
                value={group.imageUrl.startsWith("data:") ? "" : group.imageUrl}
                onChange={(event) => patch(group.id, { imageUrl: event.target.value })}
              />
            </div>
            <div className="flex gap-1.5">
              <button type="button" aria-label="Up" onClick={() => move(index, -1)} className="grid size-9 place-items-center rounded-lg border border-white/10">
                <ArrowUp className="size-4" />
              </button>
              <button type="button" aria-label="Down" onClick={() => move(index, 1)} className="grid size-9 place-items-center rounded-lg border border-white/10">
                <ArrowDown className="size-4" />
              </button>
              {!group.builtIn ? (
                <button
                  type="button"
                  aria-label="Delete"
                  onClick={() => {
                    setDirty(true);
                    setGroups((current) => current.filter((item) => item.id !== group.id));
                  }}
                  className="grid size-9 place-items-center rounded-lg border border-rose-400/40 text-rose-500"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={add} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-xs font-bold">
          <Plus className="size-4" />
          {ar ? "قسم جديد" : "New group"}
        </button>
        <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="btn-glow keep-white min-h-10 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-60">
          {ar ? "حفظ الأقسام" : "Save groups"}
        </button>
      </div>
    </AdminBox>
  );
}

/** Latest value in a ref (so async loaders can read it without re-subscribing). */
function useRefValue<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/* ------------------------------ unified receipt & transaction inspector ------------------------------ */

type InspectorMode = "all" | "topups" | "orders" | "manual" | "stuck";
type InspectorRow = {
  key: string;
  kind: "topup" | "order";
  receipt: string;
  title: string;
  sub: string;
  amountCents: number;
  currency: Currency;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  search: Array<string | null | undefined>;
  orderId?: string;
  receiptData: ReceiptData;
  /** v35: duplicate transfer reference. */
  dup?: boolean;
};

/** One window for wallet top-ups (TOP-…) and service charges (ZC-/NC-…), plus the manual queue. */
export function UnifiedInspector() {
  const { t, language } = useI18n();
  const ar = language === "ar";
  const money = useMoney();
  const orders = useAdminOrders();
  const requests = useAllRequests();
  const [mode, setMode] = useState<InspectorMode>("all");
  const [filter, setFilter] = useState<Filter>(todayFilter);
  const [open, setOpen] = useState<ReceiptData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo<InspectorRow[]>(() => {
    // v35: duplicate transfer references (flag saved on the request, or seen live across requests).
    const refUse = new Map<string, number>();
    for (const item of requests) {
      const ref = normalizeRef(item.transactionRef || item.transferNumber || "");
      if (ref.length >= 3 && !ref.startsWith("LEGACY")) refUse.set(ref, (refUse.get(ref) ?? 0) + 1);
    }
    const topupRows: InspectorRow[] = requests.map((item) => {
      const dup = item.isDuplicateRef === true || (refUse.get(normalizeRef(item.transactionRef || item.transferNumber || "")) ?? 0) > 1;
      const method = item.method ?? "SHAMCASH";
      const sham = method === "SHAMCASH";
      const sender = sham ? item.senderName || item.referenceNote : item.senderPhone;
      const status = item.status === "APPROVED" ? t.statusApproved : item.status === "REJECTED" ? t.statusRejected : ar ? "قيد المراجعة" : "Under review";
      return {
        key: `t-${item.id}`,
        kind: "topup",
        receipt: item.receiptNumber ?? "",
        title: `@${item.username}`,
        sub: `${methodLabel(t, method)} · ${sender} · #${item.transactionRef || item.transferNumber || "—"}`,
        dup,
        amountCents: item.cents,
        currency: item.currency ?? "USD",
        status: item.status,
        createdAt: item.createdAt,
        resolvedAt: item.resolvedAt,
        search: [item.receiptNumber, item.username, item.senderName, item.senderPhone, item.transferNumber, item.referenceNote],
        receiptData: {
          receipt: item.receiptNumber ?? item.id,
          kind: ar ? "إيصال شحن المحفظة" : "Wallet top-up receipt",
          title: methodLabel(t, method),
          amount: money(item.cents, item.currency ?? "USD"),
          status,
          tone: item.status === "APPROVED" ? "ok" : item.status === "REJECTED" ? "bad" : "wait",
          lines: [
            { label: ar ? "المستخدم" : "User", value: `@${item.username}` },
            { label: sham ? t.senderName : t.senderPhone, value: sender ?? "", ltr: !sham },
            { label: t.transferNumber, value: item.transferNumber ?? "", ltr: true },
          ],
          createdAt: item.createdAt,
          completedAt: item.resolvedAt,
          ...(dup ? { alert: ar ? "⚠️ تحذير: رقم العملية مكرر ومستخدم مسبقاً!" : "⚠️ Warning: this transaction reference was already used!" } : {}),
        },
      };
    });
    const orderRows: InspectorRow[] = orders.map((row) => ({
      key: `o-${row.id}`,
      kind: "order",
      receipt: row.receiptNumber,
      title: `${row.serviceName} · ${row.packageName}`,
      sub: `${row.userName} · ${row.email} · ${row.targetId}`,
      amountCents: row.priceCents,
      currency: row.currency,
      status: row.status,
      createdAt: row.createdAt,
      resolvedAt: row.resolvedAt ?? null,
      search: orderText(row),
      orderId: row.id,
      receiptData: {
        receipt: row.receiptNumber,
        kind: ar ? "إيصال شحن خدمة / لعبة" : "Service charge receipt",
        title: row.serviceName,
        amount: money(row.priceCents, row.currency),
        status: orderStatusText(t, row.status),
        tone: row.status === "DECLINED" || row.status === "failed" ? "bad" : row.status.startsWith("PENDING") ? "wait" : "ok",
        lines: [
          { label: ar ? "الباقة" : "Package", value: row.packageName },
          { label: ar ? "المستخدم" : "User", value: `${row.userName} · ${row.email}` },
          ...orderFieldLines(row, ar),
          { label: "IP", value: row.ipAddress ?? "", ltr: true },
        ],
        createdAt: row.createdAt,
        completedAt: row.resolvedAt ?? null,
      },
    }));
    return [...topupRows, ...orderRows].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [requests, orders, t, ar, money]);

  const scoped = rows.filter((row) =>
    mode === "topups"
      ? row.kind === "topup"
      : mode === "orders"
        ? row.kind === "order"
        : mode === "manual"
          ? row.status === "PENDING_MANUAL"
          : mode === "stuck"
            ? row.kind === "order" && isStuckStatus(row.status)
            : true,
  );
  const shown = applyFilter<InspectorRow>(scoped, filter, (row) => row.search, (row) => row.createdAt);
  const manualCount = rows.filter((row) => row.status === "PENDING_MANUAL").length;
  const stuckCount = rows.filter((row) => row.kind === "order" && isStuckStatus(row.status)).length;

  async function cancelStuck(orderId: string, how: "CANCEL_AND_REFUND" | "DELETE_RECORD") {
    setBusy(orderId);
    try {
      const result = await cancelOrDeleteStuckOrder(orderId, how);
      if (!result.ok) toast.error(result.error);
      else toast.success(how === "DELETE_RECORD" ? (ar ? "تم حذف الطلب وإرجاع الرصيد" : "Order deleted and refunded") : ar ? "تم إلغاء الطلب وإرجاع الرصيد للمستخدم" : "Order cancelled and refunded");
    } finally {
      setBusy(null);
    }
  }

  async function decide(orderId: string, action: "ACCEPT" | "DECLINE") {
    setBusy(orderId);
    try {
      const result = await resolveManualOrder({ orderId, action });
      if (!result.ok) toast.error(result.error);
      else toast.success(action === "ACCEPT" ? t.manualAccepted : t.manualDeclined);
    } finally {
      setBusy(null);
    }
  }

  const modes: Array<{ id: InspectorMode; label: string; icon: typeof Search; badge?: number }> = [
    { id: "all", label: ar ? "الكل (شحن + مشتريات)" : "All (top-ups + purchases)", icon: Layers },
    { id: "topups", label: ar ? "إيصالات شحن المحفظة (TOP)" : "Wallet top-ups (TOP)", icon: Wallet },
    { id: "orders", label: ar ? "شحن الخدمات والألعاب (ZC)" : "Service & game charges (ZC)", icon: Gamepad2 },
    { id: "manual", label: ar ? "الطلبات اليدوية قيد الانتظار" : "Manual orders pending", icon: Globe, badge: manualCount },
    { id: "stuck", label: ar ? "الطلبات العالقة / قيد المعالجة" : "Stuck / Processing", icon: Zap, badge: stuckCount },
  ];

  return (
    <AdminBox
      id="receipt-inspector"
      icon={ScanSearch}
      title={ar ? "مركز فحص الإيصالات والعمليات" : "Unified Receipt & Transaction Inspector"}
      right={<Count shown={Math.min(shown.length, MAX_ROWS)} total={shown.length} />}
    >
      <div className="inspector-modes mt-3 grid w-full min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5" role="tablist">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            onClick={() => {
              setMode(item.id);
              if (item.id === "manual") setFilter((current) => ({ ...current, from: "", to: "" }));
            }}
            className={`relative flex min-h-11 items-center gap-2 rounded-xl px-3 text-start text-[11px] font-bold sm:text-xs ${mode === item.id ? "keep-white bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow" : "border border-white/10 bg-white/5 text-muted"}`}
          >
            <item.icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="min-w-0 leading-tight">{item.label}</span>
            {item.badge ? <span className="keep-white ms-auto grid min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] text-white">{item.badge}</span> : null}
          </button>
        ))}
      </div>
      <BoxFilter value={filter} onChange={setFilter} />
      <div className="admin-table mt-3 max-h-[30rem] overflow-auto rounded-xl">
        {shown.length === 0 ? <p className="p-4 text-sm text-muted">{t.noResults}</p> : null}
        {shown.slice(0, MAX_ROWS).map((row) => (
          <div key={row.key} className="admin-row px-3 py-2.5 text-sm">
            <button type="button" onClick={() => setOpen(row.receiptData)} className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-start">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
                {row.kind === "topup" ? <Wallet className="size-4 shrink-0 text-emerald-600" strokeWidth={1.75} /> : <Gamepad2 className="size-4 shrink-0 text-indigo-600" strokeWidth={1.75} />}
                <span className="price-num text-[12px]" dir="ltr">
                  #{row.receipt || "—"}
                </span>
                <span className="truncate">{row.title}</span>
                {row.dup ? <span className="dup-ref rounded-full px-2 py-0.5 text-[10px] font-extrabold">{ar ? "⚠️ مرجع مكرر" : "⚠️ Duplicate ref"}</span> : null}
              </span>
              <span className="price-num text-end text-sm">{money(row.amountCents, row.currency)}</span>
              <span className="min-w-0 truncate text-xs text-muted">{row.sub}</span>
              <span className="text-end text-[11px] text-muted">
                {row.receiptData.status} · {new Date(row.createdAt).toLocaleString(ar ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </button>
            {row.kind === "order" && isStuckStatus(row.status) && row.orderId ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy === row.orderId}
                  onClick={() => void cancelStuck(row.orderId as string, "CANCEL_AND_REFUND")}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-400/50 bg-rose-500/5 text-xs font-bold text-rose-600 disabled:opacity-60"
                >
                  <OctagonX className="size-4" strokeWidth={1.75} />
                  {ar ? "إلغاء الطلب العالق واسترداد الرصيد" : "Cancel stuck order & refund"}
                </button>
                <button
                  type="button"
                  disabled={busy === row.orderId}
                  aria-label={ar ? "حذف السجل وإرجاع الرصيد" : "Delete record and refund"}
                  title={ar ? "حذف السجل وإرجاع الرصيد" : "Delete record and refund"}
                  onClick={() => void cancelStuck(row.orderId as string, "DELETE_RECORD")}
                  className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 text-muted disabled:opacity-60"
                >
                  <Trash2 className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            ) : null}
            {row.status === "PENDING_MANUAL" && row.orderId ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy === row.orderId} onClick={() => void decide(row.orderId as string, "ACCEPT")} className="keep-white min-h-10 rounded-xl bg-emerald-600 text-xs font-bold text-white disabled:opacity-60">
                  <Check className="me-1 inline size-4 align-[-3px]" strokeWidth={2} />
                  {t.acceptOrder}
                </button>
                <button type="button" disabled={busy === row.orderId} onClick={() => void decide(row.orderId as string, "DECLINE")} className="min-h-10 rounded-xl border border-rose-400/50 text-xs font-bold text-rose-600 disabled:opacity-60">
                  <X className="me-1 inline size-4 align-[-3px]" strokeWidth={2} />
                  {t.declineOrder}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <ReceiptModal data={open} onClose={() => setOpen(null)} />
    </AdminBox>
  );
}

/* ------------------------------ analytics: spotlights + motion chart ------------------------------ */

type Range = "7" | "30" | "all";
const DAY = 86_400_000;

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const dayKey = (iso: string | number) => {
  const date = new Date(iso);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

export function AnalyticsPanel({ users, services }: { users: AdminUser[]; services: CatalogService[] }) {
  const { language } = useI18n();
  const ar = language === "ar";
  const money = useMoney();
  const orders = useAdminOrders();
  const [visits, setVisits] = useState<Record<string, number>>({});
  const [rate, setRate] = useState(145);
  const [range, setRange] = useState<Range>("7");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    const load = () => {
      void Promise.all([getServiceVisits(), getSypRate()]).then(([nextVisits, nextRate]) => {
        if (cancel) return;
        setVisits(nextVisits);
        setRate(nextRate || 145);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, []);

  const paid = useMemo(() => orders.filter((order) => order.status !== "failed" && order.status !== "DECLINED"), [orders]);
  const usd = (cents: number, currency: Currency) => (currency === "SYP" ? cents / rate : cents);

  // Spotlights
  const bySlug = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number; name: string }>();
    for (const order of paid) {
      if (order.status.startsWith("PENDING")) continue;
      const entry = map.get(order.serviceSlug) ?? { orders: 0, revenue: 0, name: order.serviceName };
      entry.orders += 1;
      entry.revenue += usd(order.priceCents, order.currency);
      map.set(order.serviceSlug, entry);
    }
    return map;
  }, [paid, rate]); // eslint-disable-line react-hooks/exhaustive-deps
  const topVisited = (Object.entries(visits) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0];
  const topSold = [...bySlug.entries()].sort((a, b) => b[1].orders - a[1].orders)[0];
  const serviceFor = (slug?: string) => services.find((service) => service.slug === slug);
  const visitedService = serviceFor(topVisited?.[0]);
  const soldService = serviceFor(topSold?.[0]);
  const conversion = topVisited && topVisited[1] > 0 ? ((bySlug.get(topVisited[0])?.orders ?? 0) / topVisited[1]) * 100 : 0;

  // Chart series (USD-equivalent earnings per day + cumulative registered users)
  const series = useMemo(() => {
    const today = dayKey(Date.now());
    const earliest = Math.min(
      today,
      ...users.map((user) => dayKey(user.createdAt)),
      ...paid.map((order) => dayKey(order.createdAt)),
    );
    const days = range === "all" ? Math.max(2, Math.round((today - earliest) / DAY) + 1) : Number(range);
    const step = days > 120 ? 7 : 1; // weekly buckets for long histories
    const buckets = Math.ceil(days / step);
    const start = today - (buckets * step - 1) * DAY;
    const earnings = new Array(buckets).fill(0);
    const newUsers = new Array(buckets).fill(0);
    for (const order of paid) {
      const index = Math.floor((dayKey(order.createdAt) - start) / (DAY * step));
      if (index >= 0 && index < buckets) earnings[index] += usd(order.priceCents, order.currency);
    }
    let before = 0;
    for (const user of users) {
      const index = Math.floor((dayKey(user.createdAt) - start) / (DAY * step));
      if (index < 0) before += 1;
      else if (index < buckets) newUsers[index] += 1;
    }
    let running = before;
    const totalUsers = newUsers.map((count) => (running += count));
    const labels = earnings.map((_, index) => new Date(start + index * step * DAY));
    return { earnings, newUsers, totalUsers, labels, step };
  }, [users, paid, range, rate]); // eslint-disable-line react-hooks/exhaustive-deps

  const W = 600;
  const H = 200;
  const pad = 14;
  const n = series.earnings.length;
  const x = (index: number) => pad + (n <= 1 ? 0 : (index * (W - pad * 2)) / (n - 1));
  const maxE = Math.max(1, ...series.earnings);
  const maxU = Math.max(1, ...series.totalUsers);
  const ePts = series.earnings.map((value, index) => [x(index), H - pad - (value / maxE) * (H - pad * 2)] as [number, number]);
  const uPts = series.totalUsers.map((value, index) => [x(index), H - pad - (value / maxU) * (H - pad * 2)] as [number, number]);
  const ePath = smoothPath(ePts);
  const area = ePts.length ? `${ePath} L${x(n - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z` : "";
  const totalEarnings = series.earnings.reduce((sum, value) => sum + value, 0);
  const totalNew = series.newUsers.reduce((sum, value) => sum + value, 0);
  const fmtDate = (date: Date) => date.toLocaleDateString(ar ? "ar-SY-u-nu-latn" : "en-US", { month: "short", day: "numeric" });

  const Spot = ({ icon: Icon, title, service, name, lines }: { icon: typeof Search; title: string; service?: CatalogService; name?: string; lines: Array<[string, string]> }) => (
    <article className="spotlight-card rounded-[22px] p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
        <Icon className="size-4 text-sky-600" strokeWidth={1.75} />
        {title}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span className="icon-pedestal rounded-[14px]">
          {service ? (
            <ServiceMark slug={service.slug} category={service.category} name={service.name} imageUrl={service.imageUrl} size="sm" />
          ) : (
            <span className="grid size-11 place-items-center text-muted">—</span>
          )}
        </span>
        <p className="item-name min-w-0 truncate text-base font-extrabold">{name ?? (ar ? "لا توجد بيانات بعد" : "No data yet")}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {lines.map(([label, value]) => (
          <div key={label} className="rounded-[12px] bg-slate-500/5 px-3 py-2">
            <dt className="text-[11px] text-muted">{label}</dt>
            <dd className="price-num text-base">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );

  return (
    <section className="mt-6 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Spot
          icon={Flame}
          title={ar ? "اللعبة الأكثر زيارة" : "Most Visited Game"}
          service={visitedService}
          name={visitedService?.name ?? topVisited?.[0]}
          lines={[
            [ar ? "الزيارات" : "Visits", String(topVisited?.[1] ?? 0)],
            [ar ? "معدل التحويل" : "Conversion", `${conversion.toFixed(1)}%`],
          ]}
        />
        <Spot
          icon={Trophy}
          title={ar ? "اللعبة الأكثر مبيعاً" : "Most Purchased Game"}
          service={soldService}
          name={soldService?.name ?? topSold?.[1].name}
          lines={[
            [ar ? "الطلبات المكتملة" : "Completed orders", String(topSold?.[1].orders ?? 0)],
            [ar ? "الإيرادات" : "Revenue", money(Math.round(topSold?.[1].revenue ?? 0), "USD")],
          ]}
        />
      </div>

      <AdminBox icon={LineChart} title={ar ? "مخطط نمو المستخدمين والأرباح" : "Users & Earnings Growth"}>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4">
            <p>
              <span className="block text-[11px] text-muted">{ar ? "الأرباح ($)" : "Earnings ($)"}</span>
              <span className="price-num text-xl text-sky-700 dark:text-sky-300">{money(Math.round(totalEarnings), "USD")}</span>
            </p>
            <p>
              <span className="block text-[11px] text-muted">{ar ? "إجمالي المستخدمين" : "Total users"}</span>
              <span className="price-num text-xl text-emerald-700 dark:text-emerald-300">
                {series.totalUsers[n - 1] ?? users.length} <span className="text-xs">(+{totalNew})</span>
              </span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-[16px] border border-white/10 bg-white/5 p-1" role="tablist">
            {([
              ["7", ar ? "آخر 7 أيام" : "7 days"],
              ["30", ar ? "آخر 30 يوماً" : "30 days"],
              ["all", ar ? "الكل" : "All"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={range === id}
                onClick={() => {
                  setRange(id);
                  setHover(null);
                }}
                className={`min-h-9 rounded-[12px] px-3 text-xs font-bold ${range === id ? "keep-white bg-gradient-to-r from-[#1e3a8a] to-[#0284c7] text-white" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative mt-3" dir="ltr" onMouseLeave={() => setHover(null)}>
          <svg key={range} viewBox={`0 0 ${W} ${H}`} className="motion-chart h-52 w-full" role="img" aria-label={ar ? "مخطط الأرباح والمستخدمين" : "Earnings and users chart"}>
            <defs>
              <linearGradient id="earn-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={pad} x2={W - pad} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} stroke="currentColor" strokeOpacity="0.08" />
            ))}
            <path d={area} fill="url(#earn-fill)" className="chart-area" />
            <path d={ePath} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" pathLength={1} className="chart-line" />
            <path d={smoothPath(uPts)} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" pathLength={1} className="chart-line chart-line-2" />
            {hover !== null ? (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={pad} y2={H - pad} stroke="#0f172a" strokeOpacity="0.25" strokeDasharray="3 3" />
                <circle cx={ePts[hover][0]} cy={ePts[hover][1]} r="4.5" fill="#0284c7" stroke="#fff" strokeWidth="2" />
                <circle cx={uPts[hover][0]} cy={uPts[hover][1]} r="4.5" fill="#10b981" stroke="#fff" strokeWidth="2" />
              </>
            ) : null}
            {series.earnings.map((_, index) => (
              <rect key={index} x={x(index) - (W - pad * 2) / Math.max(1, n - 1) / 2} y={0} width={(W - pad * 2) / Math.max(1, n - 1)} height={H} fill="transparent" onMouseEnter={() => setHover(index)} onTouchStart={() => setHover(index)} />
            ))}
          </svg>
          {hover !== null ? (
            <div className="chart-tip pointer-events-none absolute top-1 rounded-[12px] px-3 py-2 text-xs" style={{ left: `${Math.min(78, Math.max(2, (x(hover) / W) * 100 - 10))}%` }}>
              <p className="font-bold">
                {fmtDate(series.labels[hover])}
                {series.step > 1 ? (ar ? " (أسبوع)" : " (week)") : ""}
              </p>
              <p className="price-num text-sky-700">{money(Math.round(series.earnings[hover]), "USD")}</p>
              <p className="text-emerald-700">
                +{series.newUsers[hover]} {ar ? "مستخدم جديد" : "new users"} · {series.totalUsers[hover]}
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-4 text-[11px] font-semibold text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-[#0284c7]" /> {ar ? "الأرباح (بالدولار)" : "Earnings (USD)"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-[#10b981]" /> {ar ? "إجمالي المستخدمين" : "Total users"}
          </span>
        </div>
      </AdminBox>
    </section>
  );
}

/* ------------------------------ v32: catalog import ------------------------------ */

/**
 * Import a crawled catalog (JSON list of services → packages → prices). Only services we don't
 * already have are added (name / slug de-duplication), all as INSTANT; each gets its official
 * App Store icon, compressed to a 512 px WebP ≤ 28 KB in the media bucket.
 */
export function ImportCatalogBox() {
  const { language } = useI18n();
  const ar = language === "ar";
  const [raw, setRaw] = useState("");
  const [markup, setMarkup] = useState("0");
  const [vipCut, setVipCut] = useState("0");
  const [withIcons, setWithIcons] = useState(true);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [missedIcons, setMissedIcons] = useState<string[]>([]);

  function parse(): ImportService[] | null {
    try {
      const data = JSON.parse(raw) as unknown;
      const list = Array.isArray(data) ? data : (data as { services?: unknown })?.services;
      if (!Array.isArray(list)) throw new Error("not a list");
      return list as ImportService[];
    } catch {
      toast.error(ar ? "الملف ليس قائمة JSON صالحة." : "That isn't a valid JSON list.");
      return null;
    }
  }

  async function check() {
    const items = parse();
    if (!items) return;
    setPlan(await planCatalogImport(items));
    setMissedIcons([]);
  }

  /** Official icons one by one (with progress); returns slug → CDN URL. */
  async function icons(entries: Array<{ slug: string; term: string; label: string }>): Promise<Record<string, string>> {
    const found: Record<string, string> = {};
    const missed: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      setProgress({ done: index, total: entries.length, label: entry.label });
      const result = await fetchOfficialIcon(entry.term);
      if (result.ok) found[entry.slug] = result.url;
      else missed.push(entry.label);
    }
    setProgress(null);
    setMissedIcons(missed);
    return found;
  }

  async function run() {
    if (!plan || !(plan.fresh.length + plan.fills.length)) return;
    setBusy(true);
    try {
      const art = withIcons
        ? await icons(
            plan.fresh
              .filter((item) => !item.noIcon)
              .map((item) => ({ slug: importSlug(item), term: item.iconTerm || item.name, label: item.nameAr || item.name })),
          )
        : {};
      const result = await importCatalog({ items: [...plan.fresh, ...plan.fills], markup: Number(markup), vipDiscount: Number(vipCut), icons: art });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        ar
          ? `تمت إضافة ${result.added} خدمة جديدة${result.filled ? ` وتعبئة باقات ${result.filled}` : ""} (تم تخطي ${result.skipped}).`
          : `Added ${result.added} new services${result.filled ? `, filled sizes for ${result.filled}` : ""} (${result.skipped} skipped).`,
      );
      setPlan(null);
      setRaw("");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function sharpen() {
    setBusy(true);
    try {
      const list = await servicesNeedingIcons();
      if (!list.length) {
        toast.success(ar ? "كل الخدمات لديها أيقونات عالية الجودة." : "Every service already has a sharp icon.");
        return;
      }
      const art = await icons(list.map((item) => ({ slug: item.slug, term: item.name, label: item.nameAr || item.name })));
      const saved = await setServiceIcons(art);
      if (!saved.ok) toast.error(saved.error);
      else toast.success(ar ? `تم تحديث ${saved.updated} أيقونة.` : `Updated ${saved.updated} icons.`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const priceRange = (item: ImportService) => {
    if (item.counter) return `$${item.counter.per100Usd.toFixed(2)} / 100`;
    const prices = item.packages.map((pack) => Number(pack.price)).filter((value) => value > 0);
    return prices.length ? `$${Math.min(...prices).toFixed(2)} – $${Math.max(...prices).toFixed(2)}` : "—";
  };

  return (
    <AdminBox id="catalog-import" icon={Upload} title={ar ? "استيراد كتالوج الخدمات" : "Import service catalog"}>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {ar
          ? "الصق قائمة JSON (الاسم، الفئة، الباقات والأسعار بالدولار). تُضاف الخدمات غير الموجودة فقط، كخدمات فورية، مع أيقونتها الرسمية."
          : "Paste a JSON list (name, category, packages with USD prices). Only services you don't have are added, as instant, with their official icon."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs font-bold">
          <Upload className="size-3.5" aria-hidden />
          {ar ? "اختر ملف JSON" : "Choose JSON file"}
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void file.text().then((text) => {
                setRaw(text);
                setPlan(null);
              });
              event.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            // Loaded only when pressed: the list never ships in the customer-facing bundle.
            void import("@/lib/store/mega-catalog").then(({ MEGA_CATALOG }) => {
              setRaw(JSON.stringify(MEGA_CATALOG, null, 1));
              setPlan(null);
            });
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-sky-500/40 px-3 text-xs font-bold text-sky-700 disabled:opacity-60"
        >
          <Layers className="size-3.5" aria-hidden />
          {ar ? "تحميل قائمة Mega (93 خدمة بأسعارها)" : "Load the Mega list (93 services with prices)"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void sanitizePackageNames()
              .then((result) => {
                if (!result.ok) toast.error(result.error);
                else toast.success(ar ? `تم تنظيف ${result.changed} اسم باقة` : `Cleaned ${result.changed} package names`);
              })
              .finally(() => setBusy(false));
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs font-bold disabled:opacity-60"
        >
          <ScanSearch className="size-3.5" aria-hidden />
          {ar ? "تنظيف أسماء الباقات" : "Sanitize package names"}
        </button>
        <button type="button" disabled={busy} onClick={() => void sharpen()} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs font-bold disabled:opacity-60">
          <ImagePlus className="size-3.5" aria-hidden />
          {ar ? "تحسين أيقونات الخدمات الحالية" : "Sharpen existing icons"}
        </button>
      </div>
      <textarea
        className="field mt-2 min-h-28 font-mono text-xs"
        dir="ltr"
        placeholder='[{"name":"PUBG Mobile","nameAr":"ببجي موبايل","category":"games","packages":[{"sizeName":"60 UC","price":0.99}]}]'
        value={raw}
        onChange={(event) => {
          setRaw(event.target.value);
          setPlan(null);
        }}
      />
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="pf-label">
          {ar ? "هامش ربح %" : "Markup %"}
          <input className="field" inputMode="decimal" dir="ltr" value={markup} onChange={(event) => setMarkup(event.target.value)} />
        </label>
        <label className="pf-label">
          {ar ? "خصم VIP %" : "VIP discount %"}
          <input className="field" inputMode="decimal" dir="ltr" value={vipCut} onChange={(event) => setVipCut(event.target.value)} />
        </label>
        <label className="col-span-2 inline-flex min-h-11 items-center gap-2 self-end text-xs font-bold">
          <input type="checkbox" checked={withIcons} onChange={(event) => setWithIcons(event.target.checked)} className="size-4" />
          {ar ? "جلب الأيقونة الرسمية لكل خدمة" : "Fetch the official icon for each service"}
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !raw.trim()} onClick={() => void check()} className="min-h-11 rounded-full border border-white/15 px-4 text-sm font-bold disabled:opacity-60">
          {ar ? "فحص القائمة" : "Check list"}
        </button>
        <button
          type="button"
          disabled={busy || !plan || !(plan.fresh.length + plan.fills.length)}
          onClick={() => void run()}
          className="btn-glow keep-white min-h-11 rounded-full px-5 text-sm font-bold text-white disabled:opacity-60"
        >
          {ar ? `استيراد ${plan?.fresh.length ?? 0} خدمة جديدة` : `Import ${plan?.fresh.length ?? 0} new services`}
        </button>
      </div>
      {progress ? (
        <div className="mt-3" role="status" aria-live="polite">
          <p className="text-xs font-semibold">
            {ar ? "جلب الأيقونات" : "Fetching icons"} {progress.done + 1}/{progress.total} · {progress.label}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-500/20">
            <div className="h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${Math.round(((progress.done + 1) / progress.total) * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {missedIcons.length ? (
        <p className="mt-2 text-xs text-amber-600">
          {ar ? "لم تُعثر على أيقونة رسمية لـ: " : "No official icon found for: "}
          {missedIcons.join("، ")}
        </p>
      ) : null}
      {plan ? (
        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-emerald-500/12 px-3 py-1.5 text-emerald-600">{ar ? `جديدة: ${plan.fresh.length}` : `New: ${plan.fresh.length}`}</span>
            {plan.fills.length ? (
              <span className="rounded-full bg-sky-500/12 px-3 py-1.5 text-sky-700">{ar ? `تعبئة باقات خدمات فارغة: ${plan.fills.length}` : `Fill sizes of empty services: ${plan.fills.length}`}</span>
            ) : null}
            <span className="rounded-full bg-slate-500/12 px-3 py-1.5 text-muted">{ar ? `موجودة مسبقاً (تُتخطى): ${plan.duplicates.length}` : `Already on the site (skipped): ${plan.duplicates.length}`}</span>
          </div>
          <div className="admin-table max-h-[20rem] overflow-auto rounded-xl">
            {plan.fresh.map((item) => (
              <div key={importSlug(item)} className="admin-row flex min-w-0 items-center gap-2 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-semibold">{ar ? item.nameAr || item.name : item.name}</span>
                <span className="shrink-0 text-muted">
                  {item.mode === "VAULT" ? (ar ? "خزنة" : "Vault") : item.speed === "MANUAL" ? (ar ? "غير فوري" : "Manual") : ar ? "فوري" : "Instant"} ·{" "}
                  {item.counter
                    ? ar
                      ? "حسب المبلغ"
                      : "per amount"
                    : item.regions?.length && !item.packages.length
                      ? `${item.regions.length} ${ar ? "مناطق" : "regions"}`
                      : `${item.packages.length} ${ar ? "باقة" : "packs"}`}
                </span>
                <span className="price-num shrink-0" dir="ltr">
                  {priceRange(item)}
                </span>
              </div>
            ))}
          </div>
          {plan.duplicates.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-muted">{ar ? "عرض المكرّرة" : "Show duplicates"}</summary>
              <ul className="mt-1.5 grid gap-1">
                {plan.duplicates.map((item) => (
                  <li key={item.name} className="text-muted">
                    {item.name} → {item.matches}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </AdminBox>
  );
}

/* ------------------------------ v33: honeypot radar ------------------------------ */

/** Everyone caught on a decoy admin URL: who, which path, what PIN they tried, when — and a lock. */
export function HoneypotRadar({ users, onLock }: { users: AdminUser[]; onLock: (user: AdminUser) => void }) {
  const { language } = useI18n();
  const ar = language === "ar";
  const [events, setEvents] = useState<HoneypotEvent[]>([]);
  useEffect(() => {
    let cancel = false;
    const load = () =>
      void listHoneypotEvents().then((rows) => {
        if (!cancel) setEvents(rows);
      });
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, []);
  const byId = new Map(users.map((user) => [user.userId, user]));
  const when = (iso: string) => new Date(iso).toLocaleString(ar ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "short", timeStyle: "short" });

  return (
    <AdminBox id="honeypot-radar" icon={ScanSearch} title={ar ? "سجل المصيدة الأمنية" : "Honeypot radar"}>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {ar
          ? "كل من فتح /admin أو /wp-admin أو /admin-panel أو /secret-admin دون صلاحية — يرى شاشة دخول وهمية ويُسجَّل هنا."
          : "Anyone without access who opened /admin, /wp-admin, /admin-panel or /secret-admin — they saw a decoy login and were logged here."}
      </p>
      <div className="admin-table mt-3 max-h-[24rem] overflow-auto rounded-xl">
        {events.length === 0 ? <p className="p-4 text-sm text-muted">{ar ? "لا توجد محاولات بعد." : "No attempts yet."}</p> : null}
        {events.map((event) => {
          const user = event.userId ? byId.get(event.userId) : undefined;
          return (
            <article key={event.id} className="admin-row grid min-w-0 gap-1.5 px-3 py-2.5 text-xs">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="trap-badge" aria-hidden />
                <span className="font-extrabold">{event.fullName || (ar ? "زائر غير مسجّل" : "Guest (not signed in)")}</span>
                {event.email ? (
                  <span className="text-muted" dir="ltr">
                    {event.email}
                  </span>
                ) : null}
                <span className="ms-auto text-muted tabular-nums">{when(event.createdAt)}</span>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="order-field rounded-lg px-2 py-0.5 font-mono" dir="ltr">
                  {event.attemptedPath}
                </span>
                <span className={`rounded-lg px-2 py-0.5 font-mono ${event.enteredPayload ? "bg-rose-500/12 text-rose-600 dark:text-rose-300" : "bg-slate-500/12 text-muted"}`} dir="ltr">
                  PIN: {event.enteredPayload || "—"}
                </span>
                <span className="rounded-lg bg-slate-500/12 px-2 py-0.5 text-muted" dir="ltr">
                  {event.ip || "IP —"}
                  {event.country ? ` · ${event.country}` : ""}
                </span>
              </div>
              <p className="truncate text-[11px] text-muted" dir="ltr" title={event.userAgent}>
                {event.userAgent}
              </p>
              {user && user.role !== "ADMIN" ? (
                user.isLocked ? (
                  <span className="w-fit rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-extrabold text-white">{ar ? "الحساب مقفل" : "Account locked"}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onLock(user)}
                    className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-full bg-rose-600 px-3.5 text-xs font-extrabold text-white hover:bg-rose-700"
                  >
                    {ar ? "قفل الحساب فوراً" : "Lock account now"}
                  </button>
                )
              ) : null}
            </article>
          );
        })}
      </div>
    </AdminBox>
  );
}

/* ======================================================================
   v37 · Mega: automatic delivery, live prices, linker, order tracking
   ====================================================================== */

const MEGA_STATUS: Record<string, { ar: string; en: string; tone: "ok" | "wait" | "bad" }> = {
  queued: { ar: "بانتظار الإرسال", en: "Queued", tone: "wait" },
  unknown: { ar: "جارٍ التأكد", en: "Confirming", tone: "wait" },
  processing: { ar: "قيد المعالجة", en: "Processing", tone: "wait" },
  pending: { ar: "قيد الانتظار", en: "Pending", tone: "wait" },
  awaiting_response: { ar: "بانتظار ردك", en: "Needs reply", tone: "bad" },
  completed: { ar: "مكتمل", en: "Completed", tone: "ok" },
  cancelled: { ar: "ملغي ومسترد", en: "Cancelled · refunded", tone: "bad" },
  error: { ar: "خطأ — يحتاج تدخّل", en: "Error — needs you", tone: "bad" },
};

export function megaStatusText(status: string, ar: boolean): string {
  const row = MEGA_STATUS[status];
  return row ? (ar ? row.ar : row.en) : status;
}

function MegaChip({ status, ar }: { status: string; ar: boolean }) {
  const tone = MEGA_STATUS[status]?.tone ?? "wait";
  const cls =
    tone === "ok"
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
      : tone === "bad"
        ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
        : "bg-sky-500/12 text-sky-700 dark:text-sky-300";
  return <span className={`inline-flex min-h-6 items-center rounded-full px-2 text-[11px] font-bold ${cls}`}>{megaStatusText(status, ar)}</span>;
}

type MegaPreview = { services: MegaLinkService[]; unmatchedGames: Array<{ id: number; name: string; count: number }>; total: number };

export function MegaPanel() {
  const { language } = useI18n();
  const ar = language === "ar";
  const [overview, setOverview] = useState<MegaOverview | null>(null);
  const [settings, setSettings] = useState<MegaSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<MegaPreview | null>(null);
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const [adds, setAdds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [orders, setOrders] = useState<AdminOrder[]>([]);

  const load = async () => {
    const [info, current, list] = await Promise.all([megaAdmin<MegaOverview>("overview"), getMegaSettings(), listAdminOrders()]);
    setOverview(info);
    setSettings(current);
    if (list.ok) setOrders(list.orders.filter((order) => order.tracking).slice(0, 40));
  };
  useEffect(() => {
    void load();
  }, []);

  async function run(label: string, task: () => Promise<{ ok?: boolean; error?: string } & Record<string, unknown>>, done?: (reply: Record<string, unknown>) => string) {
    setBusy(label);
    try {
      const reply = await task();
      if (!reply.ok) toast.error(reply.error ?? (ar ? "تعذّر التنفيذ" : "Failed"));
      else if (done) toast.success(done(reply));
      return reply;
    } finally {
      setBusy(null);
    }
  }

  async function fetchPreview() {
    const reply = await run("preview", () => megaAdmin<MegaPreview>("preview"));
    if (!reply.ok) return;
    const data = reply as unknown as MegaPreview;
    setPreview(data);
    const next: Record<string, number | null> = {};
    for (const service of data.services) for (const row of service.packages) next[row.packageId] = row.currentProductId ?? row.suggestion?.id ?? null;
    setPicks(next);
    setAdds(new Set());
  }

  async function applyLinks() {
    if (!preview) return;
    const links = preview.services
      .filter((service) => !service.manual)
      .flatMap((service) => service.packages.map((row) => ({ packageId: row.packageId, productId: picks[row.packageId] ?? null })))
      .filter((link) => link.productId != null || preview.services.some((service) => service.packages.some((row) => row.packageId === link.packageId && row.currentProductId)));
    const add = [...adds].map((key) => {
      const [serviceId, productId] = key.split(":");
      return { serviceId, productId: Number(productId) };
    });
    const reply = await run("apply", () => megaAdmin("apply", { links, add }), (r) =>
      ar ? `تم الربط: ${r.linked ?? 0} حجم · أُضيف ${r.added ?? 0} · ${r.services ?? 0} خدمة أصبحت تلقائية` : `Linked ${r.linked ?? 0} · added ${r.added ?? 0} · ${r.services ?? 0} services now automatic`,
    );
    if (reply.ok) {
      await fetchPreview();
      void load();
    }
  }

  if (!overview) return <div className="admin-box mt-6 h-40 animate-pulse rounded-[22px]" />;
  if (overview.configured === false) {
    return (
      <section className="admin-box mt-6 rounded-[22px] p-4">
        <h2 className="font-display text-lg font-extrabold">Mega API</h2>
        <p className="mt-2 rounded-[14px] bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
          {ar
            ? "أضف في Vercel ← Settings ← Environment Variables المتغيّر MEGA_API_TOKEN (التوكن من صفحة «وصول API» في Mega)، ثم أعد النشر."
            : "Add MEGA_API_TOKEN (from Mega's “API access” page) in Vercel → Settings → Environment Variables, then redeploy."}
        </p>
      </section>
    );
  }

  const needle = query.trim().toLowerCase();
  const shown = (preview?.services ?? []).filter((service) => {
    if (needle && !`${service.serviceName} ${service.gameName ?? ""}`.toLowerCase().includes(needle)) return false;
    if (onlyOpen && service.packages.every((row) => picks[row.packageId] != null)) return false;
    return true;
  });
  const pickedCount = Object.values(picks).filter((value) => value != null).length;
  const s = settings ?? { markupPercent: 10, vipMarkupPercent: 5, lowBalanceUsd: 20 };

  return (
    <div className="mt-6 grid gap-4">
      {/* Status */}
      <section className="admin-box rounded-[22px] p-4" aria-labelledby="mega-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="mega-title" className="inline-flex items-center gap-2 font-display text-lg font-extrabold">
            <Zap className="size-5 text-sky-600" strokeWidth={1.75} /> Mega API
          </h2>
          <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            {ar ? "متصل" : "Connected"} {overview.account ? `· ${overview.account}` : ""}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-[14px] bg-sky-500/8 p-3">
            <p className="text-[11px] font-bold text-muted">{ar ? "رصيدك لدى Mega" : "Mega balance"}</p>
            <p className="price-num mt-1 text-xl font-extrabold" dir="ltr">
              {typeof overview.balance === "number" ? `$${overview.balance.toFixed(2)}` : "—"}
            </p>
          </div>
          <div className="rounded-[14px] bg-sky-500/8 p-3">
            <p className="text-[11px] font-bold text-muted">{ar ? "أحجام مربوطة" : "Linked sizes"}</p>
            <p className="price-num mt-1 text-xl font-extrabold">{overview.linked ?? 0}</p>
          </div>
          <div className="col-span-2 grid gap-1.5 sm:col-span-1">
            <button type="button" disabled={!!busy} onClick={() => void run("sync", () => megaAdmin("sync"), (r) => (ar ? `تمت المزامنة: ${r.changed ?? 0} تغيير` : `Synced: ${r.changed ?? 0} changes`)).then(() => load())} className="btn-glow keep-white min-h-10 rounded-[12px] px-3 text-xs font-extrabold text-white disabled:opacity-60">
              {busy === "sync" ? "…" : ar ? "مزامنة الأسعار الآن" : "Sync prices now"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => void run("check", () => megaAdmin("check"), (r) => (ar ? `فُحصت ${r.open ?? 0} طلبات مفتوحة` : `Checked ${r.open ?? 0} open orders`)).then(() => load())} className="min-h-10 rounded-[12px] border border-slate-300 px-3 text-xs font-bold disabled:opacity-60 dark:border-white/15">
              {busy === "check" ? "…" : ar ? "فحص الطلبات الآن" : "Check orders now"}
            </button>
          </div>
        </div>
        {overview.needsSql ? (
          <p className="mt-3 rounded-[14px] bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
            {ar ? "شغّل supabase_security.sql (الجزء 11) في Supabase لتفعيل الاسترداد التلقائي وسجل Mega." : "Run supabase_security.sql (part 11) in Supabase for automatic refunds and the Mega log."}
          </p>
        ) : null}
      </section>

      {/* Pricing */}
      <section className="admin-box rounded-[22px] p-4">
        <h3 className="font-display text-base font-extrabold">{ar ? "التسعير التلقائي" : "Automatic pricing"}</h3>
        <p className="mt-1 text-xs text-muted">
          {ar ? "سعر البيع = سعر Mega × (1 + النسبة). لا يمكن أن يقل عن سعر التكلفة. السعر بالليرة يُحسب من سعر الصرف." : "Selling price = Mega price × (1 + %). Never below cost. SYP prices follow the exchange rate."}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {([
            ["markupPercent", ar ? "ربح الزبون العادي %" : "Normal markup %"],
            ["vipMarkupPercent", ar ? "ربح VIP %" : "VIP markup %"],
            ["lowBalanceUsd", ar ? "تنبيه رصيد أقل من $" : "Low balance alert $"],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-[11px] font-bold text-muted">
              {label}
              <input
                className="field mt-1"
                dir="ltr"
                inputMode="decimal"
                value={String(s[key])}
                onChange={(event) => setSettings({ ...s, [key]: Number(event.target.value.replace(",", ".")) || 0 })}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted" dir="auto">
          {ar ? "مثال: منتج بسعر $1.9074 ← " : "Example: a $1.9074 product → "}
          <span dir="ltr">
            ${(megaPrices(1.9074, s).normalPriceCents / 100).toFixed(2)} · VIP ${(megaPrices(1.9074, s).vipPriceCents / 100).toFixed(2)}
          </span>
        </p>
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run("settings", async () => {
              const saved = await saveMegaSettings(s);
              if (!saved.ok) return saved;
              return megaAdmin("sync");
            }, () => (ar ? "تم الحفظ وتحديث الأسعار" : "Saved and prices updated"))
          }
          className="btn-glow keep-white mt-3 min-h-11 rounded-[14px] px-5 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {busy === "settings" ? "…" : ar ? "حفظ وتطبيق على كل الأسعار" : "Save and apply to all prices"}
        </button>
      </section>

      {/* Webhook + timers */}
      <section className="admin-box rounded-[22px] p-4">
        <h3 className="font-display text-base font-extrabold">{ar ? "الويب هوك والمؤقتات (مرة واحدة)" : "Webhook & timers (once)"}</h3>
        <ol className="mt-2 grid gap-3 text-xs">
          <li>
            <p className="font-bold">{ar ? "1 · انسخ هذا الرابط والصقه في Mega ← وصول API ← «رابط الويب هوك» ثم احفظ:" : "1 · Copy this into Mega → API access → “Webhook URL”, then save:"}</p>
            <div className="mt-1.5 flex gap-1.5">
              <code dir="ltr" className="min-w-0 flex-1 truncate rounded-[10px] bg-slate-100 px-2 py-2 dark:bg-[#0e131f]">
                {overview.webhookUrl}
              </code>
              <button type="button" onClick={() => void navigator.clipboard.writeText(overview.webhookUrl ?? "").then(() => toast.success(ar ? "تم النسخ" : "Copied"))} className="min-h-10 shrink-0 rounded-[10px] border border-slate-300 px-3 font-bold dark:border-white/15">
                {ar ? "نسخ" : "Copy"}
              </button>
            </div>
          </li>
          <li>
            <p className="font-bold">
              {ar ? "2 · انسخ أوامر المؤقتات والصقها في Supabase ← SQL Editor ← Run (فحص الطلبات كل دقيقة، الأسعار كل 5 دقائق):" : "2 · Paste the timers in Supabase → SQL Editor → Run (orders every minute, prices every 5 minutes):"}
            </p>
            <button type="button" onClick={() => void navigator.clipboard.writeText(overview.cronSql ?? "").then(() => toast.success(ar ? "تم النسخ" : "Copied"))} className="mt-1.5 min-h-10 rounded-[10px] border border-slate-300 px-3 font-bold dark:border-white/15">
              {ar ? "نسخ أوامر المؤقتات" : "Copy timer SQL"}
            </button>
          </li>
        </ol>
      </section>

      {/* Linker */}
      <section className="admin-box rounded-[22px] p-4" aria-labelledby="mega-link-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="mega-link-title" className="font-display text-base font-extrabold">
            {ar ? "ربط الخدمات بمنتجات Mega" : "Link services to Mega products"}
          </h3>
          <button type="button" disabled={!!busy} onClick={() => void fetchPreview()} className="btn-glow keep-white min-h-11 rounded-[14px] px-4 text-xs font-extrabold text-white disabled:opacity-60">
            {busy === "preview" ? (ar ? "جارٍ الجلب…" : "Loading…") : preview ? (ar ? "إعادة الجلب" : "Fetch again") : ar ? "جلب منتجات Mega ومطابقتها" : "Fetch & match Mega products"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {ar
            ? "تتم المطابقة تلقائياً بالاسم. راجع كل حجم وغيّره من القائمة إن لزم، ثم اضغط «تطبيق». خدمات مزودي الإنترنت تبقى يدوية."
            : "Matching is automatic by name. Check each size, change it from the list if needed, then press Apply. Internet providers stay manual."}
        </p>
        {preview ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="search" className="field max-w-xs" placeholder={ar ? "ابحث عن خدمة…" : "Search a service…"} value={query} onChange={(event) => setQuery(event.target.value)} />
              <label className="inline-flex min-h-10 items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={onlyOpen} onChange={(event) => setOnlyOpen(event.target.checked)} className="size-4" />
                {ar ? "غير المربوطة فقط" : "Unlinked only"}
              </label>
              <span className="text-xs text-muted">
                {ar ? `${preview.total} منتج على Mega · ${pickedCount} حجم مختار` : `${preview.total} Mega products · ${pickedCount} sizes picked`}
              </span>
            </div>
            <div className="mt-3 grid gap-3">
              {shown.map((service) => (
                <article key={service.serviceId} className="rounded-[18px] border border-slate-200 p-3 dark:border-white/10">
                  <header className="flex items-center gap-2">
                    {service.imageUrl ? <img src={service.imageUrl} alt="" className="size-9 rounded-[10px] object-cover" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold">{service.serviceName}</p>
                      <p className="truncate text-[11px] text-muted">
                        {service.manual ? (ar ? "يدوي — مزود إنترنت" : "Manual — internet provider") : service.gameName ? `Mega: ${service.gameName}` : ar ? "لم يُعثر على لعبة مطابقة — اختر يدوياً" : "No matching game — pick manually"}
                      </p>
                    </div>
                  </header>
                  {service.manual ? null : (
                    <div className="mt-2 grid gap-1.5">
                      {service.packages.map((row) => {
                        const value = picks[row.packageId];
                        const option = service.options.find((item) => item.id === value);
                        const ours = option ? megaPrices(option.price, s, service.serviceId) : null;
                        return (
                          <div key={row.packageId} className="grid grid-cols-1 items-center gap-1.5 rounded-[12px] bg-slate-50 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] dark:bg-[#0e131f]">
                            <span className="min-w-0 truncate text-xs font-bold">
                              {row.regionName ? `${row.regionName} · ` : ""}
                              {row.sizeName}
                            </span>
                            <select
                              className="field py-2 text-xs"
                              value={value == null ? "" : String(value)}
                              onChange={(event) => setPicks((current) => ({ ...current, [row.packageId]: event.target.value ? Number(event.target.value) : null }))}
                              aria-label={ar ? `منتج Mega لـ ${row.sizeName}` : `Mega product for ${row.sizeName}`}
                            >
                              <option value="">{ar ? "— غير مربوط (يدوي) —" : "— Not linked (manual) —"}</option>
                              {service.options.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} · ${item.price.toFixed(4)}
                                  {item.active ? "" : ar ? " · متوقف" : " · off"}
                                </option>
                              ))}
                            </select>
                            <span className="text-[11px] font-bold tabular-nums" dir="ltr">
                              {ours ? `→ $${(ours.normalPriceCents / 100).toFixed(2)}` : "—"}
                              {row.currentProductId ? " ✓" : row.suggestion && value === row.suggestion.id ? (row.suggestion.score >= 0.8 ? " ✨" : " ?") : ""}
                            </span>
                          </div>
                        );
                      })}
                      {service.newOnMega.length ? (
                        <details className="rounded-[12px] border border-dashed border-sky-400/50 p-2">
                          <summary className="cursor-pointer text-xs font-bold text-sky-700 dark:text-sky-300">
                            {ar ? `+ ${service.newOnMega.length} أحجام موجودة على Mega وغير موجودة عندك` : `+ ${service.newOnMega.length} sizes on Mega you don't have`}
                          </summary>
                          <div className="mt-2 grid gap-1">
                            {service.newOnMega.map((item) => {
                              const key = `${service.serviceId}:${item.id}`;
                              return (
                                <label key={key} className="flex min-h-9 items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    className="size-4"
                                    checked={adds.has(key)}
                                    onChange={(event) =>
                                      setAdds((current) => {
                                        const next = new Set(current);
                                        if (event.target.checked) next.add(key);
                                        else next.delete(key);
                                        return next;
                                      })
                                    }
                                  />
                                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                                  <span dir="ltr" className="tabular-nums text-muted">
                                    ${item.price.toFixed(4)}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  )}
                </article>
              ))}
            </div>
            {preview.unmatchedGames.length ? (
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer font-bold text-muted">
                  {ar ? `${preview.unmatchedGames.length} ألعاب على Mega غير موجودة في متجرك` : `${preview.unmatchedGames.length} Mega games not in your store`}
                </summary>
                <p className="mt-1 text-muted">{preview.unmatchedGames.map((game) => `${game.name} (${game.count})`).join(" · ")}</p>
              </details>
            ) : null}
            <div className="svc-footer sticky bottom-0 mt-3 flex flex-wrap items-center gap-2 py-2">
              <button type="button" disabled={!!busy} onClick={() => void applyLinks()} className="btn-glow keep-white min-h-12 flex-1 rounded-[14px] px-5 text-sm font-extrabold text-white disabled:opacity-60">
                {busy === "apply" ? (ar ? "جارٍ التطبيق…" : "Applying…") : ar ? `تطبيق الربط (${pickedCount} حجم${adds.size ? ` + ${adds.size} جديد` : ""})` : `Apply (${pickedCount} sizes${adds.size ? ` + ${adds.size} new` : ""})`}
              </button>
            </div>
          </>
        ) : null}
      </section>

      {/* Orders */}
      <section className="admin-box rounded-[22px] p-4">
        <h3 className="font-display text-base font-extrabold">{ar ? "تتبّع طلبات Mega" : "Mega order tracking"}</h3>
        {orders.length === 0 ? <p className="mt-2 text-xs text-muted">{ar ? "لا توجد طلبات تلقائية بعد." : "No automatic orders yet."}</p> : null}
        <ul className="mt-2 grid gap-2">
          {orders.map((order) => {
            const track = order.tracking!;
            const canRetry = track.status === "error" || order.status === "PENDING_MANUAL";
            return (
              <li key={order.id} className="rounded-[14px] border border-slate-200 p-3 dark:border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-bold">
                    {order.serviceName} · {order.packageName}
                  </p>
                  <MegaChip status={track.status} ar={ar} />
                </div>
                <p className="mt-1 text-[11px] text-muted" dir="auto">
                  {order.userName} · {order.receiptNumber}
                  {track.orderNumber ? ` · ${track.orderNumber}` : ""}
                </p>
                {track.error ? <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">{track.error}</p> : null}
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] font-bold text-sky-700 dark:text-sky-300">{ar ? "المراحل" : "Timeline"}</summary>
                  <ol className="mt-1 grid gap-0.5 text-[11px] text-muted">
                    {track.history.map((item, index) => (
                      <li key={index} dir="auto">
                        {new Date(item.at).toLocaleString(ar ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "short", timeStyle: "short" })} · {megaStatusText(item.status, ar)}
                        {item.note ? ` — ${item.note}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>
                {canRetry ? (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void run(`retry-${order.id}`, () => megaAdmin("retry", { orderId: order.id }), () => (ar ? "أُعيد الإرسال" : "Sent again")).then(() => load())}
                    className="mt-2 min-h-10 rounded-[12px] border border-sky-500/50 bg-sky-500/10 px-3 text-xs font-bold text-sky-800 dark:text-sky-200"
                  >
                    {ar ? "إعادة الإرسال إلى Mega" : "Send to Mega again"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {overview.events?.length ? (
          <details className="mt-3 text-[11px]">
            <summary className="cursor-pointer font-bold text-muted">{ar ? "سجل Mega (ويب هوك ومزامنة)" : "Mega log (webhook & sync)"}</summary>
            <ul className="mt-1 grid gap-1">
              {overview.events.map((event) => (
                <li key={event.id} className="rounded-[10px] bg-slate-50 p-2 dark:bg-[#0e131f]">
                  <p className="font-bold">
                    {event.kind} · {new Date(event.created_at).toLocaleString(ar ? "ar-SY-u-nu-latn" : "en-US")}
                  </p>
                  <code dir="ltr" className="mt-0.5 block break-all whitespace-pre-wrap">
                    {event.body.slice(0, 600)}
                  </code>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </div>
  );
}
