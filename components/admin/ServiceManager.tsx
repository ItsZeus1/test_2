"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert, Card } from "@/components/ui/primitives";
import { ServiceFormModal } from "@/components/admin/ServiceFormModal";
import { CATEGORIES } from "@/lib/constants";
import { deleteServiceAction, getServiceForEditAction } from "@/app/admin/services/actions";
import type { ServiceFormInput } from "@/lib/validation";

export interface ServiceListItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  is_active: boolean;
  is_featured: boolean;
  package_count: number;
}

export function ServiceManager({ services }: { services: ServiceListItem[] }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ initial: ServiceFormInput | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function edit(id: string) {
    setError(null);
    const res = await getServiceForEditAction(id);
    if (!res.success) setError(res.error);
    else setModal({ initial: res.data });
  }

  async function remove(s: ServiceListItem) {
    if (!window.confirm(`Delete “${s.name}” and all of its packages?`)) return;
    const res = await deleteServiceAction(s.id);
    if (!res.success) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium">Services</h1>
        <Button variant="glow" onClick={() => setModal({ initial: null })}>
          <Plus className="h-4 w-4" /> Add New Service
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Sizes</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-muted">
                    {CATEGORIES.find((c) => c.slug === s.category)?.label ?? s.category}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{s.slug}</td>
                  <td className="px-4 py-3">{s.package_count}</td>
                  <td className="px-4 py-3 text-xs">
                    {s.is_active ? <span className="text-mint">Active</span> : <span className="text-muted">Hidden</span>}
                    {s.is_featured && <span className="ml-2 text-gold">★ Featured</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="secondary" size="sm" onClick={() => edit(s.id)} aria-label={`Edit ${s.name}`}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => remove(s)} aria-label={`Delete ${s.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {modal && <ServiceFormModal initial={modal.initial} onClose={() => setModal(null)} />}
    </div>
  );
}
