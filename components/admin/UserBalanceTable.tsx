"use client";

import { useState } from "react";
import { Card, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/primitives";
import { formatCurrency } from "@/lib/pricing";
import { topUpBalanceAction } from "@/app/admin/users/actions";
import type { Profile } from "@/types";

export function UserBalanceTable({ users }: { users: Profile[] }) {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [balances, setBalances] = useState(
    Object.fromEntries(users.map((u) => [u.id, u.balance]))
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleTopUp(userId: string) {
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) return;

    setSubmitting(true);
    const result = await topUpBalanceAction({ userId, amount: value });
    setSubmitting(false);

    if (result.success) {
      setBalances((prev) => ({ ...prev, [userId]: prev[userId] + value }));
      setActiveUserId(null);
      setAmount("");
    }
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-muted text-xs">
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Balance</th>
            <th className="px-4 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3">{u.name}</td>
              <td className="px-4 py-3 text-muted">{u.email}</td>
              <td className="px-4 py-3">
                <Badge tone={u.role === "VIP" ? "vip" : u.role === "ADMIN" ? "admin" : "default"}>
                  {u.role}
                </Badge>
              </td>
              <td className="px-4 py-3 font-tabular">{formatCurrency(balances[u.id])}</td>
              <td className="px-4 py-3">
                {activeUserId === u.id ? (
                  <div className="flex justify-end gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-24"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      autoFocus
                    />
                    <Button size="sm" disabled={submitting} onClick={() => handleTopUp(u.id)}>
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setActiveUserId(null);
                        setAmount("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button size="sm" variant="secondary" onClick={() => setActiveUserId(u.id)}>
                      Top Up Balance
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
