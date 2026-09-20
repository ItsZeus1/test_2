"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { ServiceForm } from "@/components/admin/ServiceForm";
import { deleteServiceAction } from "./actions";
import { mockServices, mockCategories, mockPackagesPublic } from "@/lib/mock-data";

export default function AdminServicesPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [services, setServices] = useState(mockServices);

  async function handleDelete(id: string) {
    if (!confirm("Delete this service? This cannot be undone.")) return;
    const result = await deleteServiceAction(id);
    if (result.success) {
      setServices((prev) => prev.filter((s) => s.id !== id));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-medium">Services</h1>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="w-4 h-4" />
          Add New Service
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted text-xs">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Packages</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map((svc) => {
              const category = mockCategories.find((c) => c.id === svc.category_id);
              const packageCount = mockPackagesPublic.filter(
                (p) => p.service_id === svc.id
              ).length;
              return (
                <tr key={svc.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{svc.name}</td>
                  <td className="px-4 py-3 text-muted">{category?.name}</td>
                  <td className="px-4 py-3 text-muted font-tabular">{svc.slug}</td>
                  <td className="px-4 py-3">{packageCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="text-muted hover:text-text p-1">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(svc.id)}
                        className="text-muted hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {formOpen && (
        <ServiceForm categories={mockCategories} onClose={() => setFormOpen(false)} />
      )}
    </div>
  );
}
