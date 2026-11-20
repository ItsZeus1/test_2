import { NextResponse } from "next/server";

import { adminClient, vaultNeedsUpgrade } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public: how many pieces are available for a service (counts only, never the contents).
 * v30: also returns `byPackage` (stock per package size). Pieces saved without a package
 * (`shared`) can be sold for any size of that service, so each size shows its own + shared.
 */
export async function GET(request: Request) {
  const serviceId = new URL(request.url).searchParams.get("serviceId") ?? "";
  const supabase = adminClient();
  const headers = { "Cache-Control": "no-store" };
  if (!supabase || !serviceId || serviceId.length > 120) return NextResponse.json({ available: null, byPackage: {}, shared: 0 }, { headers });
  const { data, error } = await supabase.from("vault_items").select("package_id").eq("service_id", serviceId).eq("status", "AVAILABLE").limit(5000);
  if (error) {
    if (!vaultNeedsUpgrade(error)) return NextResponse.json({ available: null, byPackage: {}, shared: 0 }, { headers });
    // Part 8 not installed yet: one count for the whole service, as before.
    const legacy = await supabase.from("vault_items").select("id", { count: "exact", head: true }).eq("service_id", serviceId).eq("status", "AVAILABLE");
    return NextResponse.json({ available: legacy.error ? null : (legacy.count ?? 0), byPackage: {}, shared: legacy.count ?? 0 }, { headers });
  }
  const byPackage: Record<string, number> = {};
  let shared = 0;
  for (const row of (data ?? []) as Array<{ package_id: string | null }>) {
    const id = row.package_id ?? "";
    if (!id) shared += 1;
    else byPackage[id] = (byPackage[id] ?? 0) + 1;
  }
  return NextResponse.json({ available: (data ?? []).length, byPackage, shared }, { headers });
}
