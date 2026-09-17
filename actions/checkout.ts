// actions/checkout.ts
"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkoutSchema, type CheckoutInput } from "@/lib/validations/auth";

type CheckoutResult = { success: true; transactionId: string } | { success: false; error: string };

export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "You must be signed in to check out" };
  }

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid checkout data" };
  }

  const { gameId, productId, paymentMethod, accountInfo } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.gameId !== gameId) {
    return { success: false, error: "Selected product is no longer available" };
  }

  const transaction = await prisma.transaction.create({
    data: {
      userId: session.user.id,
      gameId,
      productId,
      paymentMethod,
      accountInfo,
      totalCents: product.priceCents,
      currency: product.currency,
      status: "PENDING",
    },
  });

  // --- Payment provider integration point ---
  // This is where you'd create a Stripe/PayPal checkout session, e.g.:
  //
  //   const stripeSession = await stripe.checkout.sessions.create({
  //     mode: "payment",
  //     line_items: [{ price_data: { currency: product.currency, unit_amount: product.priceCents,
  //       product_data: { name: product.name } }, quantity: 1 }],
  //     success_url: `${process.env.NEXT_PUBLIC_URL}/dashboard?status=success`,
  //     cancel_url: `${process.env.NEXT_PUBLIC_URL}/game/${gameId}?status=cancelled`,
  //     metadata: { transactionId: transaction.id },
  //   });
  //   await prisma.transaction.update({
  //     where: { id: transaction.id },
  //     data: { providerReference: stripeSession.id },
  //   });
  //   redirect(stripeSession.url!);

  return { success: true, transactionId: transaction.id };
}
