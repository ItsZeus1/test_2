import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this route — this is a defense-in-depth
  // backup in case middleware is ever bypassed or misconfigured.
  if (!user) {
    redirect("/login");
  }

  return <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</div>;
}
