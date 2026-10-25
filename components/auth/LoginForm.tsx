"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Alert, FieldError, Input, Spinner } from "@/components/ui/primitives";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { signInAction } from "@/app/(auth)/actions";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setLoading(true);
    setError(null);
    const res = await signInAction(values);
    if (!res.success) {
      setError(res.error);
      setLoading(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      <div>
        <Input type="email" placeholder="Email" autoComplete="email" {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div>
        <Input
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          {...register("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>
      <Button type="submit" variant="glow" size="lg" className="w-full" disabled={loading}>
        {loading && <Spinner />} {loading ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
