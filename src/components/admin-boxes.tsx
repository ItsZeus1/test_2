"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { MethodBadge } from "@/components/pay-emblem";
import { ReceiptBadge } from "@/components/receipt-badge";
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
} from "@/lib/store/api";
import type { StoredBalanceRequest } from "@/lib/store/data";
import type { Currency, ServiceGroup } from "@/lib/store/types";

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
    <div className="box-filter mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem_auto]">
      <label className="col-span-2 flex min-h-10 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 sm:col-span-1">
        <Search className="size-4 shrink-0 text-muted" />
        <input
          value={value.q}
          onChange={(event) => onChange({ ...value, q: event.target.value })}
          placeholder={t.searchBox}
          className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </label>
      <input type="date" aria-label={t.fromDate} value={value.from} max={value.to || undefined} onChange={(event) => setFrom(event.target.value)} className="field !min-h-10 !py-1.5 text-xs" dir="ltr" />
      <input type="date" aria-label={t.toDate} value={value.to} min={value.from || undefined} onChange={(event) => setTo(event.target.value)} className="field !min-h-10 !py-1.5 text-xs" dir="ltr" />
      <div className="col-span-2 flex gap-1.5 sm:col-span-1">
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
export function AdminBox({ id, title, badge, children, right }: { id?: string; title: string; badge?: number; children: ReactNode; right?: ReactNode }) {
  return (
    <section id={id} className="admin-box mt-6 scroll-mt-24 rounded-2xl p-3 sm:p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-base font-extrabold sm:text-lg">{title}</h2>
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

const orderText = (row: AdminOrderRow) => [row.receiptNumber, row.userName, row.username, row.email, row.phone, row.targetId, row.serviceName, row.packageName];

/* ------------------------------ boxes ------------------------------ */

export function OrdersBox() {
  const { t, language } = useI18n();
  const money = useMoney();
  const rows = useAdminOrders();
  const [filter, setFilter] = useState<Filter>(todayFilter);
  const filtered = useMemo(() => applyFilter(rows, filter, orderText, (row) => row.createdAt), [rows, filter]);
  return (
    <AdminBox id="orders-box" title={t.ordersBox} right={<Count shown={Math.min(filtered.length, MAX_ROWS)} total={filtered.length} />}>
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
    <AdminBox id="manual-queue" title={t.manualQueue} badge={pending.length}>
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
              <p className="mt-1 text-sm font-semibold text-amber-600">🔐 {t.vaultSoldOut}</p>
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
                {t.acceptOrder}
              </button>
              <button type="button" disabled={busy === row.id} onClick={() => void decide(row.id, "DECLINE")} className="min-h-10 rounded-xl border border-rose-400/50 text-xs font-bold text-rose-500 disabled:opacity-60">
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
    <AdminBox id="topup-history" title={t.topupHistory} right={<Count shown={Math.min(filtered.length, MAX_ROWS)} total={filtered.length} />}>
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
      <p className="text-[11px] font-bold text-muted">{t.setPassword}</p>
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
    setGroups((current) => [...current, { id, slug: id, name: "New group", nameAr: "قسم جديد", imageUrl: "", icon: "🗂️", order: current.length }]);
  };
  const upload = (id: string, file: File | undefined) => {
    if (!file || !file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      toast.error(ar ? "استخدم صورة أصغر من 2 ميغابايت." : "Use an image under 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") patch(id, { imageUrl: reader.result });
    };
    reader.readAsDataURL(file);
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
    <AdminBox id="groups-manager" title={ar ? "🗂️ إدارة أقسام ومجموعات الخدمات" : "🗂️ Manage Service Groups"}>
      <div className="mt-3 grid gap-2">
        {groups.map((group, index) => (
          <div key={group.id} className="admin-row grid gap-2 rounded-xl px-3 py-2.5 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center">
            <label className="relative grid h-16 w-full cursor-pointer place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/5 text-2xl sm:w-20">
              {group.imageUrl ? <img src={group.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span>{group.icon}</span>}
              <span className="absolute end-1 bottom-1 grid size-6 place-items-center rounded-md bg-slate-950/60 text-white">
                <Upload className="size-3" />
              </span>
              <input type="file" accept="image/*" className="sr-only" onChange={(event) => upload(group.id, event.target.files?.[0])} />
            </label>
            <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
              <input className="field !min-h-9 !py-1.5 text-center" aria-label="Icon" value={group.icon} maxLength={4} onChange={(event) => patch(group.id, { icon: event.target.value })} />
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

