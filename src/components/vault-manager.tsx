"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminBox, BoxFilter, EMPTY_FILTER, applyFilter, type Filter } from "@/components/admin-boxes";
import { useI18n } from "@/lib/i18n";
import type { CatalogService } from "@/lib/store/types";
import { adminVault, type AdminPiece } from "@/lib/vault-client";

/** Pick a VAULT service, see live stock, add pieces (single or bulk paste), view and delete. */
export function VaultManager({ services, sql }: { services: CatalogService[]; sql: string }) {
  const { t, language } = useI18n();
  const vaultServices = useMemo(() => services.filter((service) => service.serviceMode === "VAULT"), [services]);
  const [serviceId, setServiceId] = useState("");
  const [items, setItems] = useState<AdminPiece[]>([]);
  const [counts, setCounts] = useState({ available: 0, sold: 0 });
  const [needsSql, setNeedsSql] = useState(false);
  const [single, setSingle] = useState({ email: "", password: "", extraInfo: "" });
  const [bulk, setBulk] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);

  useEffect(() => {
    if (!serviceId && vaultServices[0]) setServiceId(vaultServices[0].id);
  }, [serviceId, vaultServices]);

  const load = useCallback(async () => {
    if (!serviceId) return;
    const result = await adminVault("list", serviceId);
    if (!result.ok) {
      setNeedsSql(Boolean(result.needsSql));
      if (!result.needsSql) toast.error(result.error ?? "Vault error");
      return;
    }
    setNeedsSql(false);
    setItems(result.items ?? []);
    setCounts({ available: result.available ?? 0, sold: result.sold ?? 0 });
  }, [serviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(pieces: Array<{ email: string; password: string; extraInfo: string }>) {
    if (!serviceId || pieces.length === 0) return;
    setBusy(true);
    try {
      const result = await adminVault("add", serviceId, pieces);
      if (!result.ok) {
        setNeedsSql(Boolean(result.needsSql));
        toast.error(result.error ?? "Vault error");
        return;
      }
      toast.success(t.vaultAdded.replace("{n}", String(result.added ?? pieces.length)));
      setSingle({ email: "", password: "", extraInfo: "" });
      setBulk("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  function parseBulk(): Array<{ email: string; password: string; extraInfo: string }> {
    return bulk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email = "", password = "", ...rest] = line.split(":");
        return { email: email.trim(), password: password.trim(), extraInfo: rest.join(":").trim() };
      })
      .filter((piece) => piece.email && piece.password);
  }

  async function remove(id: string) {
    const result = await adminVault("delete", serviceId, id);
    if (!result.ok) toast.error(result.error ?? "Vault error");
    else await load();
  }

  const shown = applyFilter<AdminPiece>(items, filter, (row) => [row.email, row.extraInfo, row.receiptNumber, row.buyer], (row) => row.createdAt).slice(0, 100);

  return (
    <AdminBox id="vault-manager" title={t.vaultManager}>
      {vaultServices.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t.vaultNoServices}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="min-w-0 flex-1 text-xs font-bold text-muted">
              {t.vaultPickService}
              <select className="field mt-1" value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
                {vaultServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {language === "ar" && service.nameAr ? service.nameAr : service.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="rounded-full bg-emerald-500/12 px-3 py-1.5 text-xs font-bold text-emerald-600">{t.vaultRemaining.replace("{n}", String(counts.available))}</span>
            <span className="rounded-full bg-slate-500/12 px-3 py-1.5 text-xs font-bold text-muted">{t.vaultSoldCount.replace("{n}", String(counts.sold))}</span>
          </div>

          {needsSql ? (
            <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
              <p className="font-semibold">Run migrations/0004_vault.sql in Supabase → SQL Editor.</p>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(sql).then(() => toast.success(t.sqlCopied))} className="mt-2 min-h-9 rounded-full border border-white/15 px-3 text-xs font-bold">
                ⚡ Copy SQL (0004_vault.sql)
              </button>
            </div>
          ) : null}

          <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input className="field" dir="ltr" placeholder={t.vaultEmail} value={single.email} onChange={(event) => setSingle({ ...single, email: event.target.value })} />
            <input className="field" dir="ltr" placeholder={t.vaultPassword} value={single.password} onChange={(event) => setSingle({ ...single, password: event.target.value })} />
            <input className="field" dir="ltr" placeholder="123" value={single.extraInfo} onChange={(event) => setSingle({ ...single, extraInfo: event.target.value })} />
            <button
              type="button"
              disabled={busy || !single.email.trim() || !single.password.trim()}
              onClick={() => void add([{ email: single.email.trim(), password: single.password.trim(), extraInfo: single.extraInfo.trim() }])}
              className="btn-glow keep-white min-h-11 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {t.vaultAdd}
            </button>
          </div>

          <details className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer text-sm font-semibold">{t.vaultBulk}</summary>
            <textarea
              className="field mt-2 min-h-28 font-mono text-xs"
              dir="ltr"
              placeholder={"user1@mail.com:Pass123:PIN-4421\nuser2@mail.com:Pass456:PIN-9902"}
              value={bulk}
              onChange={(event) => setBulk(event.target.value)}
            />
            <button type="button" disabled={busy || parseBulk().length === 0} onClick={() => void add(parseBulk())} className="mt-2 min-h-10 rounded-full border border-white/15 px-4 text-sm font-bold disabled:opacity-60">
              {t.vaultBulkAdd} ({parseBulk().length})
            </button>
          </details>

          <BoxFilter value={filter} onChange={setFilter} />
          <div className="admin-table mt-3 max-h-[24rem] overflow-auto rounded-xl">
            {shown.length === 0 ? <p className="p-4 text-sm text-muted">{t.noResults}</p> : null}
            {shown.map((piece) => (
              <div key={piece.id} className="admin-row flex min-w-0 items-center gap-2 px-3 py-2 text-xs">
                <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${piece.status === "AVAILABLE" ? "bg-emerald-500/12 text-emerald-600" : "bg-slate-500/12 text-muted"}`}>
                  {piece.status === "AVAILABLE" ? t.available : t.sold}
                </span>
                <span className="price-num min-w-0 flex-1 truncate" dir="ltr" title={`${piece.email} · ${piece.password} · ${piece.extraInfo}`}>
                  {piece.email} · {piece.password} {piece.extraInfo ? `· ${piece.extraInfo}` : ""}
                </span>
                {piece.status === "SOLD" ? (
                  <span className="hidden truncate text-muted sm:inline" dir="ltr">
                    {piece.buyer} {piece.receiptNumber ? `#${piece.receiptNumber}` : ""}
                  </span>
                ) : null}
                <button type="button" onClick={() => void remove(piece.id)} aria-label={t.delete} className="grid size-8 shrink-0 place-items-center rounded-lg border border-rose-400/40 text-rose-500">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </AdminBox>
  );
}
