import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** Loopback / private / link-local addresses are proxies, never the visitor. */
const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|fc|fd|fe80)/i;

function first(value: string | null): string | null {
  const ip = value?.split(",")[0]?.trim() ?? "";
  return ip && !PRIVATE.test(ip) ? ip.slice(0, 64) : null;
}

/**
 * v33 — the visitor's real IP, country and city, from the headers Vercel's edge sets on every
 * request (x-vercel-forwarded-for is the client as Vercel saw it, never one of its own servers).
 * Note: a visitor on a VPN shows the VPN's address and country — that's what reached us.
 */
export function GET(request: Request) {
  const headers = request.headers;
  const ip = first(headers.get("x-vercel-forwarded-for")) ?? first(headers.get("x-forwarded-for")) ?? first(headers.get("x-real-ip"));
  const country = headers.get("x-vercel-ip-country");
  const rawCity = headers.get("x-vercel-ip-city");
  let city: string | null = null;
  if (rawCity) {
    try {
      city = decodeURIComponent(rawCity).slice(0, 80);
    } catch {
      city = rawCity.slice(0, 80);
    }
  }
  return NextResponse.json(
    { ip, country: country ? country.slice(0, 2).toUpperCase() : null, city },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
