# NovaCharge — Architecture (Step 1)

Digital Services & Game Top-Up platform. Next.js App Router + Supabase.

## Stack
- Next.js 14 (App Router), React 18
- Tailwind CSS + Framer Motion + Lucide React
- Supabase (Postgres + Auth) via `@supabase/ssr`
- Zod + React Hook Form for validation
- Server Actions for all mutations (balance deduction, fulfillment, admin CRUD)

## Folder structure

```
novacharge/
├── app/
│   ├── page.tsx                      # "/" — onboarding wizard (unauthenticated) or redirect to dashboard
│   ├── layout.tsx                    # Root layout, providers, fonts
│   ├── globals.css
│   ├── (auth)/
│   │   └── actions.ts                # signUp / signIn server actions
│   ├── category/
│   │   └── [name]/
│   │       └── page.tsx              # Grid of services for a category
│   ├── service/
│   │   └── [slug]/
│   │       ├── page.tsx              # Package grid, role-based pricing
│   │       └── actions.ts            # purchaseAction (checkout server action)
│   ├── admin/
│   │   ├── layout.tsx                # Server-side RBAC guard (redirects non-admins)
│   │   ├── page.tsx                  # Metrics + recent purchases feed
│   │   ├── services/
│   │   │   ├── page.tsx              # Service CRUD table
│   │   │   └── actions.ts            # createService / updateService / deleteService
│   │   └── users/
│   │       ├── page.tsx              # User table + balance top-up
│   │       └── actions.ts            # topUpBalance
│   └── api/
│       └── fulfill/route.ts          # (optional) webhook-style endpoint if not using pure server actions
├── components/
│   ├── onboarding/
│   │   ├── OnboardingWizard.tsx      # Framer Motion step controller
│   │   ├── StepWelcome.tsx
│   │   ├── StepCategories.tsx
│   │   └── StepAuth.tsx
│   ├── layout/
│   │   ├── TopNav.tsx                # Balance indicator, role badge, admin link
│   │   └── Footer.tsx
│   ├── checkout/
│   │   └── PurchaseModal.tsx
│   ├── admin/
│   │   ├── MetricsGrid.tsx
│   │   ├── RecentPurchasesFeed.tsx
│   │   ├── ServiceForm.tsx           # Dynamic package builder (add/remove sizes)
│   │   └── UserBalanceTable.tsx
│   └── ui/                           # Buttons, Cards, Inputs (shadcn-style primitives)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # browser client
│   │   ├── server.ts                 # server component / server action client
│   │   └── middleware.ts             # session refresh helper
│   ├── mock-data.ts                  # In-memory mock DB (used until Supabase is wired up)
│   ├── pricing.ts                    # getPriceForRole(pkg, role) helper
│   └── validation.ts                 # Zod schemas (register, login, service, package)
├── types/
│   └── index.ts                      # Shared TS types mirroring the DB schema
├── supabase/
│   └── schema.sql                    # Full relational schema + RLS policies
├── middleware.ts                     # Protects /admin/* at the edge
└── package.json
```

## Data flow for a purchase (security-critical path)
1. Client renders package cards with **only** the price matching `session.user.role`
   (`price_normal` vs `price_vip`). The other price is never sent to the client in
   the first place — the service query selects the correct column server-side.
2. User clicks "Purchase" → `PurchaseModal` collects `targetAccountId`.
3. Modal calls the `purchaseAction` **Server Action** (never a client-side fetch to
   the provider). This function:
   - Re-verifies the user's session + role server-side (never trusts client role).
   - Re-fetches the package's real price server-side (never trusts a client-sent price).
   - Checks `balance >= price`, deducts it in a single DB transaction.
   - Loads `api_endpoint` + `api_secret_code` **only inside the server action**,
     calls the external provider, and writes a `Transactions` row with the result.
   - The secret code and endpoint are never serialized back to the client.
4. Admin dashboard reads `Transactions` joined with `Users`/`Packages` for the feed.

## Auth & RBAC
- Supabase Auth handles email/password. `role` lives in a `profiles` table
  (`id` = `auth.users.id`), not in a JWT claim you'd have to trust blindly —
  every server action re-reads `profiles.role` from the DB.
- The admin account (`majd@elmadani.com`) is **seeded via a script**, not
  hardcoded into app logic — see `supabase/schema.sql` seed block. The password
  is hashed by Supabase Auth itself (bcrypt under the hood); nothing in the
  codebase stores it in plaintext.
- `middleware.ts` blocks `/admin/*` for any session whose `profiles.role !== 'ADMIN'`,
  and `app/admin/layout.tsx` re-checks server-side as defense in depth.

## Mock-data mode
Until Supabase is connected, `lib/mock-data.ts` exports the same shapes as the
SQL schema plus simple in-memory CRUD functions, so every component/page can be
built against a stable interface and swapped to real Supabase calls later
without changing component code.
