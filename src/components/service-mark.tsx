import { useId } from "react";

import { isCategory, type Category } from "@/lib/store/types";

const PALETTE: Record<Category, [string, string, string]> = {
  games: ["#7c3aed", "#e879f9", "#22d3ee"],
  apps: ["#e11d48", "#fb7185", "#fbbf24"],
  subscriptions: ["#4f46e5", "#22d3ee", "#c4b5fd"],
  mobile: ["#059669", "#34d399", "#67e8f9"],
};

const SIZE = {
  sm: "size-11",
  md: "size-16",
  lg: "size-24",
} as const;

function Glyph({ category }: { category: Category }) {
  if (category === "games") {
    return (
      <path
        d="M18 34h6.5l3.2-7 6.6 14 3.2-7H46"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  if (category === "apps") {
    return <path d="M28 22v20l16-10-16-10z" fill="white" />;
  }
  if (category === "subscriptions") {
    return (
      <g fill="none" stroke="white" strokeWidth="2.4" strokeLinejoin="round">
        <rect x="20" y="26" width="24" height="16" rx="3" />
        <path d="M24 26v-3a8 8 0 0 1 16 0v3" />
      </g>
    );
  }
  return (
    <g fill="none" stroke="white" strokeWidth="2.4">
      <rect x="26" y="18" width="12" height="26" rx="3" />
      <path d="M30 39h4" strokeLinecap="round" />
    </g>
  );
}

export function ServiceMark({
  slug,
  category,
  name,
  size = "md",
}: {
  slug: string;
  category: string;
  name?: string;
  size?: keyof typeof SIZE;
}) {
  const rawId = useId().replace(/:/g, "");
  const lane: Category = isCategory(category) ? category : "games";
  const [from, via, to] = PALETTE[lane];
  const letter = (name || slug || "N").trim().charAt(0).toUpperCase();

  return (
    <span
      className={`relative grid ${SIZE[size]} shrink-0 place-items-center rounded-[28%] shadow-[0_0_22px_-6px_rgba(139,92,246,0.85)]`}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="size-full">
        <defs>
          <radialGradient id={`${rawId}-g`} cx="28%" cy="18%" r="85%">
            <stop offset="0%" stopColor={to} />
            <stop offset="42%" stopColor={from} />
            <stop offset="100%" stopColor={via} />
          </radialGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${rawId}-g)`} />
        <circle cx="48" cy="14" r="7" fill="white" opacity="0.22" />
        <Glyph category={lane} />
        <text
          x="32"
          y="50"
          textAnchor="middle"
          fill="white"
          fontSize="13"
          fontWeight="800"
          fontFamily="Syne, Outfit, sans-serif"
        >
          {letter}
        </text>
      </svg>
    </span>
  );
}
