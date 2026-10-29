const BEARER_KEY = "grok-auth.bearer-token";

/** Keep the email/password session token where preview requests can send it. */
export function rememberSessionToken(token: string | null | undefined): void {
  if (!token || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BEARER_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

export function markFreshLogin(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem("nc-fresh-login", "1");
  } catch {
    /* storage unavailable */
  }
}

export function consumeFreshLogin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const fresh = window.sessionStorage.getItem("nc-fresh-login") === "1";
    if (fresh) window.sessionStorage.removeItem("nc-fresh-login");
    return fresh;
  } catch {
    return false;
  }
}
