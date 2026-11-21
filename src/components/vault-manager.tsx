"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift, KeyRound, Layers, LockKeyhole, Mail, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminBox, BoxFilter, EMPTY_FILTER, applyFilter, type Filter } from "@/components/admin-boxes";
import { useI18n } from "@/lib/i18n";
import type { CatalogService, VaultType } from "@/lib/store/types";
import { adminVault, type AdminPiece, type NewPiece } from "@/lib/vault-client";

const EMPTY_SINGLE = { redeemCode: "", pinOrSerial: "", email: "", password: "", extraInfo: "" };

/**
 * v30 — Vault manager in two steps: 1) service, 2) package size. Then pick what the stock is
 * (redeem code / gift card, or a ready account) and add one piece or paste many (one per line).
 * Every package size shows its own live stock badge.
 */
export function VaultManager({ services, sql }: { services: CatalogService[]; sql: string }) {
  const { t, language } = useI18n();
  const ar = language === "ar";
  const vaultServices = useMemo(() => services.filter((service) => service.serviceMode === "VAULT"), [services]);
  const [serviceId, setServiceId] = useState("");
  // "" = pieces that may be sold for any size of the service (also where pre-v30 stock lives).
  const [packageId, setPackageId] = useState("");
  const [vaultType, setVaultType] = useState<VaultType>("REDEEM_CODE");
  const [packages, setPackages] = useState<Array<{ id: string; sizeName: string }>>([]);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [shared, setShared] = useState(0);
  const [upgraded, setUpgraded] = useState(true);
  const [items, setItems] = useState<AdminPiece[]>([]);
  const [counts, setCounts] = useState({ available: 0, sold: 0 });
  const [needsSql, setNeedsSql] = useState(false);
  const [single, setSingle] = useState(EMPTY_SINGLE);
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);

  useEffect(() => {
    if (!serviceId && vaultServices[0]) setServiceId(vaultServices[0].id);
  }, [serviceId, vaultServices]);

  const load = useCallback(async () => {
    if (!serviceId) return;
    const result = await adminVault("list", serviceId, packageId);
    if (!result.ok) {
      setNeedsSql(Boolean(result.needsSql));
      if (!result.needsSql) toast.error(result.error ?? "Vault error");
      return;
    }
    setNeedsSql(false);
    setUpgraded(result.upgraded !== false);
    setPackages(result.packages ?? []);
    setStock(result.stock ?? {});
    setShared(result.shared ?? 0);
    setItems(result.items ?? []);
    setCounts({ available: result.available ?? 0, sold: result.sold ?? 0 });
  }, [serviceId, packageId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(pieces: NewPiece[]) {
    if (!serviceId || pieces.length === 0) return;
    setBusy(true);
    try {
      const result = await adminVault("add", serviceId, packageId, pieces);
      if (!result.ok) {
        setNeedsSql(Boolean(result.needsSql));
        toast.error(result.error ?? "Vault error");
        return;
      }
      toast.success(t.vaultAdded.replace("{n}", String(result.added ?? pieces.length)));
      setSingle(EMPTY_SINGLE);
      setBulk("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Codes: `CODE` or `CODE|PIN|instructions`. Accounts: `email:password:notes` (or `|`). */
  const parsed = useMemo<NewPiece[]>(
    () =>
      bulk
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line): NewPiece => {
          if (vaultType === "REDEEM_CODE") {
            const [redeemCode = "", pinOrSerial = "", ...rest] = line.split("|");
            return { vaultType, redeemCode: redeemCode.trim(), pinOrSerial: pinOrSerial.trim(), extraInfo: rest.join("|").trim() };
          }
          const parts = line.includes("|") ? line.split("|") : line.split(":");
          const [email = "", password = "", ...rest] = parts;
          return { vaultType, email: email.trim(), password: password.trim(), extraInfo: rest.join(line.includes("|") ? "|" : ":").trim() };
        })
        .filter((piece) => (piece.vaultType === "REDEEM_CODE" ? piece.redeemCode : piece.email && piece.password)),
    [bulk, vaultType],
  );

  const singleReady = vaultType === "REDEEM_CODE" ? Boolean(single.redeemCode.trim()) : Boolean(single.email.trim() && single.password.trim());
  function addSingle() {
    if (!singleReady) return;
    void add([
      vaultType === "REDEEM_CODE"
        ? { vaultType, redeemCode: single.redeemCode.trim(), pinOrSerial: single.pinOrSerial.trim(), extraInfo: single.extraInfo.trim() }
        : { vaultType, email: single.email.trim(), password: single.password.trim(), extraInfo: single.extraInfo.trim() },
    ]);
  }

  async function remove(id: string) {
    const result = await adminVault("delete", serviceId, packageId, id);
    if (!result.ok) toast.error(result.error ?? "Vault error");
    else await load();
  }

  const sizeName = (id: string) => packages.find((pack) => pack.id === id)?.sizeName ?? (ar ? "أي حجم" : "Any size");
  const shown = applyFilter<AdminPiece>(
    items,
    filter,
    (row) => [row.redeemCode, row.pinOrSerial, row.email, row.extraInfo, row.receiptNumber, row.buyer],
    (row) => row.createdAt,
  ).slice(0, 100);

  return (
    <AdminBox id="vault-manager" icon={LockKeyhole} title={t.vaultManager}>
      {vaultServices.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.vaultNoServices}</p>
      ) : (
        <>
          {/* Step 1 · service */}
          <div className="vault-step mt-3">
            <p className="vault-step-label">
              <span className="vault-step-num">1</span>
              {ar ? "اختر الخدمة / المنتج" : "Select service / product"}
            </p>
            <select
              className="field mt-2"
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setPackageId("");
              }}
            >
              {vaultServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {ar && service.nameAr ? service.nameAr : service.name}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2 · package size, each with its live stock */}
          <div className="vault-step mt-3">
            <p className="vault-step-label">
              <span className="vault-step-num">2</span>
              {ar ? "اختر حجم الباقة / الفئة" : "Select package size / tier"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={ar ? "حجم الباقة" : "Package size"}>
              {packages.map((pack) => {
                const on = packageId === pack.id;
                const left = stock[pack.id] ?? 0;
                return (
                  <button key={pack.id} type="button" role="radio" aria-checked={on} onClick={() => setPackageId(pack.id)} className={`vault-size-pill ${on ? "is-on" : ""}`}>
                    <span className="min-w-0 truncate">{pack.sizeName}</span>
                    <span className={`vault-stock-badge ${left === 0 ? "is-empty" : ""}`}>{left}</span>
                  </button>
                );
              })}
              <button type="button" role="radio" aria-checked={packageId === ""} onClick={() => setPackageId("")} className={`vault-size-pill ${packageId === "" ? "is-on" : ""}`}>
                <Layers className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                <span>{ar ? "أي حجم" : "Any size"}</span>
                <span className={`vault-stock-badge ${shared === 0 ? "is-empty" : ""}`}>{shared}</span>
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              {packageId
                ? ar
                  ? `المخزون المضاف هنا يُباع فقط لباقة «${sizeName(packageId)}».`
                  : `Stock added here is sold only for “${sizeName(packageId)}”.`
                : ar
                  ? "«أي حجم» يُباع لأي باقة من هذه الخدمة عند نفاد مخزونها الخاص."
                  : "“Any size” is sold for any package of this service once its own stock runs out."}
            </p>
            {!upgraded ? (
              <p className="mt-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold">
                {ar ? "شغّل الجزء 8 من SQL لتفعيل المخزون حسب حجم الباقة وأكواد الاسترداد." : "Run SQL part 8 to enable stock per package size and redeem codes."}
              </p>
            ) : null}
          </div>

          {/* Step 3 · what kind of stock */}
          <div className="vault-step mt-3">
            <p className="vault-step-label">
              <span className="vault-step-num">3</span>
              {ar ? "نوع المخزون" : "Stock type"}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/5 p-1" role="radiogroup">
              {(
                [
                  ["REDEEM_CODE", Gift, ar ? "كود استرداد / بطاقة هدايا" : "Redeem code / gift card"],
                  ["ACCOUNT", Mail, ar ? "حساب جاهز (بريد وكلمة مرور)" : "Ready account (email & password)"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={vaultType === value}
                  onClick={() => {
                    setVaultType(value);
                    setSingle(EMPTY_SINGLE);
                    setBulk("");
                  }}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition sm:text-sm ${vaultType === value ? "keep-white bg-[#0f172a] text-white shadow" : "text-muted"}`}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {needsSql ? (
            <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
              <p className="font-semibold">{ar ? "شغّل SQL الخزنة (الجزآن 3 و 8) في Supabase ← SQL Editor." : "Run the vault SQL (parts 3 and 8) in Supabase → SQL Editor."}</p>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(sql).then(() => toast.success(t.sqlCopied))} className="mt-2 min-h-9 rounded-full border border-white/15 px-3 text-xs font-bold">
                {ar ? "نسخ SQL الخزنة" : "Copy vault SQL"}
              </button>
            </div>
          ) : null}

          {/* Single piece */}
          <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            {vaultType === "REDEEM_CODE" ? (
              <>
                <input className="field font-mono" dir="ltr" placeholder={ar ? "كود الاسترداد" : "Redeem code"} value={single.redeemCode} onChange={(event) => setSingle({ ...single, redeemCode: event.target.value })} />
                <input className="field" dir="ltr" placeholder={ar ? "PIN / الرقم التسلسلي (اختياري)" : "PIN / serial (optional)"} value={single.pinOrSerial} onChange={(event) => setSingle({ ...single, pinOrSerial: event.target.value })} />
                <input className="field" placeholder={ar ? "طريقة الاستخدام (اختياري)" : "How to redeem (optional)"} value={single.extraInfo} onChange={(event) => setSingle({ ...single, extraInfo: event.target.value })} />
              </>
            ) : (
              <>
                <input className="field" dir="ltr" placeholder={t.vaultEmail} value={single.email} onChange={(event) => setSingle({ ...single, email: event.target.value })} />
                <input className="field" dir="ltr" placeholder={t.vaultPassword} value={single.password} onChange={(event) => setSingle({ ...single, password: event.target.value })} />
                <input className="field" placeholder={ar ? "ملاحظات (اختياري)" : "Notes (optional)"} value={single.extraInfo} onChange={(event) => setSingle({ ...single, extraInfo: event.target.value })} />
              </>
            )}
            <button type="button" disabled={busy || !singleReady} onClick={addSingle} className="btn-glow keep-white min-h-11 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-60">
              {t.vaultAdd}
            </button>
          </div>

          {/* Bulk paste, one per line */}
          <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer text-sm font-semibold">{t.vaultBulk}</summary>
            <p className="mt-2 text-[11px] text-muted" dir="ltr">
              {vaultType === "REDEEM_CODE" ? "CODE   or   CODE|PIN|instructions" : "email:password:notes   or   email|password|notes"}
            </p>
            <textarea
              className="field mt-2 min-h-28 font-mono text-xs"
              dir="ltr"
              placeholder={vaultType === "REDEEM_CODE" ? "XXXX-XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY|PIN-4421" : "user1@mail.com:Pass123\nuser2@mail.com:Pass456:2FA off"}
              value={bulk}
              onChange={(event) => setBulk(event.target.value)}
            />
            <button type="button" disabled={busy || parsed.length === 0} onClick={() => void add(parsed)} className="mt-2 min-h-10 rounded-full border border-white/15 px-4 text-sm font-bold disabled:opacity-60">
              {t.vaultBulkAdd} ({parsed.length}) → {sizeName(packageId)}
            </button>
          </details>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-500/12 px-3 py-1.5 text-xs font-bold text-emerald-600">{t.vaultRemaining.replace("{n}", String(counts.available))}</span>
            <span className="rounded-full bg-slate-500/12 px-3 py-1.5 text-xs font-bold text-muted">{t.vaultSoldCount.replace("{n}", String(counts.sold))}</span>
          </div>
          <BoxFilter value={filter} onChange={setFilter} />
          <div className="admin-table mt-3 max-h-[24rem] overflow-auto rounded-xl">
            {shown.length === 0 ? <p className="p-4 text-sm text-muted">{t.noResults}</p> : null}
            {shown.map((piece) => {
              const isCode = piece.vaultType === "REDEEM_CODE";
              const summary = isCode
                ? `${piece.redeemCode}${piece.pinOrSerial ? ` · ${piece.pinOrSerial}` : ""}`
                : `${piece.email} · ${piece.password}${piece.extraInfo ? ` · ${piece.extraInfo}` : ""}`;
              return (
                <div key={piece.id} className="admin-row flex min-w-0 items-center gap-2 px-3 py-2 text-xs">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${piece.status === "AVAILABLE" ? "bg-emerald-500/12 text-emerald-600" : "bg-slate-500/12 text-muted"}`}>
                    {piece.status === "AVAILABLE" ? t.available : t.sold}
                  </span>
                  {isCode ? <KeyRound className="size-3.5 shrink-0 text-sky-600" aria-label={ar ? "كود" : "Code"} /> : <Mail className="size-3.5 shrink-0 text-slate-500" aria-label={ar ? "حساب" : "Account"} />}
                  <span className="price-num min-w-0 flex-1 truncate" dir="ltr" title={summary}>
                    {summary}
                  </span>
                  <span className="hidden shrink-0 text-muted sm:inline">{sizeName(piece.packageId)}</span>
                  {piece.status === "SOLD" ? (
                    <span className="hidden truncate text-muted md:inline" dir="ltr">
                      {piece.buyer} {piece.receiptNumber ? `#${piece.receiptNumber}` : ""}
                    </span>
                  ) : (
                    <button type="button" onClick={() => void remove(piece.id)} aria-label={t.delete} className="grid size-8 shrink-0 place-items-center rounded-lg border border-rose-400/40 text-rose-500">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </AdminBox>
  );
}
