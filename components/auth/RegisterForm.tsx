"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Alert, FieldError, Input, Spinner } from "@/components/ui/primitives";
import { registerSchema, type RegisterInput } from "@/lib/validation";
import { signUpAction } from "@/app/(auth)/actions";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterInput) {
    setLoading(true);
    setError(null);
    const res = await signUpAction(values);
    if (!res.success) {
      setError(res.error);
      setLoading(false);
      return;
    }
    if (res.needsEmailConfirmation) {
      setConfirmSent(true);
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (confirmSent) {
    return (
      <Alert tone="success">
        Check your email — we sent a confirmation link. Once confirmed, come back and log in.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {error && <Alert>{error}</Alert>}
      <div>
        <Input placeholder="Full name" autoComplete="name" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div>
        <Input placeholder="Username" autoComplete="username" {...register("username")} />
        <FieldError message={errors.username?.message} />
      </div>
      <div>
        <Input type="email" placeholder="Email" autoComplete="email" {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <Input
          type="password"
          placeholder="Password"
          autoComplete="new-password"
          {...register("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>
      <div>
        <Input
          type="password"
          placeholder="Confirm password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        <FieldError message={errors.confirmPassword?.message} />
      </div>
      <Button type="submit" variant="glow" size="lg" className="w-full" disabled={loading}>
        {loading && <Spinner />} {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
