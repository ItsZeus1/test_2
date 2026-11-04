"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { useProfileState } from "@/components/profile";
import { useNavigate } from "@/lib/nav";

import { useI18n } from "@/lib/i18n";
import type { Currency } from "@/lib/store/types";
import { loginAccount, registerAccount } from "@/lib/store/api";
import { MIN_AGE, SY_MOBILE, ageFromBirthDate, formatSyMobile, loginSchema, registerSchema, zodError } from "@/lib/validation";

type Tab = "login" | "register";

/** Redirects signed-in users home: they never see the sign-in / sign-up form. */
export function AuthPortal({ initialTab = "login" }: { initialTab?: Tab }) {
  const router = useRouter();
  const { profile, ready } = useProfileState();
  useEffect(() => {
    if (ready && profile) router.replace("/");
  }, [ready, profile, router]);
  if (!ready || profile) return null;
  return <AuthPortalForm initialTab={initialTab} />;
}

/** Password input with an eye button; the button sits on the right in LTR and the left in RTL. */
function PasswordField({
  value,
  onChange,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const { isAr, language } = useI18n();
  const [visible, setVisible] = useState(false);
  const label = visible ? (language === "ar" ? "إخفاء كلمة المرور" : "Hide password") : language === "ar" ? "إظهار كلمة المرور" : "Show password";
  return (
    <span className="relative mt-1 block">
      <input
        className="field"
        style={isAr ? { paddingLeft: "3rem" } : { paddingRight: "3rem" }}
        dir="ltr"
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className={`absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-muted hover:bg-white/5 hover:text-fg ${isAr ? "left-1" : "right-1"}`}
      >
        {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </span>
  );
}

function AuthPortalForm({ initialTab = "login" }: { initialTab?: Tab }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currency, setCurrency] = useState<Currency | "">("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  // Latest selectable birth date = today minus 18 years.
  const maxBirth = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - MIN_AGE);
    return d.toISOString().slice(0, 10);
  })();
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
    if (!birthDate) {
      setError(t.dobRequired);
      return;
    }
    const age = ageFromBirthDate(birthDate);
    if (age === null || age < MIN_AGE) {
      setError(t.under18);
      return;
    }
    if (!SY_MOBILE.test(phone)) {
      setError(t.mobileInvalid);
      return;
    }
    const parsed = registerSchema.safeParse({
      name,
      username,
      email,
      password,
      confirmPassword,
      currency: currency || undefined,
      phone,
      birthDate,
    });
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
            <label className="block text-sm text-muted">
              {t.mobileNumber} <span className="text-rose-500" aria-hidden>*</span>
              <input
                className="field mt-1"
                dir="ltr"
                type="tel"
                inputMode="numeric"
                required
                placeholder="09XX-XXX-XXX"
                maxLength={12}
                value={phone}
                onChange={(event) => setPhone(formatSyMobile(event.target.value))}
                autoComplete="tel-national"
                aria-invalid={phone.length > 0 && !SY_MOBILE.test(phone)}
              />
              <span className="mt-1 block text-xs">{t.mobileHint}</span>
            </label>
            <label className="block text-sm text-muted">
              {t.dob} <span className="text-rose-500" aria-hidden>*</span>
              <input
                className="field mt-1"
                dir="ltr"
                type="date"
                required
                max={maxBirth}
                min="1900-01-01"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                autoComplete="bday"
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
          <PasswordField value={password} onChange={setPassword} autoComplete={tab === "login" ? "current-password" : "new-password"} />
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
              <PasswordField value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
            </label>
            <fieldset className="text-sm text-muted">
              <legend className="mb-1">
                {t.currencyLabel} <span className="text-rose-500" aria-hidden>*</span>
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  ["USD", t.currencyUsd],
                  ["SYP", t.currencySyp],
                ] as const).map(([id, label]) => (
                  <label
                    key={id}
                    className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-start text-xs font-semibold leading-snug ${currency === id ? "border-violet bg-violet/10 text-fg" : "border-white/10 bg-white/5"}`}
                  >
                    <input
                      type="radio"
                      name="currency"
                      value={id}
                      required
                      checked={currency === id}
                      onChange={() => setCurrency(id)}
                      className="size-4 shrink-0 accent-violet"
                    />
                    <span className="min-w-0">{label}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs">{t.currencyHint}</p>
            </fieldset>
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
