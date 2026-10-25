"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert, Card, Input, RoleBadge, Select, StatusBadge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";
import { resolveRequestAction, setRoleAction, updateBalanceAction } from "@/app/admin/users/actions";
import type { BalanceRequestRow, Profile, Role } from "@/lib/types";

export function UsersAdmin({
  users,
  requests,
  currentAdminId,
}: {
  users: Profile[];
  requests: BalanceRequestRow[];
  currentAdminId: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"users" | "requests">("users");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === "PENDING").length;

  async function run(key: string, fn: () => Promise<{ success: boolean; error?: string }>, okText: string) {
    setBusy(key);
    setMessage(null);
    const res = await fn();
    setBusy(null);
    if (!res.success) setMessage({ tone: "error", text: res.error ?? "Something went wrong." });
    else {
      setMessage({ tone: "success", text: okText });
      router.refresh();
    }
  }

  function applyBalance(u: Profile, mode: "add" | "set") {
    const value = parseFloat(amounts[u.id] ?? "");
    if (Number.isNaN(value)) {
      setMessage({ tone: "error", text: "Enter an amount first." });
      return;
    }
    run(
      `bal-${u.id}`,
      async () => {
        const res = await updateBalanceAction({ userId: u.id, amount: value, mode });
        if (res.success) setAmounts((a) => ({ ...a, [u.id]: "" }));
        return res;
      },
      mode === "add" ? `Added ${formatMoney(value)} to ${u.name}.` : `Balance for ${u.name} set to ${formatMoney(value)}.`
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-medium">Users &amp; balances</h1>

      <div className="flex gap-2" role="tablist">
        {(
          [
            ["users", `Users (${users.length})`],
            ["requests", `Deposit requests${pending ? ` (${pending} pending)` : ""}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full border px-4 py-1.5 text-sm ${
              tab === key ? "border-violet bg-violet/20" : "border-white/10 bg-white/5 text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {tab === "users" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Last IP</th>
                  <th className="px-4 py-3 font-medium">Top up / set funds</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-white/5 align-middle">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted">@{u.username}</div>
                    </td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RoleBadge role={u.role} />
                        <Select
                          aria-label={`Role for ${u.name}`}
                          className="w-28 py-1.5"
                          value={u.role}
                          disabled={busy === `role-${u.id}`}
                          onChange={(e) =>
                            run(
                              `role-${u.id}`,
                              () => setRoleAction({ userId: u.id, role: e.target.value as Role }),
                              `${u.name} is now ${e.target.value}.`
                            )
                          }
                        >
                          <option value="NORMAL">NORMAL</option>
                          <option value="VIP">VIP</option>
                          <option value="ADMIN" disabled={false}>
                            ADMIN
                          </option>
                        </Select>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-tabular font-semibold">{formatMoney(u.balance)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{u.last_ip ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          aria-label={`Amount for ${u.name}`}
                          className="w-24 py-1.5"
                          value={amounts[u.id] ?? ""}
                          onChange={(e) => setAmounts((a) => ({ ...a, [u.id]: e.target.value }))}
                        />
                        <Button size="sm" disabled={busy === `bal-${u.id}`} onClick={() => applyBalance(u, "add")}>
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy === `bal-${u.id}`}
                          onClick={() => applyBalance(u, "set")}
                        >
                          Set
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-white/5 px-4 py-2 text-xs text-muted">
            Signed in as admin {users.find((u) => u.id === currentAdminId)?.email}. You can’t demote your own account.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted">
                      No deposit requests yet.
                    </td>
                  </tr>
                )}
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.user_name ?? "Unknown"}</div>
                      <div className="text-xs text-muted">@{r.user_username}</div>
                    </td>
                    <td className="px-4 py-3 font-tabular font-semibold">{formatMoney(r.amount)}</td>
                    <td className="px-4 py-3">{r.payment_method}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-muted">{r.reference_note ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      {r.status === "PENDING" && (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            disabled={busy === `req-${r.id}`}
                            onClick={() =>
                              run(
                                `req-${r.id}`,
                                () => resolveRequestAction({ requestId: r.id, approve: true }),
                                `Approved — ${formatMoney(r.amount)} credited to ${r.user_name}.`
                              )
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy === `req-${r.id}`}
                            onClick={() =>
                              run(
                                `req-${r.id}`,
                                () => resolveRequestAction({ requestId: r.id, approve: false }),
                                "Request rejected."
                              )
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
