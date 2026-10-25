import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "glow" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-violet text-white hover:bg-violet-soft",
        variant === "glow" &&
          "bg-gradient-to-r from-violet to-mint text-ink font-semibold hover:brightness-110 shadow-neon",
        variant === "secondary" && "border border-white/15 bg-white/5 text-text hover:border-violet",
        variant === "ghost" && "bg-transparent text-muted hover:text-text",
        variant === "danger" &&
          "border border-red-500/40 bg-transparent text-red-400 hover:bg-red-500/10",
        size === "sm" && "px-3 py-1.5 text-sm",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-6 py-3 text-base",
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
