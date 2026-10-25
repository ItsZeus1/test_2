"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert, Input, Label, Select, Spinner } from "@/components/ui/primitives";
import { PAYMENT_METHODS } from "@/lib/constants";
import { requestBalanceAction } from "@/app/actions";

export function WalletModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await requestBalanceAction({
      amount: Number(amount),
      paymentMethod: method as (typeof PAYMENT_METHODS)[number],
      referenceNote: note,
    });
    setLoading(false);
    if (!res.success) setError(res.error);
    else setDone(true);
  }

  return (
    <Modal title="Add balance" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <Alert tone="success">
            Request submitted. An admin will review it and credit your wallet once your payment is
            confirmed.
          </Alert>
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <div>
            <Label>Amount (USD)</Label>
            <Input
              type="number"
              min="1"
              step="0.01"
              placeholder="25.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <Label>Payment method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Transaction reference / voucher code (optional)</Label>
            <Input
              placeholder="e.g. transfer ID or voucher code"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted">
            Pay using the method above, then submit this request. Funds are added after an admin
            approves it.
          </p>
          <Button type="submit" variant="glow" className="w-full" disabled={loading}>
            {loading && <Spinner />} Submit request
          </Button>
        </form>
      )}
    </Modal>
  );
}
