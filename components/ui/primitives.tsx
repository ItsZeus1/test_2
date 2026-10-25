import { InputHTMLAttributes, SelectHTMLAttributes, forwardRef, HTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-xl", className)} {...props} />;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-text outline-none transition-colors placeholder:text-muted/70 focus:border-violet",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-white/10 bg-panel2 px-3 py-2.5 text-sm text-text outline-none focus:border-violet",
        className
      )}
      {...props}
    />
  )
);
Select.displayName = "Select";

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-muted">{children}</label>;
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} aria-hidden />;
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "error" && "border-red-500/30 bg-red-500/10 text-red-300",
        tone === "success" && "border-mint/30 bg-mint/10 text-mint",
        tone === "info" && "border-violet/30 bg-violet/10 text-violet-soft"
      )}
    >
      {children}
    </div>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider",
        role === "NORMAL" && "border border-sky-400/40 bg-sky-400/10 text-sky-300",
        role === "VIP" && "border border-gold/60 bg-gold/15 text-gold shadow-gold",
        role === "ADMIN" &&
          "border border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-300 shadow-[0_0_14px_rgba(217,70,239,0.5)]"
      )}
    >
      {role}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const done = status === "COMPLETED" || status === "APPROVED";
  const bad = status === "FAILED" || status === "REJECTED";
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        done && "border-mint/40 bg-mint/10 text-mint",
        bad && "border-red-500/40 bg-red-500/10 text-red-400",
        !done && !bad && "border-gold/40 bg-gold/10 text-gold"
      )}
    >
      {status}
    </span>
  );
}
