"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { useI18n } from "@/lib/i18n";
import { useNavigate } from "@/lib/nav";
import { logoutAccount } from "@/lib/store/api";

/** Sign-out with a confirmation step. Render it only for signed-in users. */
export function SignOutButton({ onDone, className = "" }: { onDone?: () => void; className?: string }) {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await logoutAccount();
      setAsking(false);
      onDone?.();
      await navigate({ to: "/login", search: { tab: undefined } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-rose-400/30 px-4 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 ${className}`}
      >
        <LogOut className="size-4" />
        {t.signOut}
      </button>
      <ConfirmDialog
        open={asking}
        busy={busy}
        tone="danger"
        title={language === "ar" ? "هل أنت متأكد من تسجيل الخروج؟" : "Are you sure you want to sign out?"}
        confirmLabel={t.signOut}
        onCancel={() => setAsking(false)}
        onConfirm={() => void signOut()}
      >
        {language === "ar" ? "يمكنك تسجيل الدخول مجدداً في أي وقت." : "You can sign back in at any time."}
      </ConfirmDialog>
    </>
  );
}
