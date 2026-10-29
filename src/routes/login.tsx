import { createFileRoute } from "@tanstack/react-router";

import { AuthPortal } from "@/components/auth-portal";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "register" ? ("register" as const) : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in · NovaCharge" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { tab } = Route.useSearch();
  const { t } = useI18n();
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] place-items-center px-0 py-10">
      <div className="flex w-full flex-col items-center">
        <p className="mb-3 text-center font-display text-3xl font-extrabold tracking-tight">{t.welcomeBack}</p>
        <AuthPortal initialTab={tab === "register" ? "register" : "login"} />
      </div>
    </main>
  );
}
