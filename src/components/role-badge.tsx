import { roleText, useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/store/types";

const STYLES: Record<Role, string> = {
  NORMAL: "border-white/15 bg-white/5 text-white/80",
  VIP: "border-amber-200/50 bg-gradient-to-r from-amber-300/25 to-yellow-100/10 text-amber-100 shadow-[0_0_18px_-8px_rgba(251,191,36,0.9)]",
  ADMIN:
    "border-fuchsia-300/50 bg-gradient-to-r from-fuchsia-500/25 to-violet-500/20 text-fuchsia-100 shadow-[0_0_18px_-6px_rgba(217,70,239,0.85)]",
};

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useI18n();
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold tracking-[0.16em] ${STYLES[role]}`}>
      {roleText(t, role)}
    </span>
  );
}
