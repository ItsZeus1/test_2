import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getCurrentUser();
  if (session) redirect("/");

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to top up your games and apps."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="text-mint hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
