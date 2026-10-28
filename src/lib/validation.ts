import { z } from "zod";

import { CATEGORIES } from "@/lib/store/types";

const categorySlugs = CATEGORIES.map((category) => category.slug) as [
  "games",
  "apps",
  "subscriptions",
  "mobile",
];

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(20, "Username must be 20 characters or fewer.")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can use letters, numbers, and underscores only.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Z]/, "Password needs an uppercase letter.")
  .regex(/[a-z]/, "Password needs a lowercase letter.")
  .regex(/[0-9]/, "Password needs a number.");

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60),
    username: usernameSchema,
    email: z.email("Enter a valid email address."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const packageWriteSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  sizeName: z.string().trim().min(1, "Size name is required.").max(60),
  normalPriceCents: z.number().int().min(0).max(10_000_000),
  vipPriceCents: z.number().int().min(0).max(10_000_000),
  apiEndpoint: z
    .string()
    .trim()
    .url("API endpoint must be a full URL.")
    .max(300)
    .refine((value) => value.startsWith("https://"), "API endpoint must use https."),
  apiSecretCode: z.string().trim().min(4, "Secret code is too short.").max(120),
});

export const serviceWriteSchema = z.object({
  id: z.string().trim().min(1).max(80).optional(),
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can use lowercase letters, numbers, and hyphens."),
  category: z.enum(categorySlugs),
  description: z.string().trim().min(12).max(500),
  instructions: z.string().trim().min(12).max(500),
  badge: z.string().trim().max(16),
  imageUrl: z
    .string()
    .trim()
    .max(200_000)
    .refine(
      (value) => value.length === 0 || value.startsWith("https://") || value.startsWith("data:image/"),
      "Use an https image URL or upload a file.",
    ),
  packages: z.array(packageWriteSchema).min(1, "Add at least one charge size.").max(12),
});

export const purchaseSchema = z.object({
  packageId: z.string().trim().min(1).max(80),
  targetId: z
    .string()
    .trim()
    .min(3, "Enter the full account or player ID.")
    .max(80)
    .regex(/^[A-Za-z0-9_@.+()#\-\s]+$/, "That ID contains characters we cannot send."),
});

export const balanceRequestSchema = z.object({
  cents: z.number().int().min(100).max(1_000_000),
  referenceNote: z.string().trim().min(2, "Enter the ShamCash sender name or reference.").max(160),
});

export const requestIdSchema = z.object({
  id: z.string().trim().min(1).max(80),
});

export const shamcashSchema = z.object({
  address: z.string().trim().min(4, "ShamCash address is too short.").max(80),
});

export const adminTopUpSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  cents: z.number().int().min(100).max(1_000_000),
});

export const adminRoleSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  role: z.enum(["NORMAL", "VIP", "ADMIN"]),
});

export const slugSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(80),
});

export const usernameCheckSchema = z.object({
  username: usernameSchema,
});

export const syncSchema = z.object({
  username: usernameSchema.optional(),
  grantAdminWallet: z.boolean(),
});

export function zodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
