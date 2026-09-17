// components/game-topup/topup-flow.tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { CreditCard, Wallet, Coins, HelpCircle, Check, Zap } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { createCheckoutSession } from "@/actions/checkout";

type AccountField = { key: string; label: string; placeholder: string; helpText: string };

type ProductVM = {
  id: string;
  name: string;
  amount: number;
  bonusAmount: number;
  priceCents: number;
  currency: string;
  isPopular: boolean;
};

type GameVM = {
  id: string;
  slug: string;
  name: string;
  publisher: string;
  coverImage: string;
  accountFields: AccountField[];
  products: ProductVM[];
};

const PAYMENT_METHODS = [
  { id: "CREDIT_CARD", label: "Credit / Debit Card", icon: CreditCard },
  { id: "PAYPAL", label: "PayPal", icon: Wallet },
  { id: "CRYPTO", label: "Crypto", icon: Coins },
  { id: "E_WALLET", label: "Local E-Wallet", icon: Zap },
] as const;

type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function TopUpFlow({ game }: { game: GameVM }) {
  const [accountInfo, setAccountInfo] = useState<Record<string, string>>({});
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    game.products.find((p) => p.isPopular)?.id ?? game.products[0]?.id ?? null
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => game.products.find((p) => p.id === selectedProductId) ?? null,
    [game.products, selectedProductId]
  );

  const accountComplete = game.accountFields.every((f) => accountInfo[f.key]?.trim());
  const canCheckout = accountComplete && !!selectedProduct && !!paymentMethod;

  function handleBuyNow() {
    if (!canCheckout || !selectedProduct || !paymentMethod) return;
    setError(null);
    startTransition(async () => {
      const result = await createCheckoutSession({
        gameId: game.id,
        productId: selectedProduct.id,
        paymentMethod,
        accountInfo,
      });
      if (!result.success) setError(result.error);
    });
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pb-32 pt-8 lg:grid-cols-[1fr_360px] lg:pb-8">
      <div className="space-y-10">
        {/* Header */}
        <header className="flex items-center gap-4">
          <img
            src={game.coverImage}
            alt={game.name}
            className="h-16 w-16 rounded-2xl border border-white/10 object-cover"
          />
          <div>
            <p className="text-sm text-zinc-400">{game.publisher}</p>
            <h1 className="font-display text-2xl font-semibold text-white">{game.name} Top-Up</h1>
          </div>
        </header>

        {/* Step 1: Account Info */}
        <Section step={1} title="Enter your account details">
          <div className="grid gap-4 sm:grid-cols-2">
            {game.accountFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label htmlFor={field.key} className="text-sm font-medium text-zinc-200">
                    {field.label}
                  </label>
                  <Tooltip.Provider delayDuration={150}>
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          type="button"
                          className="text-zinc-500 hover:text-cyan-400"
                          aria-label={`Where to find your ${field.label}`}
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          sideOffset={6}
                          className="max-w-[220px] rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 shadow-xl"
                        >
                          {field.helpText}
                          <Tooltip.Arrow className="fill-zinc-900" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </Tooltip.Provider>
                </div>
                <input
                  id={field.key}
                  value={accountInfo[field.key] ?? ""}
                  onChange={(e) =>
                    setAccountInfo((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none ring-cyan-400/50 backdrop-blur-sm focus:ring-2"
                />
              </div>
            ))}
          </div>
        </Section>

        {/* Step 2: Denominations */}
        <Section step={2} title="Choose an amount">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {game.products.map((product) => {
              const isActive = product.id === selectedProductId;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedProductId(product.id)}
                  className={`group relative flex flex-col items-start gap-1 rounded-2xl border px-4 py-4 text-left transition-all ${
                    isActive
                      ? "border-cyan-400/70 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.4),0_0_24px_-6px_rgba(34,211,238,0.5)]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  {isActive && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400 text-zinc-950">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  )}
                  {product.isPopular && (
                    <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                      Most popular
                    </span>
                  )}
                  <span className="font-display text-lg font-semibold text-white">
                    {product.amount.toLocaleString()}
                    {product.bonusAmount > 0 && (
                      <span className="ml-1 text-sm font-normal text-emerald-400">
                        +{product.bonusAmount.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-zinc-400">
                    {formatPrice(product.priceCents, product.currency)}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Step 3: Payment Method */}
        <Section step={3} title="Select a payment method">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => {
              const isActive = id === paymentMethod;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPaymentMethod(id)}
                  className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center transition-all ${
                    isActive
                      ? "border-violet-400/70 bg-violet-400/10 shadow-[0_0_0_1px_rgba(167,139,250,0.4)]"
                      : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "text-violet-300" : "text-zinc-400"}`} />
                  <span className="text-xs font-medium text-zinc-200">{label}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {error && (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>

      {/* Step 4: Checkout summary — desktop side panel */}
      <aside className="hidden lg:block">
        <div className="sticky top-8 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
          <h2 className="font-display text-base font-semibold text-white">Order summary</h2>
          <SummaryBody
            selectedProduct={selectedProduct}
            paymentMethod={paymentMethod}
            canCheckout={canCheckout}
            isPending={isPending}
            onBuyNow={handleBuyNow}
          />
        </div>
      </aside>

      {/* Step 4: Checkout bar — mobile sticky bottom */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-zinc-950/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-zinc-400">Total</p>
            <p className="font-display text-lg font-semibold text-white">
              {selectedProduct ? formatPrice(selectedProduct.priceCents, selectedProduct.currency) : "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleBuyNow}
            disabled={!canCheckout || isPending}
            className="flex-1 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 py-3.5 text-center text-sm font-semibold text-zinc-950 transition-opacity disabled:opacity-40"
          >
            {isPending ? "Processing…" : "Buy Now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
          {step}
        </span>
        <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SummaryBody({
  selectedProduct,
  paymentMethod,
  canCheckout,
  isPending,
  onBuyNow,
}: {
  selectedProduct: ProductVM | null;
  paymentMethod: PaymentMethodId | null;
  canCheckout: boolean;
  isPending: boolean;
  onBuyNow: () => void;
}) {
  return (
    <>
      <div className="space-y-2 border-b border-white/10 pb-4 text-sm">
        <Row label="Item" value={selectedProduct ? selectedProduct.name : "Select an amount"} />
        <Row
          label="Payment"
          value={paymentMethod ? PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.label ?? "—" : "—"}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">Total</span>
        <span className="font-display text-xl font-semibold text-white">
          {selectedProduct ? formatPrice(selectedProduct.priceCents, selectedProduct.currency) : "—"}
        </span>
      </div>
      <button
        type="button"
        onClick={onBuyNow}
        disabled={!canCheckout || isPending}
        className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 py-3 text-sm font-semibold text-zinc-950 transition-opacity disabled:opacity-40"
      >
        {isPending ? "Processing…" : "Buy Now"}
      </button>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-200">{value}</span>
    </div>
  );
}
