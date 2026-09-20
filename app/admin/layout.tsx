import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/layout/TopNav";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Defense in depth — middleware.ts already blocks this route at the
  // edge, but never rely on that alone for a privileged surface.
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile || profile.role !== "ADMIN") redirect("/");

  return (
    <div>
      <TopNav profile={profile} />
      <div className="flex">
        <aside className="w-52 shrink-0 border-r border-line min-h-[calc(100vh-73px)] px-4 py-8">
          <nav className="space-y-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-2 rounded-sharp text-sm text-muted hover:text-text hover:bg-panel2 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1 px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
