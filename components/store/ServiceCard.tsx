"use client";

import Link from "next/link";
import { Heart, Pencil, Trash2, Zap } from "lucide-react";
import { CATEGORIES } from "@/lib/constants";
import { formatMoney, gradientFor, initials } from "@/lib/utils";
import type { StoreService } from "@/lib/types";

export function ServiceCard({
  service,
  isFavorite,
  isAdmin,
  onToggleFavorite,
  onEdit,
  onDelete,
}: {
  service: StoreService;
  isFavorite: boolean;
  isAdmin: boolean;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const categoryLabel = CATEGORIES.find((c) => c.slug === service.category)?.label ?? service.category;

  return (
    <div className="group relative">
      <Link
        href={`/service/${service.slug}`}
        className="block overflow-hidden rounded-xl border border-white/10 bg-panel transition-all duration-200 hover:-translate-y-0.5 hover:border-violet/70 hover:shadow-neon"
      >
        <div className="relative aspect-[4/5] overflow-hidden">
          {service.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={service.image_url} alt={service.name} className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center font-display text-5xl font-bold text-white/85"
              style={{ background: gradientFor(service.name) }}
            >
              {initials(service.name)}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10">
            <span className="inline-flex items-center gap-1 rounded-full bg-mint/90 px-2 py-0.5 text-[10px] font-bold text-ink">
              <Zap className="h-2.5 w-2.5" /> Instant Delivery
            </span>
          </div>
        </div>
        <div className="space-y-1 p-3">
          <h3 className="truncate text-sm font-semibold">{service.name}</h3>
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-muted">
              {categoryLabel}
            </span>
            <span className="font-tabular text-xs text-mint">
              {service.starting_price !== null ? `From ${formatMoney(service.starting_price)}` : "—"}
            </span>
          </div>
        </div>
      </Link>

      <div className="absolute right-2 top-2 flex gap-1">
        <button
          onClick={onToggleFavorite}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFavorite}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 backdrop-blur hover:bg-black/75"
        >
          <Heart className={`h-4 w-4 ${isFavorite ? "fill-fuchsia-500 text-fuchsia-500" : "text-white"}`} />
        </button>
        {isAdmin && (
          <>
            <button
              onClick={onEdit}
              aria-label={`Edit ${service.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-violet"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              aria-label={`Delete ${service.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
