import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await getCurrentUser();
  if (session) redirect("/");

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start topping up in under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-mint hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
