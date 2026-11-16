import { NextResponse } from "next/server";

import { adminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: how many pieces are available for a service (a count, never the contents). */
export async function GET(request: Request) {
  const serviceId = new URL(request.url).searchParams.get("serviceId") ?? "";
  const supabase = adminClient();
  if (!supabase || !serviceId || serviceId.length > 120) return NextResponse.json({ available: null });
  const { count, error } = await supabase
    .from("vault_items")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId)
    .eq("status", "AVAILABLE");
  return NextResponse.json({ available: error ? null : (count ?? 0) }, { headers: { "Cache-Control": "no-store" } });
}
