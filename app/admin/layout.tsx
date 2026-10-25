import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Package, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { hasServiceRoleKey } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/services", label: "Services", icon: Package },
  { href: "/admin/users", label: "Users & Balances", icon: Users },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Second gate (middleware.ts is the first).
  const session = await getCurrentUser();
  if (!session) redirect("/login");
  if (session.profile.role !== "ADMIN") redirect("/");

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:flex-row">
      <aside className="md:w-52 md:shrink-0">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/10 hover:text-text"
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 space-y-6">
        {!hasServiceRoleKey() && (
          <p role="alert" className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold">
            SUPABASE_SERVICE_ROLE_KEY is not set. Dashboard data will be empty and admin changes can’t be saved
            until you add it in Vercel and redeploy.
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
