/**
 * One-time admin seeding script.
 *
 * Run with: npm run seed:admin
 *
 * Reads credentials from environment variables — never hardcode them
 * in source. Add these to a local `.env` (gitignored), NOT `.env.local`
 * that gets bundled into the client:
 *
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   (server-only secret, never exposed to client)
 *   ADMIN_EMAIL=majd@elmadani.com
 *   ADMIN_PASSWORD=...              (set your own strong password here, locally)
 *   ADMIN_NAME=Majd
 *   ADMIN_USERNAME=majd
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Admin";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in your environment before running this script."
    );
  }
  if (ADMIN_PASSWORD.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Supabase Auth hashes the password (bcrypt) — it is never stored
  // in plaintext anywhere, including this script's memory beyond the call.
  const { data: userData, error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
  });

  if (createError && !createError.message.includes("already registered")) {
    throw createError;
  }

  const userId =
    userData?.user?.id ??
    (await supabase.auth.admin.listUsers()).data.users.find((u) => u.email === ADMIN_EMAIL)?.id;

  if (!userId) throw new Error("Could not resolve admin user id.");

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    name: ADMIN_NAME,
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    role: "ADMIN",
    balance: 0,
  });

  if (profileError) throw profileError;

  console.log(`Admin account ready for ${ADMIN_EMAIL}. Rotate the password after first login.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
