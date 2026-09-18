"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef, useEffect } from "react";
import { addGameAction } from "@/app/admin/games/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ActionResult } from "@/lib/types";

const initialState: ActionResult | null = null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Adding..." : "Add game"}
    </Button>
  );
}

export function AddGameForm() {
  const [state, formAction] = useFormState(addGameAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a new game</CardTitle>
        <CardDescription>
          Leave slug blank to auto-generate it from the title.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          {state && !state.success && <Alert variant="destructive">{state.error}</Alert>}
          {state?.success && <Alert variant="success">Game added successfully.</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="Mobile Legends" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug (optional)</Label>
              <Input id="slug" name="slug" placeholder="mobile-legends" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publisher">Publisher</Label>
              <Input id="publisher" name="publisher" placeholder="Moonton" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Cover image URL</Label>
              <Input id="imageUrl" name="imageUrl" placeholder="https://..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" name="description" placeholder="Short description shown on the game page" />
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
