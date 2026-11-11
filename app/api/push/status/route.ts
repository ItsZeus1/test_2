import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Which pieces of the push setup exist on the server (booleans only, never the values). */
export function GET() {
  return NextResponse.json({
    publicKey: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()),
    privateKey: Boolean(process.env.VAPID_PRIVATE_KEY?.trim()),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  });
}
