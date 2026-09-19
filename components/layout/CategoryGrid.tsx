import Link from "next/link";
import { Gamepad2, LayoutGrid, RefreshCw, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { Category } from "@/types";

const ICONS: Record<string, typeof Gamepad2> = {
  games: Gamepad2,
  apps: LayoutGrid,
  subscriptions: RefreshCw,
  "mobile-charge": Smartphone,
};

export function CategoryGrid({ categories }: { categories: Category[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {categories.map((cat) => {
        const Icon = ICONS[cat.slug] ?? Gamepad2;
        return (
          <Link key={cat.id} href={`/category/${cat.slug}`}>
            <Card className="p-6 hover:border-ember transition-colors h-full">
              <Icon className="w-5 h-5 text-ember mb-4" strokeWidth={2} />
              <div className="font-display text-lg font-medium">{cat.name}</div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
