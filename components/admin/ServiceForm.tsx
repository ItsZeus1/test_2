"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/primitives";
import { serviceFormSchema, type ServiceFormInput } from "@/lib/validation";
import { createServiceAction } from "@/app/admin/services/actions";
import type { Category } from "@/types";

export function ServiceForm({
  categories,
  onClose,
}: {
  categories: Category[];
  onClose: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ServiceFormInput>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      packages: [
        { sizeName: "", normalPrice: 0, vipPrice: 0, apiEndpoint: "", apiSecretCode: "" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "packages" });

  async function onSubmit(data: ServiceFormInput) {
    setSubmitting(true);
    setServerError(null);
    const result = await createServiceAction(data);
    setSubmitting(false);
    if (!result.success) {
      setServerError(result.error);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-panel border border-line rounded-sharp w-full max-w-2xl my-8 p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-lg font-medium">Add new service</h2>
          <button onClick={onClose} className="text-muted hover:text-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        {serverError && (
          <div className="mb-4 text-sm text-red-400 border border-red-500/30 bg-red-500/10 rounded-sharp px-3 py-2">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1.5 block">Category</label>
              <select
                {...register("categoryId")}
                className="w-full bg-panel2 border border-line rounded-sharp px-3 py-2.5 text-sm text-text focus:border-ember outline-none"
              >
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <FieldError message={errors.categoryId?.message} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1.5 block">Service Name</label>
              <Input placeholder="e.g. Valorant" {...register("name")} />
              <FieldError message={errors.name?.message} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1.5 block">Slug</label>
              <Input placeholder="e.g. valorant" {...register("slug")} />
              <FieldError message={errors.slug?.message} />
            </div>
            <div>
              <label className="text-xs text-muted mb-1.5 block">Image URL</label>
              <Input placeholder="https://…" {...register("imageUrl")} />
              <FieldError message={errors.imageUrl?.message} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-muted">Packages (charge sizes)</label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  append({
                    sizeName: "",
                    normalPrice: 0,
                    vipPrice: 0,
                    apiEndpoint: "",
                    apiSecretCode: "",
                  })
                }
              >
                <Plus className="w-3.5 h-3.5" />
                Add size
              </Button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="border border-line rounded-sharp p-4 relative">
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="absolute top-3 right-3 text-muted hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-muted mb-1 block">Size name</label>
                      <Input
                        placeholder="e.g. 100 Gems"
                        {...register(`packages.${index}.sizeName`)}
                      />
                      <FieldError message={errors.packages?.[index]?.sizeName?.message} />
                    </div>
                    <div>
                      <label className="text-xs text-muted mb-1 block">Normal price</label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register(`packages.${index}.normalPrice`)}
                      />
                      <FieldError message={errors.packages?.[index]?.normalPrice?.message} />
                    </div>
                    <div>
                      <label className="text-xs text-muted mb-1 block">VIP price</label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register(`packages.${index}.vipPrice`)}
                      />
                      <FieldError message={errors.packages?.[index]?.vipPrice?.message} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted mb-1 block">External API URL</label>
                      <Input
                        placeholder="https://provider.example.com/api/…"
                        {...register(`packages.${index}.apiEndpoint`)}
                      />
                      <FieldError message={errors.packages?.[index]?.apiEndpoint?.message} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-muted mb-1 block">
                        Secret API code / parameters
                      </label>
                      <Input
                        type="password"
                        placeholder="Stored server-side only, never sent to shoppers"
                        {...register(`packages.${index}.apiSecretCode`)}
                      />
                      <FieldError message={errors.packages?.[index]?.apiSecretCode?.message} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <FieldError message={errors.packages?.message as string | undefined} />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save service"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
