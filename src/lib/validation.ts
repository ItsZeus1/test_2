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

/** Syrian mobile: 09 + 8 digits, dashes optional (09XX-XXX-XXX). */
export const SY_MOBILE = /^09\d{2}-?\d{3}-?\d{3}$/;
export const MIN_AGE = 18;

/** Formats raw typing into 09XX-XXX-XXX. */
export function formatSyMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
}

/** Whole years between an ISO date (YYYY-MM-DD) and today; null if invalid. */
export function ageFromBirthDate(value: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth > today) return null;
  let age = today.getFullYear() - year;
  const beforeBirthday = today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60),
    username: usernameSchema,
    email: z.email("Enter a valid email address."),
    password: passwordSchema,
    confirmPassword: z.string(),
    currency: z.enum(["USD", "SYP"], { message: "Choose your account currency." }),
    phone: z.string().trim().regex(SY_MOBILE, "Enter a Syrian mobile number like 0912-345-678"),
    birthDate: z.string().trim().min(1, "Enter your date of birth."),
    acceptTerms: z.literal(true, { message: "Please accept the Terms & Conditions." }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((value) => (ageFromBirthDate(value.birthDate) ?? 0) >= MIN_AGE, {
    message: "You must be at least 18 years old to register",
    path: ["birthDate"],
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
  normalPriceSypCents: z.number().int().min(0).max(10_000_000_000).default(0),
  vipPriceSypCents: z.number().int().min(0).max(10_000_000_000).default(0),
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
  nameAr: z.string().trim().max(80).default(""),
  deliverySpeed: z.enum(["INSTANT", "MANUAL"]).default("INSTANT"),
  targetInputType: z.enum(["PLAYER_ID", "LANDLINE_PHONE"]).default("PLAYER_ID"),
  descriptionAr: z.string().trim().max(500).default(""),
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
  packages: z.array(packageWriteSchema).max(12),
  serviceMode: z.enum(["PACKAGES", "POINT_COUNTER", "VAULT"]).default("PACKAGES"),
  counter: z
    .object({
      pricePer100UsdCents: z.number().int().min(0).max(10_000_000),
      vipPricePer100UsdCents: z.number().int().min(0).max(10_000_000),
      pricePer100SypCents: z.number().int().min(0).max(10_000_000_000),
      vipPricePer100SypCents: z.number().int().min(0).max(10_000_000_000),
      minPoints: z.number().int().min(1).max(10_000_000),
      stepPoints: z.number().int().min(1).max(1_000_000),
    })
    .optional(),
}).superRefine((value, ctx) => {
  if (value.serviceMode !== "POINT_COUNTER" && value.packages.length === 0) {
    ctx.addIssue({ code: "custom", path: ["packages"], message: "Add at least one charge size." });
  }
  if (value.serviceMode === "POINT_COUNTER" && !value.counter) {
    ctx.addIssue({ code: "custom", path: ["counter"], message: "Set the price per 100 points." });
  }
});

export const purchaseSchema = z.object({
  /** PACKAGES / VAULT services */
  packageId: z.string().trim().min(1).max(80).optional(),
  /** POINT_COUNTER services */
  serviceId: z.string().trim().min(1).max(80).optional(),
  points: z.number().int().min(1).max(10_000_000).optional(),
  /** Empty for VAULT (no customer input); checked per mode in purchase(). */
  targetId: z
    .string()
    .trim()
    .max(80)
    .regex(/^[A-Za-z0-9_@.+()#\-\s]*$/, "That ID contains characters we cannot send.")
    .default(""),
});

export const balanceRequestSchema = z
  .object({
    cents: z.number().int().min(100).max(100_000_000_000),
    method: z.enum(["SHAMCASH", "SYRIATEL_CASH", "MTN_CASH"]).default("SHAMCASH"),
    senderName: z.string().trim().max(80).default(""),
    senderPhone: z.string().trim().max(20).default(""),
    transferNumber: z.string().trim().min(3, "Enter the transfer number.").max(60),
  })
  .superRefine((value, ctx) => {
    if (value.method === "SHAMCASH" && value.senderName.length < 2) {
      ctx.addIssue({ code: "custom", path: ["senderName"], message: "Enter the ShamCash sender full name." });
    }
    if (value.method !== "SHAMCASH" && !/^09\d{8}$/.test(value.senderPhone.replace(/[\s-]/g, ""))) {
      ctx.addIssue({ code: "custom", path: ["senderPhone"], message: "Enter the sending number as 09XXXXXXXX." });
    }
  });

export const paymentAddressesSchema = z.object({
  SHAMCASH: z.string().trim().min(4, "ShamCash address is too short.").max(80),
  SYRIATEL_CASH: z.string().trim().min(4, "Syriatel Cash address is too short.").max(80),
  MTN_CASH: z.string().trim().min(4, "MTN Cash address is too short.").max(80),
});

export const vipMarginSchema = z.object({ margin: z.number().int().min(0).max(25) });
export const userIdSchema = z.object({ userId: z.string().trim().min(1).max(120) });
export const avgTopupSchema = z.object({ minutes: z.number().min(1).max(1440) });

export const requestIdSchema = z.object({
  id: z.string().trim().min(1).max(80),
});

export const shamcashSchema = z.object({
  address: z.string().trim().min(4, "ShamCash address is too short.").max(80),
});

export const adminTopUpSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  cents: z.number().int().min(100).max(100_000_000_000),
});

export const sypRateSchema = z.object({
  rate: z.number().min(1, "Enter how many SYP equal 1 USD.").max(10_000_000),
});

export const adminRoleSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  role: z.enum(["NORMAL", "VIP"], { message: "Only NORMAL or VIP can be assigned." }),
});

