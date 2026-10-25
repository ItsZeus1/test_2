# NovaCharge — setup

1. **Supabase → SQL Editor:** paste and run `supabase/schema.sql` (drops/recreates the app tables, seeds 8 services × 4 packages, installs the new-user trigger).
2. **Supabase → Authentication → Providers → Email:** turn **Confirm email OFF** while building (avoids the built-in email rate limit).
3. **Vercel → Environment Variables** (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (+ optional `NEXT_PUBLIC_WHATSAPP_URL`, `NEXT_PUBLIC_TELEGRAM_URL`). Redeploy after adding them.
4. **Register `majd@elmadani.com` yourself at `/register`, immediately**, choosing your own password. The SQL trigger (and a fallback in the sign-in action) makes that email ADMIN with a $10,000 starting balance. Whoever registers that email first gets admin, so do this before sharing the URL.
5. Replace the placeholder `*.invalid` provider URLs/codes with real ones in Admin → Services. Placeholder endpoints are *simulated* (logged, not called).
