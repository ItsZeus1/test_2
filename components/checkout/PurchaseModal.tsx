"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/primitives";
import { formatCurrency } from "@/lib/pricing";
import { purchaseAction } from "@/app/service/[slug]/actions";
import type { PackagePublic } from "@/types";

export function PurchaseModal({
  pkg,
  price,
  balance,
  onClose,
}: {
  pkg: PackagePublic;
  price: number;
  balance: number;
  onClose: () => void;
}) {
  const [targetAccountId, setTargetAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const insufficientFunds = balance < price;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (targetAccountId.trim().length < 2) {
      setError("Enter a valid target account ID");
      return;
    }
    setSubmitting(true);
    setError(null);

    // The server action re-verifies role, re-fetches the real price, and
    // re-checks balance itself — nothing here is trusted as-is.
    const result = await purchaseAction({ packageId: pkg.id, targetAccountId });

    setSubmitting(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-panel border border-line rounded-sharp w-full max-w-sm p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg font-medium">Confirm purchase</h2>
            <button onClick={onClose} className="text-muted hover:text-text">
              <X className="w-4 h-4" />
            </button>
          </div>

          {success ? (
            <div>
              <p className="text-sm text-emerald-400 mb-4">
                Purchase submitted. Delivery is on its way to your account.
              </p>
              <Button className="w-full" onClick={onClose}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex justify-between text-sm border-b border-line pb-4">
                <span className="text-muted">{pkg.size_name}</span>
                <span className="font-tabular font-medium">{formatCurrency(price)}</span>
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Target Account ID</label>
                <Input
                  placeholder="e.g. PlayerName#1234"
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  autoFocus
                />
                <FieldError message={error ?? undefined} />
              </div>

              {insufficientFunds && (
                <p className="text-xs text-red-400">
                  Insufficient balance — top up your wallet to continue.
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || insufficientFunds}
              >
                {submitting ? "Processing…" : `Pay ${formatCurrency(price)}`}
              </Button>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
