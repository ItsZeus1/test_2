"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, CreditCard, Loader2, Wallet, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { purchaseProductAction } from "@/lib/actions/purchase";
import type { Product } from "@/lib/types";

type PaymentMethod = "card" | "wallet";

interface PurchaseFlowProps {
  products: Product[];
  isLoggedIn: boolean;
  gameTitle: string;
}

export function PurchaseFlow({ products, isLoggedIn, gameTitle }: PurchaseFlowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(
    products[0] ?? null
  );
  const [payment, setPayment] = useState<PaymentMethod>("card");
  const [step, setStep] = useState<"select" | "confirm" | "success">("select");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; productName: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (products.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-zinc-500">
          No top-up packages are available for {gameTitle} yet. Check back soon.
        </CardContent>
      </Card>
    );
  }

  function handleCheckout() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    if (!selectedProduct) return;

    setError(null);
    startTransition(async () => {
      const res = await purchaseProductAction(selectedProduct.id);
      if (res.success && res.data) {
        setResult({ code: res.data.code, productName: res.data.productName });
        setStep("success");
      } else if (!res.success) {
        setError(res.error);
      }
    });
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === "success" && result) {
    return (
      <Card className="glow-border-emerald">
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-400" />
          <h3 className="text-xl font-bold text-white">Purchase complete!</h3>
          <p className="mt-1 text-sm text-zinc-400">{result.productName}</p>

          <div className="mx-auto mt-6 flex max-w-sm items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
            <code className="truncate font-mono text-lg font-bold tracking-wider text-emerald-400">
              {result.code}
            </code>
            <Button size="icon" variant="ghost" onClick={handleCopy} aria-label="Copy code">
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            This code has also been saved to your dashboard order history.
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              View order history
            </Button>
            <Button
              onClick={() => {
                setStep("select");
                setResult(null);
              }}
            >
              Buy again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step 1: package selection */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            1. Select a package
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products.map((product) => {
              const active = selectedProduct?.id === product.id;
              return (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className={`relative rounded-lg border p-4 text-left transition-all ${
                    active
                      ? "border-emerald-500 bg-emerald-500/10 shadow-glow-emerald"
                      : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  {active && (
                    <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-emerald-400" />
                  )}
                  <p className="font-semibold text-white">{product.name}</p>
                  {product.description && (
                    <p className="mt-1 text-xs text-zinc-500">{product.description}</p>
                  )}
                  <p className="mt-2 text-lg font-bold text-emerald-400">
                    {formatCurrency(product.price)}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: payment method (mock) */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            2. Select payment method
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setPayment("card")}
              className={`flex items-center justify-center gap-2 rounded-lg border p-4 transition-all ${
                payment === "card"
                  ? "border-purple-500 bg-purple-500/10 shadow-glow-purple text-white"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <CreditCard className="h-4 w-4" />
              Card
            </button>
            <button
              onClick={() => setPayment("wallet")}
              className={`flex items-center justify-center gap-2 rounded-lg border p-4 transition-all ${
                payment === "wallet"
                  ? "border-purple-500 bg-purple-500/10 shadow-glow-purple text-white"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <Wallet className="h-4 w-4" />
              Wallet
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Demo checkout — no real payment gateway is connected yet.
          </p>
        </CardContent>
      </Card>

      {/* Step 3: checkout */}
      {error && <Alert variant="destructive">{error}</Alert>}

      <Card>
        <CardContent className="flex flex-col items-center justify-between gap-4 p-4 sm:flex-row sm:p-6">
          <div>
            <p className="text-sm text-zinc-500">Total</p>
            <p className="text-2xl font-bold text-white">
              {selectedProduct ? formatCurrency(selectedProduct.price) : "—"}
            </p>
          </div>
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={!selectedProduct || isPending}
            onClick={handleCheckout}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : isLoggedIn ? (
              "Confirm & pay"
            ) : (
              "Sign in to purchase"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
