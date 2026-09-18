# NovaTopUp — Game Top-Up & Digital Code Store

A full-stack Next.js 14 (App Router) app for selling game top-ups and digital
codes, built with native Supabase (`@supabase/supabase-js` + `@supabase/ssr`)
— **no Prisma, Drizzle, or NextAuth**.

## Stack

- Next.js 14 App Router + Server Actions, TypeScript
- Tailwind CSS + hand-rolled shadcn-style UI primitives
- Supabase: Postgres, Auth, RLS, and a `claim_secret_code` RPC for
  race-condition-safe code redemption
- Dark theme, emerald/purple neon accents

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), create a new project.
2. Open **SQL Editor** and run the entire contents of `supabase/schema.sql`
   top to bottom. This creates all tables, RLS policies, the auth trigger,
   and the atomic code-claiming function.
3. (Optional) Uncomment the seed data at the bottom of `schema.sql` to get
   one sample game/package so the homepage isn't empty on first run.

## 2. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in the values from your
Supabase project's **Settings → API** page:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # server-only, keep secret
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 3. Install & run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## 4. Create your first admin user

By default every new signup gets `role = 'USER'` (via the `handle_new_user`
trigger). To promote yourself to admin:

1. Register a normal account through the app's `/register` page.
2. In Supabase, go to **Table Editor → profiles**, find your row, and change
   `role` from `USER` to `ADMIN`.
3. Sign out and back in — `/admin` is now accessible.

## 5. Using the admin dashboard

- **Manage Games** (`/admin/games`) — add a game, then add one or more
  top-up packages (products) for it.
- **Manage Inventory** (`/admin/inventory`) — paste secret codes/PINs (one
  per line) against a package. Stock counts update live.
- Every admin Server Action re-verifies `role === 'ADMIN'` server-side —
  the middleware check is UX-only, not the security boundary.

## 6. How a purchase works

1. User picks a package on `/game/[slug]` and clicks **Confirm & pay**
   (this is a mock checkout — no real payment gateway is wired in).
2. The `purchaseProductAction` Server Action creates a `PENDING` order,
   then calls the `claim_secret_code` Postgres function via RPC.
3. That function uses `SELECT ... FOR UPDATE SKIP LOCKED` to atomically
   grab one unused code and mark it `is_used = true` — safe even if two
   users buy the last code at the same instant.
4. The order flips to `COMPLETED` and the code is shown to the user, and
   saved permanently in their `/dashboard` order history.
5. If no codes are left, the order flips to `FAILED` and the user sees an
   "out of stock" message — no charge is made in this mock flow.

## Notes on security

- RLS is enabled on every table. Regular users can never `SELECT` the raw
  `secret_codes` table — they can only see codes joined through an order
  they own.
- The service-role client (`createAdminClient` in `utils/supabase/server.ts`)
  is defined but not required for normal operation, since RLS policies
  already let verified admins write via the regular client. Keep it for
  edge cases where you deliberately need to bypass RLS server-side.
- All dynamic routes export `export const dynamic = 'force-dynamic'` and
  none use `generateStaticParams`, so builds won't try to pre-render pages
  that depend on live Supabase data.
