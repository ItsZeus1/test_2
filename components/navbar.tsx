"use client";

import Link from "next/link";
import { useState } from "react";
import { Gamepad2, LayoutDashboard, LogOut, Menu, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";

interface NavbarProps {
  user: { email: string } | null;
  role: "USER" | "ADMIN" | null;
}

export function Navbar({ user, role }: NavbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-purple-500 shadow-glow-emerald">
            <Gamepad2 className="h-5 w-5 text-zinc-950" />
          </span>
          <span className="text-lg tracking-tight">
            Nova<span className="text-emerald-400">TopUp</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              {role === "ADMIN" && (
                <Link href="/admin">
                  <Button variant="outline" size="sm" className="gap-2 border-purple-500/40 text-purple-400 hover:bg-purple-500/10">
                    <Shield className="h-4 w-4" />
                    Admin
                  </Button>
                </Link>
              )}
              <form action={logoutAction}>
                <Button variant="ghost" size="sm" className="gap-2 text-zinc-400 hover:text-red-400">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Create account</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="text-zinc-300 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-zinc-900 bg-zinc-950 px-4 pb-4 pt-2 md:hidden">
          <div className="flex flex-col gap-2">
            {user ? (
              <>
                <Link href="/dashboard" onClick={() => setOpen(false)}>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </Button>
                </Link>
                {role === "ADMIN" && (
                  <Link href="/admin" onClick={() => setOpen(false)}>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 border-purple-500/40 text-purple-400">
                      <Shield className="h-4 w-4" />
                      Admin
                    </Button>
                  </Link>
                )}
                <form action={logoutAction}>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-zinc-400">
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setOpen(false)}>
                  <Button variant="ghost" size="sm" className="w-full justify-start">
                    Sign in
                  </Button>
                </Link>
                <Link href="/register" onClick={() => setOpen(false)}>
                  <Button size="sm" className="w-full justify-start">
                    Create account
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
