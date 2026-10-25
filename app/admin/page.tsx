import { Activity, Package, TrendingUp, Users } from "lucide-react";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/primitives";
import { RecentPurchasesFeed, type FeedRow } from "@/components/admin/RecentPurchasesFeed";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface TxnJoined {
  id: string;
  service_name: string;
  size_name: string;
  amount_paid: number;
  user_ip: string | null;
  status: string;
  created_at: string;
  profiles: { name: string; username: string } | { name: string; username: string }[] | null;
}

export default async function AdminOverviewPage() {
  const db = createServiceRoleClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [online, services, profilesRes, revenueRes, feedRes] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).gte("last_seen", fiveMinAgo),
    db.from("services").select("id", { count: "exact", head: true }),
    db.from("profiles").select("role"),
    db.from("transactions").select("amount_paid").eq("status", "COMPLETED"),
    db
      .from("transactions")
      .select("id, service_name, size_name, amount_paid, user_ip, status, created_at, profiles(name, username)")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const roles = ((profilesRes.data ?? []) as { role: string }[]).map((p) => p.role);
  const normalCount = roles.filter((r) => r === "NORMAL").length;
  const vipCount = roles.filter((r) => r === "VIP").length;
  const revenue = ((revenueRes.data ?? []) as { amount_paid: number }[]).reduce(
    (sum, t) => sum + Number(t.amount_paid),
    0
  );

  const feed: FeedRow[] = ((feedRes.data ?? []) as unknown as TxnJoined[]).map((t) => {
    const p = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
    return {
      id: t.id,
      service_name: t.service_name,
      buyer: p ? `${p.name} (@${p.username})` : "Unknown",
      size_name: t.size_name,
      amount_paid: Number(t.amount_paid),
      created_at: t.created_at,
      user_ip: t.user_ip,
      status: t.status,
    };
  });

  const kpis = [
    { icon: Activity, label: "Online sessions (last 5 min)", value: String(online.count ?? 0), accent: "text-mint" },
    { icon: Package, label: "Total services (slugs)", value: String(services.count ?? 0), accent: "text-violet-soft" },
    { icon: TrendingUp, label: "Total revenue", value: formatMoney(revenue), accent: "text-gold" },
    {
      icon: Users,
      label: "Registered users",
      value: String(roles.length),
      sub: `${normalCount} Normal · ${vipCount} VIP`,
      accent: "text-fuchsia-300",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-medium">Admin overview</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ icon: Icon, label, value, accent, sub }) => (
          <Card key={label} className="p-5">
            <Icon className={`mb-3 h-5 w-5 ${accent}`} />
            <div className="font-display text-3xl font-bold font-tabular">{value}</div>
            <div className="mt-1 text-xs text-muted">{label}</div>
            {sub && <div className="mt-1 text-xs text-white/60">{sub}</div>}
          </Card>
        ))}
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-medium">Recent purchases</h2>
        <RecentPurchasesFeed rows={feed} />
      </section>
    </div>
  );
}
