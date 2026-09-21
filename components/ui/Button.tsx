import { ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-sharp font-medium transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
          {
            "bg-ember text-ink hover:bg-white": variant === "primary",
            "bg-panel2 text-text border border-line hover:border-ember":
              variant === "secondary",
            "bg-transparent text-muted hover:text-text": variant === "ghost",
            "bg-transparent border border-red-500/50 text-red-400 hover:bg-red-500/10":
              variant === "danger",
          },
          {
            "text-sm px-3 py-1.5": size === "sm",
            "text-sm px-4 py-2.5": size === "md",
            "text-base px-6 py-3": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
