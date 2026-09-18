import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface StockRow {
  productId: string;
  productName: string;
  gameTitle: string;
  price: number;
  unusedCount: number;
  usedCount: number;
}

export function InventoryTable({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
        No packages yet — add a game and a package first from the Manage Games page.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Game</TableHead>
          <TableHead>Package</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>In stock</TableHead>
          <TableHead>Used</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.productId}>
            <TableCell className="text-zinc-400">{row.gameTitle}</TableCell>
            <TableCell className="font-medium text-white">{row.productName}</TableCell>
            <TableCell>{formatCurrency(row.price)}</TableCell>
            <TableCell>
              <Badge variant={row.unusedCount > 0 ? "default" : "destructive"}>
                {row.unusedCount} available
              </Badge>
            </TableCell>
            <TableCell className="text-zinc-500">{row.usedCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
