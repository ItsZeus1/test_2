"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, Eye, EyeOff, KeyRound, MailCheck } from "lucide-react";

import { ActionLoadingOverlay, HUD_FINISH_MS } from "@/components/action-loading-overlay";
import { SyriaGreenFlagIcon } from "@/components/pay-emblem";
import { useProfileState } from "@/components/profile";
import { useNovaUi } from "@/lib/ui-store";
import { useNavigate } from "@/lib/nav";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import type { Currency } from "@/lib/store/types";
import { completeGoogleSignIn, completeProfile, loginAccount, registerAccount, requestPasswordReset, startGoogleSignIn } from "@/lib/store/api";
import { MIN_AGE, SY_MOBILE, ageFromBirthDate, formatSyMobile, loginSchema, registerSchema, zodError } from "@/lib/validation";

type Tab = "login" | "register";

/** Redirects signed-in users home: they never see the sign-in / sign-up form. */
export function AuthPortal({ initialTab = "login" }: { initialTab?: Tab }) {
  const router = useRouter();
  const { profile, ready } = useProfileState();
  const authLoading = useNovaUi((state) => state.authLoading);
  const authDone = useNovaUi((state) => state.authDone);
  const authSummary = useNovaUi((state) => state.authSummary);
  useEffect(() => {
    if (ready && profile && !authLoading) router.replace("/");
  }, [ready, profile, authLoading, router]);
  if (!ready) return null;
  return (
    <>
      {profile ? null : <AuthPortalForm initialTab={initialTab} />}
      <ActionLoadingOverlay action={authLoading} done={authDone} summary={authSummary} />
    </>
  );
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
  const setAuthLoading = useNovaUi((state) => state.setAuthLoading);
  const setAuthDone = useNovaUi((state) => state.setAuthDone);
  const setAuthSummary = useNovaUi((state) => state.setAuthSummary);
  const { t, language } = useI18n();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [recovery, setRecovery] = useState<"off" | "form" | "sent">("off");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currency, setCurrency] = useState<Currency | "">("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const setTermsOpen = useNovaUi((state) => state.setTermsOpen);
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
    setAuthLoading("login");
    setAuthDone(false);
    setAuthSummary(email.trim());
    let ok = false;
    try {
      const result = await loginAccount(parsed.data);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      ok = true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.signIn);
    } finally {
      setBusy(false);
      setAuthDone(true);
      await new Promise((resolve) => setTimeout(resolve, HUD_FINISH_MS));
      setAuthLoading(null);
      setAuthDone(false);
    }
    if (ok) await navigate({ to: "/" });
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
    if (!acceptTerms) {
      setError(t.termsRequired);
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
      acceptTerms,
    });
    if (!parsed.success) {
      setError(zodError(parsed.error));
      return;
    }
    setBusy(true);
    setAuthLoading("register");
    setAuthDone(false);
    setAuthSummary(`${name.trim()} · ${email.trim()}`);
    let ok = false;
    try {
      const created = await registerAccount(parsed.data);
      if (!created.ok) {
        setError(created.error);
        return;
      }
      ok = true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.createAccount);
    } finally {
      setBusy(false);
      setAuthDone(true);
      await new Promise((resolve) => setTimeout(resolve, HUD_FINISH_MS));
      setAuthLoading(null);
      setAuthDone(false);
    }
    if (ok) await navigate({ to: "/" });
  }

  async function onRecovery(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setRecoveryBusy(true);
    try {
      const result = await requestPasswordReset({ email: recoveryEmail });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRecovery("sent");
    } finally {
      setRecoveryBusy(false);
    }
  }

  if (recovery !== "off") {
    return (
      <div className="glass recovery-card mx-auto w-[95vw] rounded-3xl p-5 sm:max-w-md sm:p-6">
        {recovery === "form" ? (
          <form onSubmit={onRecovery} className="space-y-4">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-500">
              <KeyRound className="size-7" />
            </span>
            <div className="text-center">
              <h2 className="font-display text-xl font-extrabold">{t.recoveryTitle}</h2>
              <p className="mt-1 text-sm text-muted">{t.recoverySub}</p>
            </div>
            <label className="block text-sm text-muted">
              {t.accountEmail}
              <input
                className="field mt-1"
                dir="ltr"
                type="email"
                required
                autoComplete="email"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-rose-500">{error}</p> : null}
            <button type="submit" disabled={recoveryBusy} className="btn-glow keep-white min-h-11 w-full rounded-2xl font-semibold text-white disabled:opacity-60">
              {recoveryBusy ? t.wait : t.sendRecovery}
            </button>
          </form>
        ) : (
          <div className="space-y-3 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-500">
              <MailCheck className="size-7" />
            </span>
            <h2 className="font-display text-lg font-extrabold">{t.recoveryDone}</h2>
            <p className="text-sm text-muted">{t.recoveryDoneSub}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setRecovery("off");
            setError(null);
          }}
          className="mx-auto mt-4 flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
          {t.backToLogin}
        </button>
      </div>
    );
  }

  return (
    <div className="glass recovery-card mx-auto w-[95vw] rounded-3xl p-5 sm:max-w-md sm:p-6">
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

      <GoogleButton />
      <div className="my-4 flex items-center gap-3 text-[11px] font-semibold text-muted" aria-hidden>
        <span className="h-px flex-1 bg-current opacity-20" />
        {language === "ar" ? "أو بالبريد الإلكتروني" : "or with email"}
        <span className="h-px flex-1 bg-current opacity-20" />
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
            <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
              <input
                type="checkbox"
                required
                checked={acceptTerms}
                onChange={(event) => setAcceptTerms(event.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-indigo-500"
              />
              <span className="min-w-0">
                {t.termsAgreeLead}{" "}
                <button type="button" onClick={() => setTermsOpen(true)} className="font-semibold text-indigo-500 underline underline-offset-4">
                  {t.termsTitle}
                </button>
                <span className="text-rose-500" aria-hidden>
                  {" "}
                  *
                </span>
              </span>
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
        {tab === "login" ? (
          <div className="-mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setRecoveryEmail(email);
                setRecovery("form");
                setError(null);
              }}
              className="min-h-9 text-xs font-semibold text-indigo-500 underline-offset-4 hover:underline"
            >
              {t.forgotPassword}
            </button>
          </div>
        ) : null}
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
                    className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-start text-xs font-semibold leading-snug ${currency === id ? "border-[#0284c7] bg-[#0284c7]/10 text-fg" : "border-white/10 bg-white/5"}`}
                  >
                    <input
                      type="radio"
                      name="currency"
                      value={id}
                      required
                      checked={currency === id}
                      onChange={() => setCurrency(id)}
                      className="size-4 shrink-0 accent-[#0284c7]"
                    />
                    {id === "SYP" ? <SyriaGreenFlagIcon /> : <Banknote className="size-4 shrink-0 text-emerald-600" strokeWidth={1.75} aria-hidden />}
                    <span className="min-w-0">{label}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs">{t.currencyHint}</p>
            </fieldset>
          </>
        ) : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <button type="submit" disabled={busy || (tab === "register" && !acceptTerms)} className="btn-glow min-h-11 w-full rounded-2xl font-semibold disabled:opacity-60">
          {busy ? t.wait : tab === "login" ? t.enter : t.create}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-muted">{t.instantNote}</p>
    </div>
  );
}

/* ============================ Google sign-in ============================ */

/** Official multi-colour Google "G". */
export function GoogleG({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton() {
  const { language } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void startGoogleSignIn().then((result) => {
          // On success the browser leaves for Google; only failures come back here.
          if (!result.ok) {
            setBusy(false);
            toast.error(result.error);
          }
        });
      }}
      className="google-btn flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl px-4 text-sm font-bold disabled:opacity-60"
    >
      <GoogleG />
      {language === "ar" ? "المتابعة السريعة عبر Google" : "Continue with Google"}
    </button>
  );
}

/** Runs on /login?oauth=google after Google redirects back. */
export function useGoogleReturn() {
  const setAuthLoading = useNovaUi((state) => state.setAuthLoading);
  const setAuthDone = useNovaUi((state) => state.setAuthDone);
  const setAuthSummary = useNovaUi((state) => state.setAuthSummary);
  useEffect(() => {
    if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("oauth") !== "google") return;
    let cancel = false;
    setAuthSummary("Google");
    setAuthLoading("login");
    void completeGoogleSignIn().then(async (result) => {
      if (cancel) return;
      if (!result.ok) toast.error(result.error);
      setAuthDone(true);
      await new Promise((resolve) => setTimeout(resolve, HUD_FINISH_MS));
      setAuthLoading(null);
      setAuthDone(false);
    });
    return () => {
      cancel = true;
    };
  }, [setAuthDone, setAuthLoading, setAuthSummary]);
}

/** Blocks the store until a Google account adds its Syrian mobile number, confirms 18+ and the terms. */
export function CompleteProfileGate() {
  const { language, t } = useI18n();
  const ar = language === "ar";
  const { profile, setProfile } = useProfileState();
  const setTermsOpen = useNovaUi((state) => state.setTermsOpen);
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "SYP">("USD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile?.needsCompletion || typeof document === "undefined") return null;
  const maxBirth = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - MIN_AGE);
    return d.toISOString().slice(0, 10);
  })();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const age = ageFromBirthDate(birthDate);
    if (age === null || age < MIN_AGE) return setError(t.under18);
    if (!SY_MOBILE.test(phone)) return setError(t.mobileInvalid);
    if (!acceptTerms) return setError(t.termsRequired);
    setBusy(true);
    setError(null);
    const result = await completeProfile({ phone, birthDate, acceptTerms, currency });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setProfile(result.profile);
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" role="presentation">
      <form onSubmit={(event) => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="complete-title" className="hud-card modal-pop my-auto w-full max-w-md space-y-3 rounded-3xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <GoogleG className="size-6" />
          </span>
          <div className="min-w-0">
            <h2 id="complete-title" className="font-display text-lg font-extrabold">
              {ar ? "إكمال بيانات الحساب السريع" : "Complete your profile"}
            </h2>
            <p className="truncate text-xs text-muted" dir="ltr">
              {profile.email}
            </p>
          </div>
        </div>
        <label className="block text-sm text-muted">
          {t.mobileNumber}
          <input className="field mt-1" dir="ltr" type="tel" inputMode="numeric" placeholder="09XX-XXX-XXX" maxLength={12} value={phone} onChange={(event) => setPhone(formatSyMobile(event.target.value))} />
        </label>
        <label className="block text-sm text-muted">
          {t.dob}
          <input className="field mt-1" dir="ltr" type="date" max={maxBirth} min="1900-01-01" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.currencyLabel}>
          {(["USD", "SYP"] as const).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={currency === code}
              onClick={() => setCurrency(code)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold ${currency === code ? "border-indigo-500 bg-indigo-500/10 text-fg" : "border-white/10 bg-white/5 text-muted"}`}
            >
              {code === "SYP" ? <SyriaGreenFlagIcon /> : <Banknote className="size-4" strokeWidth={1.75} />}
              {code === "SYP" ? t.currencySyp : t.currencyUsd}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
          <input type="checkbox" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-indigo-500" />
          <span>
            {t.termsAgreeLead}{" "}
            <button type="button" onClick={() => setTermsOpen(true)} className="font-semibold text-indigo-600 underline underline-offset-4">
              {t.termsTitle}
            </button>
          </span>
        </label>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        <button type="submit" disabled={busy} className="btn-glow keep-white min-h-12 w-full rounded-2xl text-sm font-bold text-white disabled:opacity-60">
          {busy ? t.wait : ar ? "حفظ ومتابعة للمتجر" : "Save and enter the store"}
        </button>
      </form>
    </div>
  );
}

