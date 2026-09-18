"use client";

import { useTransition } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleGameActiveAction } from "@/app/admin/games/actions";
import type { Game } from "@/lib/types";

export function GamesTable({ games }: { games: Game[] }) {
  const [isPending, startTransition] = useTransition();

  if (games.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">
        No games added yet. Use the form above to add your first one.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Slug</TableHead>
          <TableHead>Publisher</TableHead>
          <TableHead>Status</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {games.map((game) => (
          <TableRow key={game.id}>
            <TableCell className="font-medium text-white">{game.title}</TableCell>
            <TableCell className="text-zinc-500">{game.slug}</TableCell>
            <TableCell>{game.publisher ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={game.is_active ? "default" : "outline"}>
                {game.is_active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() =>
                  startTransition(() => {
                    toggleGameActiveAction(game.id, !game.is_active);
                  })
                }
              >
                {game.is_active ? "Deactivate" : "Activate"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
