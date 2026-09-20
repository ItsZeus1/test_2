import { clsx } from "clsx";
import { InputHTMLAttributes, forwardRef, HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "bg-panel border border-line rounded-sharp",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "vip" | "admin" | "success" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-sharp text-xs font-medium tracking-wide",
        {
          "bg-panel2 text-muted border border-line": tone === "default",
          "bg-violet/15 text-violet border border-violet/30": tone === "vip",
          "bg-ember/15 text-ember border border-ember/30": tone === "admin",
          "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30":
            tone === "success",
        },
        className
      )}
      {...props}
    />
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        "w-full bg-panel2 border border-line rounded-sharp px-3 py-2.5 text-sm text-text placeholder:text-muted/70 focus:border-ember outline-none transition-colors",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}
