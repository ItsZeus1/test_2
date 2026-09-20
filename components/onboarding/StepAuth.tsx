"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, FieldError } from "@/components/ui/primitives";
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "@/lib/validation";
import { signUpAction, signInAction } from "@/app/(auth)/actions";

export function StepAuth({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const registerForm = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });
  const loginForm = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onRegister(data: RegisterInput) {
    setSubmitting(true);
    setServerError(null);
    const result = await signUpAction(data);
    setSubmitting(false);
    if (!result.success) setServerError(result.error);
  }

  async function onLogin(data: LoginInput) {
    setSubmitting(true);
    setServerError(null);
    const result = await signInAction(data);
    setSubmitting(false);
    if (!result.success) setServerError(result.error);
  }

  return (
    <section className="flex min-h-screen items-center justify-center px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-muted text-sm hover:text-text mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <div className="flex border border-line rounded-sharp mb-8 overflow-hidden">
          {(["register", "login"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setServerError(null);
              }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                mode === m ? "bg-ember text-ink" : "bg-panel text-muted hover:text-text"
              }`}
            >
              {m === "register" ? "Create account" : "Log in"}
            </button>
          ))}
        </div>

        {serverError && (
          <div className="mb-4 text-sm text-red-400 border border-red-500/30 bg-red-500/10 rounded-sharp px-3 py-2">
            {serverError}
          </div>
        )}

        {mode === "register" ? (
          <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
            <div>
              <Input placeholder="Full name" {...registerForm.register("name")} />
              <FieldError message={registerForm.formState.errors.name?.message} />
            </div>
            <div>
              <Input placeholder="Username" {...registerForm.register("username")} />
              <FieldError message={registerForm.formState.errors.username?.message} />
            </div>
            <div>
              <Input type="email" placeholder="Email" {...registerForm.register("email")} />
              <FieldError message={registerForm.formState.errors.email?.message} />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                {...registerForm.register("password")}
              />
              <FieldError message={registerForm.formState.errors.password?.message} />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Confirm password"
                {...registerForm.register("confirmPassword")}
              />
              <FieldError message={registerForm.formState.errors.confirmPassword?.message} />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Creating account…" : "Create account"}
            </Button>
          </form>
        ) : (
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
            <div>
              <Input type="email" placeholder="Email" {...loginForm.register("email")} />
              <FieldError message={loginForm.formState.errors.email?.message} />
            </div>
            <div>
              <Input type="password" placeholder="Password" {...loginForm.register("password")} />
              <FieldError message={loginForm.formState.errors.password?.message} />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? "Logging in…" : "Log in"}
            </Button>
          </form>
        )}
      </motion.div>
    </section>
  );
}
