import { createClient } from "@/utils/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Gamepad2, KeyRound, ShoppingBag, Users } from "lucide-react";

export const dynamic = "force-dynamic";

async function getCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  match?: Record<string, unknown>
) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (match) query = query.match(match);
  const { count } = await query;
  return count ?? 0;
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const [gamesCount, unusedCodesCount, ordersCount, usersCount] = await Promise.all([
    getCount(supabase, "games"),
    getCount(supabase, "secret_codes", { is_used: false }),
    getCount(supabase, "orders", { status: "COMPLETED" }),
    getCount(supabase, "profiles"),
  ]);

  const stats = [
    { label: "Games", value: gamesCount, icon: Gamepad2, color: "text-emerald-400" },
    { label: "Codes in stock", value: unusedCodesCount, icon: KeyRound, color: "text-purple-400" },
    { label: "Completed orders", value: ordersCount, icon: ShoppingBag, color: "text-emerald-400" },
    { label: "Registered users", value: usersCount, icon: Users, color: "text-purple-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="mt-1 text-sm text-zinc-500">A quick look at the store.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <Icon className={`h-5 w-5 ${color}`} />
              <p className="mt-3 text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-zinc-500">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
