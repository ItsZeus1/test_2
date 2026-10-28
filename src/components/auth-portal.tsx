import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useI18n } from "@/lib/i18n";
import { loginAccount, registerAccount } from "@/lib/store/api";
import { loginSchema, registerSchema, zodError } from "@/lib/validation";

type Tab = "login" | "register";

export function AuthPortal({ initialTab = "login" }: { initialTab?: Tab }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = [
    { ok: password.length >= 8, label: t.ruleLen },
    { ok: /[A-Z]/.test(password), label: t.ruleUpper },
    { ok: /[a-z]/.test(password), label: t.ruleLower },
    { ok: /[0-9]/.test(password), label: t.ruleNum },
  ];

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(zodError(parsed.error));
      return;
    }
    setBusy(true);
    try {
      const result = await loginAccount(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await navigate({ to: "/", search: { browse: undefined } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.signIn);
    } finally {
      setBusy(false);
    }
  }

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse({ name, username, email, password, confirmPassword });
    if (!parsed.success) {
      setError(zodError(parsed.error));
      return;
    }
    setBusy(true);
    try {
      const created = await registerAccount(parsed.data);
      if (!created.ok) {
        setError(created.error);
        return;
      }
      await navigate({ to: "/", search: { browse: undefined } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.createAccount);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass mx-auto w-[95vw] rounded-3xl p-5 sm:max-w-md sm:p-6">
      <div className="mb-5 grid grid-cols-2 rounded-full bg-black/30 p-1">
        {(["login", "register"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setTab(item);
              setError(null);
            }}
            className={`min-h-11 rounded-full text-sm font-semibold ${tab === item ? "btn-glow" : "text-muted"}`}
          >
            {item === "login" ? t.login : t.createAccount}
          </button>
        ))}
      </div>

      <form className="space-y-3" onSubmit={tab === "login" ? onLogin : onRegister}>
        {tab === "register" ? (
          <>
            <label className="block text-sm text-muted">
              {t.name}
              <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </label>
            <label className="block text-sm text-muted">
              {t.username}
              <input
                className="field mt-1"
                dir="ltr"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
              />
            </label>
          </>
        ) : null}
        <label className="block text-sm text-muted">
          {t.email}
          <input
            className="field mt-1"
            dir="ltr"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="block text-sm text-muted">
          {t.password}
          <input
            className="field mt-1"
            dir="ltr"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={tab === "login" ? "current-password" : "new-password"}
          />
        </label>
        {tab === "register" ? (
          <>
            <ul className="flex flex-wrap gap-2">
              {rules.map((rule) => (
                <li
                  key={rule.label}
                  className={`rounded-full px-2 py-1 text-xs ${rule.ok ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-muted"}`}
                >
                  {rule.label}
                </li>
              ))}
            </ul>
            <label className="block text-sm text-muted">
              {t.confirmPassword}
              <input
                className="field mt-1"
                dir="ltr"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          </>
        ) : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <button type="submit" disabled={busy} className="btn-glow min-h-11 w-full rounded-2xl font-semibold disabled:opacity-60">
          {busy ? t.wait : tab === "login" ? t.enter : t.create}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-muted">{t.instantNote}</p>
    </div>
  );
}
