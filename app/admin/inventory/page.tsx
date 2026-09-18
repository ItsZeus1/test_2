import { createClient } from "@/utils/supabase/server";
import { AddCodeForm } from "@/components/admin/add-code-form";
import { InventoryTable } from "@/components/admin/inventory-table";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const supabase = await createClient();

  const { data: products } = await supabase
    .from("products")
    .select("*, games ( title )")
    .order("created_at", { ascending: false });

  const { data: codes } = await supabase
    .from("secret_codes")
    .select("product_id, is_used");

  const stockRows = (products ?? []).map((product: any) => {
    const productCodes = (codes ?? []).filter((c) => c.product_id === product.id);
    return {
      productId: product.id,
      productName: product.name,
      gameTitle: product.games?.title ?? "Unknown game",
      price: product.price,
      unusedCount: productCodes.filter((c) => !c.is_used).length,
      usedCount: productCodes.filter((c) => c.is_used).length,
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Manage Inventory</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload secret codes / PINs and track stock levels per package.
        </p>
      </div>

      <AddCodeForm products={(products as any) ?? []} />

      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Stock levels</h2>
        <InventoryTable rows={stockRows} />
      </div>
    </div>
  );
}
