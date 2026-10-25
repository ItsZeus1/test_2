import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_EMAIL } from "@/lib/constants";

export async function middleware(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      console.warn("[middleware] Supabase env vars missing — skipping session handling.");
      return NextResponse.next({ request });
    }

    let response = NextResponse.next({ request });

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (request.nextUrl.pathname.startsWith("/admin")) {
      if (!user) {
        return NextResponse.redirect(new URL("/login", request.url));
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const role = (profile as { role?: string } | null)?.role;
      const isAdminEmail = (user.email ?? "").toLowerCase() === ADMIN_EMAIL;
      // admin layout re-checks and self-heals the admin profile; this is the first gate.
      if (role !== "ADMIN" && !isAdminEmail) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    return response;
  } catch (error) {
    console.warn("[middleware] unexpected error, continuing without auth gate:", error);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
