import Link from "next/link";
import { Shield, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { formatCurrency } from "@/lib/pricing";
import { signOutAction } from "@/app/(auth)/actions";
import type { Profile } from "@/types";

export function TopNav({ profile }: { profile: Profile | null }) {
  if (!profile) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur px-6 md:px-16 lg:px-24 py-4 flex items-center justify-between">
      <Link href="/" className="font-display text-lg font-medium">
        Nova<span className="text-ember">Charge</span>
      </Link>

      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-1.5 text-sm">
          <Wallet className="w-4 h-4 text-muted" />
          <span className="font-tabular font-medium">{formatCurrency(profile.balance)}</span>
        </div>

        <Badge tone={profile.role === "VIP" ? "vip" : profile.role === "ADMIN" ? "admin" : "default"}>
          {profile.role}
        </Badge>

        <span className="hidden md:inline text-sm text-muted">{profile.name}</span>

        {profile.role === "ADMIN" && (
          <Link href="/admin">
            <Button variant="secondary" size="sm">
              <Shield className="w-3.5 h-3.5" />
              Admin
            </Button>
          </Link>
        )}

        <form action={signOutAction}>
          <Button variant="ghost" size="sm" type="submit">
            Log out
          </Button>
        </form>
      </div>
    </header>
  );
}
