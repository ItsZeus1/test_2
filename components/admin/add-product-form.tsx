"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef, useEffect } from "react";
import { addProductAction } from "@/app/admin/games/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ActionResult } from "@/lib/types";
import type { Game } from "@/lib/types";

const initialState: ActionResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="purple" disabled={pending}>
      {pending ? "Adding..." : "Add package"}
    </Button>
  );
}

export function AddProductForm({ games }: { games: Game[] }) {
  const [state, formAction] = useFormState(addProductAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a top-up package</CardTitle>
        <CardDescription>
          A purchasable package (e.g. &quot;500 Diamonds&quot;) tied to a game.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          {state && !state.success && <Alert variant="destructive">{state.error}</Alert>}
          {state?.success && <Alert variant="success">Package added successfully.</Alert>}

          <div className="space-y-2">
            <Label htmlFor="gameId">Game</Label>
            <Select id="gameId" name="gameId" required disabled={games.length === 0}>
              <option value="">
                {games.length === 0 ? "Add a game first" : "Select a game..."}
              </option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.title}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Package name</Label>
              <Input id="name" name="name" placeholder="500 Diamonds" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price (USD)</Label>
              <Input id="price" name="price" type="number" step="0.01" min="0" placeholder="9.99" required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input id="description" name="description" placeholder="Best value pack" />
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
