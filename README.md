# NovaCharge (Next.js)

Game / app / subscription / mobile top-up storefront. Next.js 15 (App Router) + React 19 + Tailwind v4 + Supabase.

## Run
```bash
npm install
cp .env.example .env.local     # add your Supabase URL + anon key
npm run dev                    # http://localhost:3000
npm run build && npm start     # production
```

## Supabase
Run `migrations/novacharge.sql (part 1)` once in the Supabase SQL editor. It creates `novacharge_state`,
`services`, `service_packages`, `store_settings`, the anon policies and the Storage fallback bucket.
Without it (or without the env vars) changes are saved in the admin's browser only, and the admin sees a warning.

## Notes
- All pages are client components: the store (`src/lib/store/api.ts`) talks to Supabase from the browser.
- Anon policies in the migration let anyone with the anon key write. Put admin writes behind a Route Handler or
  Edge Function with the service-role key before going live.
- `src/lib/nav.tsx` is a small adapter that keeps the `to / params / search` link style on top of `next/link`.
