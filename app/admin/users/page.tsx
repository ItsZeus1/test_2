import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { UsersAdmin } from "@/components/admin/UsersAdmin";
import type { BalanceRequestRow, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RequestJoined extends Omit<BalanceRequestRow, "user_name" | "user_username"> {
  profiles: { name: string; username: string } | { name: string; username: string }[] | null;
}

export default async function AdminUsersPage() {
  const session = await getCurrentUser();
  const db = createServiceRoleClient();

  const [{ data: userData }, { data: reqData }] = await Promise.all([
    db.from("profiles").select("*").order("created_at", { ascending: false }),
    db
      .from("balance_requests")
      .select("id, user_id, amount, payment_method, reference_note, status, created_at, profiles(name, username)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const users = ((userData ?? []) as Profile[]).map((u) => ({ ...u, balance: Number(u.balance) }));
  const requests: BalanceRequestRow[] = ((reqData ?? []) as unknown as RequestJoined[]).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return {
      id: r.id,
      user_id: r.user_id,
      amount: Number(r.amount),
      payment_method: r.payment_method,
      reference_note: r.reference_note,
      status: r.status,
      created_at: r.created_at,
      user_name: p?.name,
      user_username: p?.username,
    };
  });

  return <UsersAdmin users={users} requests={requests} currentAdminId={session?.profile.id ?? ""} />;
}
