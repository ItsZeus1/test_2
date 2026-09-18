"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Gamepad2, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "Overview", icon: LayoutGrid },
  { href: "/admin/games", label: "Manage Games", icon: Gamepad2 },
  { href: "/admin/inventory", label: "Manage Inventory", icon: KeyRound },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="shrink-0 md:w-56">
      <div className="mb-4 flex items-center gap-2 px-1">
        <span className="h-2 w-2 rounded-full bg-purple-500 shadow-glow-purple" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-purple-400">
          Admin Panel
        </h2>
      </div>
      <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-purple-500/15 text-purple-400 border border-purple-500/30"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-white border border-transparent"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
