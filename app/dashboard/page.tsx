import { createClient } from "@/utils/supabase/server";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingBag, KeyRound } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: OrderStatus }) {
  if (status === "COMPLETED") return <Badge variant="default">Completed</Badge>;
  if (status === "FAILED") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      `
      id,
      status,
      amount,
      created_at,
      product_id,
      products ( name, games ( title ) ),
      secret_codes ( code_string )
    `
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const typedOrders = (orders as unknown as Order[]) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Your dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          View your order history and purchased codes.
        </p>
      </div>

      {typedOrders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="mb-4 h-10 w-10 text-zinc-700" />
            <h3 className="text-lg font-medium text-zinc-300">No orders yet</h3>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              Once you top up a game, your order history and secret codes will show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Game / Package</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {typedOrders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <p className="font-medium text-white">
                    {order.products?.games?.title ?? "Unknown game"}
                  </p>
                  <p className="text-xs text-zinc-500">{order.products?.name}</p>
                </TableCell>
                <TableCell>{formatCurrency(order.amount)}</TableCell>
                <TableCell>
                  <StatusBadge status={order.status} />
                </TableCell>
                <TableCell>
                  {order.secret_codes && order.secret_codes.length > 0 ? (
                    <span className="flex items-center gap-1.5 font-mono text-sm text-emerald-400">
                      <KeyRound className="h-3.5 w-3.5" />
                      {order.secret_codes[0].code_string}
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </TableCell>
                <TableCell className="text-zinc-400">{formatDate(order.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
