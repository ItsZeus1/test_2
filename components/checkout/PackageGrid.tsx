"use client";

import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { getPriceForRole, formatCurrency } from "@/lib/pricing";
import { PurchaseModal } from "./PurchaseModal";
import type { PackagePublic, Profile } from "@/types";

export function PackageGrid({
  packages,
  profile,
}: {
  packages: PackagePublic[];
  profile: Profile | null;
}) {
  const [selected, setSelected] = useState<PackagePublic | null>(null);
  const role = profile?.role ?? "NORMAL";

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {packages.map((pkg) => {
          const price = getPriceForRole(pkg, role);
          return (
            <Card key={pkg.id} className="p-5 flex flex-col">
              <div className="font-medium text-sm mb-1">{pkg.size_name}</div>
              <div className="font-tabular font-display text-2xl font-medium mt-2">
                {formatCurrency(price)}
              </div>
              {role !== "NORMAL" && pkg.vip_price < pkg.normal_price && (
                <div className="text-xs text-muted line-through mt-0.5 font-tabular">
                  {formatCurrency(pkg.normal_price)}
                </div>
              )}
              <Button
                className="mt-4"
                size="sm"
                disabled={!profile}
                onClick={() => setSelected(pkg)}
              >
                {profile ? "Purchase" : "Log in to buy"}
              </Button>
            </Card>
          );
        })}
      </div>

      {selected && profile && (
        <PurchaseModal
          pkg={selected}
          price={getPriceForRole(selected, role)}
          balance={profile.balance}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