export const heroBannersSchema = z.object({
  banners: z
    .array(
      z
        .string()
        .trim()
        .max(3_000_000, "Each photo must be under about 2 MB.")
        .refine((value) => value.startsWith("https://") || value.startsWith("data:image/"), "Use an https image URL or upload a photo."),
    )
    .max(12, "Up to 12 offer photos."),
});

export const tickerSchema = z.object({
  text: z.string().trim().min(3, "Ticker text is too short.").max(600),
  textAr: z.string().trim().min(3, "Arabic ticker text is too short.").max(600),
});

export const blockUserSchema = z.object({
  userId: z.string().trim().min(1).max(120),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60),
  phone: z
    .string()
    .trim()
    .max(24)
    .regex(/^[0-9+\-\s()]*$/, "Phone can use digits, spaces, and + only."),
  avatarUrl: z
    .string()
    .max(1_500_000)
    .refine(
      (value) => value.length === 0 || value.startsWith("data:image/") || value.startsWith("https://"),
      "Upload a photo or use an https image.",
    ),
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

export const supportMessageSchema = z.object({
  text: z.string().trim().min(1, "Write a message first.").max(1000, "Messages are limited to 1000 characters."),
  subject: z.string().trim().max(80).optional(),
  ticketId: z.string().trim().max(120).optional(),
});

export const supportReplySchema = z.object({
  ticketId: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1, "Write a reply first.").max(1000),
});

export const supportStatusSchema = z.object({
  ticketId: z.string().trim().min(1).max(120),
  status: z.enum(["OPEN", "ANSWERED", "CLOSED"]),
});

export const ticketIdSchema = z.object({ ticketId: z.string().trim().min(1).max(120) });

export const manualDecisionSchema = z.object({
  orderId: z.string().trim().min(1).max(120),
  action: z.enum(["ACCEPT", "DECLINE"]),
});

export const balanceEditSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  mode: z.enum(["SET", "ADD", "DEDUCT"]),
  cents: z.number().int().min(0).max(200_000_000_000),
  reason: z.string().trim().max(160).default(""),
});

export const adminPasswordSchema = z.object({
  userId: z.string().trim().min(1).max(120),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

export const savedIdSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  playerId: z.string().trim().max(64).nullable(),
});

export const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(160),
});

