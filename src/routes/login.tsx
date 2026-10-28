import { createFileRoute } from "@tanstack/react-router";

import { AuthPortal } from "@/components/auth-portal";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "register" ? ("register" as const) : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in · NovaCharge" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { tab } = Route.useSearch();
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-lg place-items-center px-4 py-10">
      <div className="w-full">
        <p className="mb-3 text-center font-display text-3xl font-extrabold tracking-tight">Welcome back</p>
        <AuthPortal initialTab={tab === "register" ? "register" : "login"} />
      </div>
    </main>
  );
}
