import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OrdersList } from "@/components/orders/OrdersList";
import type { TransactionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getCurrentUser();
  if (!session) redirect("/login");

  // RLS (transactions_select_own) guarantees users only ever see their own rows.
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("id, user_id, service_id, package_id, service_name, size_name, target_account_id, amount_paid, user_ip, status, created_at")
    .eq("user_id", session.profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const orders = ((data ?? []) as TransactionRow[]).map((o) => ({ ...o, amount_paid: Number(o.amount_paid) }));

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-6 font-display text-2xl font-medium">My Orders</h1>
      <OrdersList orders={orders} />
    </main>
  );
}
