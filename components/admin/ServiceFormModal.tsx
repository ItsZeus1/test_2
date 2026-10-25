"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert, FieldError, Input, Label, Select, Spinner } from "@/components/ui/primitives";
import { CATEGORIES } from "@/lib/constants";
import { slugify } from "@/lib/utils";
import { serviceFormSchema, type ServiceFormInput } from "@/lib/validation";
import { saveServiceAction } from "@/app/admin/services/actions";

const EMPTY_PACKAGE = {
  sizeName: "",
  normalPrice: 0,
  vipPrice: 0,
  apiEndpoint: "",
  apiSecretCode: "",
};

const EMPTY: ServiceFormInput = {
  name: "",
  slug: "",
  category: "games",
  imageUrl: "",
  description: "",
  isActive: true,
  isFeatured: false,
  packages: [EMPTY_PACKAGE],
};

export function ServiceFormModal({
  initial,
  onClose,
}: {
  initial: ServiceFormInput | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(initial?.id);
  const [slugTouched, setSlugTouched] = useState(editing);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ServiceFormInput>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: initial ?? EMPTY,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "packages" });

  useEffect(() => {
    reset(initial ?? EMPTY);
    setSlugTouched(Boolean(initial?.id));
  }, [initial, reset]);

  const name = watch("name");
  useEffect(() => {
    if (!slugTouched) setValue("slug", slugify(name ?? ""));
  }, [name, slugTouched, setValue]);

  async function onSubmit(values: ServiceFormInput) {
    setSaving(true);
    setError(null);
    const res = await saveServiceAction(values);
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal title={editing ? "Edit service" : "Add new service"} onClose={onClose} wide>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Service name</Label>
            <Input placeholder="e.g. PUBG Mobile" {...register("name")} />
            <FieldError message={errors.name?.message} />
          </div>
          <div>
            <Label>Slug (auto)</Label>
            <Input
              placeholder="pubg-mobile"
              {...register("slug", { onChange: () => setSlugTouched(true) })}
            />
            <FieldError message={errors.slug?.message} />
          </div>
          <div>
            <Label>Category</Label>
            <Select {...register("category")}>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Image URL</Label>
            <Input placeholder="https://…" {...register("imageUrl")} />
            <FieldError message={errors.imageUrl?.message} />
          </div>
          <div className="col-span-2">
            <Label>Description</Label>
            <Input placeholder="Short description shown on the top-up page" {...register("description")} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-violet" {...register("isActive")} /> Active
            (visible in store)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-violet" {...register("isFeatured")} /> Featured
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Charge sizes (packages)</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => append(EMPTY_PACKAGE)}>
              <Plus className="h-3.5 w-3.5" /> Add size
            </Button>
          </div>
          <div className="space-y-3">
            {fields.map((field, i) => (
              <div key={field.id} className="relative rounded-xl border border-white/10 p-3">
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label="Remove size"
                    className="absolute right-3 top-3 text-muted hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 pr-6">
                    <Label>Size name</Label>
                    <Input placeholder="e.g. 100 Gems" {...register(`packages.${i}.sizeName`)} />
                    <FieldError message={errors.packages?.[i]?.sizeName?.message} />
                  </div>
                  <div>
                    <Label>Normal price ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register(`packages.${i}.normalPrice`, { valueAsNumber: true })}
                    />
                    <FieldError message={errors.packages?.[i]?.normalPrice?.message} />
                  </div>
                  <div>
                    <Label>VIP price ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...register(`packages.${i}.vipPrice`, { valueAsNumber: true })}
                    />
                    <FieldError message={errors.packages?.[i]?.vipPrice?.message} />
                  </div>
                  <div className="col-span-2">
                    <Label>External API URL</Label>
                    <Input
                      placeholder="https://provider.com/api/topup"
                      {...register(`packages.${i}.apiEndpoint`)}
                    />
                    <FieldError message={errors.packages?.[i]?.apiEndpoint?.message} />
                  </div>
                  <div className="col-span-2">
                    <Label>Secret charge code / API parameter</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      placeholder="Stored server-side only"
                      {...register(`packages.${i}.apiSecretCode`)}
                    />
                    <FieldError message={errors.packages?.[i]?.apiSecretCode?.message} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <FieldError message={errors.packages?.message as string | undefined} />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="glow" disabled={saving}>
            {saving && <Spinner />} {saving ? "Saving…" : editing ? "Save changes" : "Create service"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
