"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRef, useEffect } from "react";
import { addSecretCodesAction } from "@/app/admin/inventory/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { ActionResult, Game, Product } from "@/lib/types";

const initialState: ActionResult<{ inserted: number; skipped: number }> | null = null;

interface ProductWithGame extends Product {
  games?: { title: string } | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="purple" disabled={pending}>
      {pending ? "Uploading..." : "Upload codes"}
    </Button>
  );
}

export function AddCodeForm({ products }: { products: ProductWithGame[] }) {
  const [state, formAction] = useFormState(addSecretCodesAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload secret codes</CardTitle>
        <CardDescription>Paste one code or PIN per line.</CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-4">
          {state && !state.success && <Alert variant="destructive">{state.error}</Alert>}
          {state?.success && state.data && (
            <Alert variant="success">
              Added {state.data.inserted} code{state.data.inserted === 1 ? "" : "s"}.
              {state.data.skipped > 0 &&
                ` Skipped ${state.data.skipped} duplicate${state.data.skipped === 1 ? "" : "s"}.`}
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="productId">Product / package</Label>
            <Select id="productId" name="productId" required disabled={products.length === 0}>
              <option value="">
                {products.length === 0 ? "Add a package first" : "Select a package..."}
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.games?.title ? `${product.games.title} — ` : ""}
                  {product.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="codes">Codes (one per line)</Label>
            <Textarea
              id="codes"
              name="codes"
              rows={6}
              placeholder={"ABCD-1234-EFGH\nWXYZ-5678-IJKL\n..."}
              required
              className="font-mono"
            />
          </div>

          <SubmitButton />
        </form>
      </CardContent>
    </Card>
  );
}
