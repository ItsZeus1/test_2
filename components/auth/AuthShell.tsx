import Link from "next/link";
import { Zap } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 400px at 15% 10%, rgba(139,92,246,0.22), transparent 60%), radial-gradient(500px 380px at 90% 90%, rgba(52,211,153,0.16), transparent 60%)",
        }}
      />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center gap-2 font-display text-xl font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-mint text-ink">
            <Zap className="h-4 w-4" />
          </span>
          Nova<span className="text-mint">Charge</span>
        </Link>
        <div className="glass rounded-2xl p-6">
          <h1 className="font-display text-2xl font-medium">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
        <p className="mt-5 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}
