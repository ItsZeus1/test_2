import { z } from "zod";
import { CATEGORY_SLUGS, PAYMENT_METHODS } from "./constants";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/[0-9]/, "Include at least one number");

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name"),
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(24, "Username is too long")
      .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only"),
    email: z.string().trim().email("Enter a valid email"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const purchaseSchema = z.object({
  packageId: z.string().min(1),
  targetAccountId: z.string().trim().min(2, "Enter a valid Player / Account ID").max(120),
  zoneId: z.string().trim().max(60).optional(),
});

export const walletRequestSchema = z.object({
  amount: z.number().min(1, "Minimum request is $1").max(100000, "Amount too large"),
  paymentMethod: z.enum(PAYMENT_METHODS),
  referenceNote: z.string().trim().max(300).optional(),
});

const packageSchema = z.object({
  pkgId: z.string().optional(),
  sizeName: z.string().trim().min(1, "Required"),
  normalPrice: z.number({ invalid_type_error: "Enter a price" }).min(0, "Must be 0 or more"),
  vipPrice: z.number({ invalid_type_error: "Enter a price" }).min(0, "Must be 0 or more"),
  apiEndpoint: z.string().trim().url("Must be a valid URL"),
  apiSecretCode: z.string().trim().min(1, "Required"),
});

export const serviceFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Required"),
  slug: z
    .string()
    .trim()
    .min(1, "Required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  category: z.enum(CATEGORY_SLUGS),
  imageUrl: z.union([z.literal(""), z.string().trim().url("Must be a valid URL")]),
  description: z.string().max(1000),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  packages: z.array(packageSchema).min(1, "Add at least one charge size"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type WalletRequestInput = z.infer<typeof walletRequestSchema>;
export type ServiceFormInput = z.infer<typeof serviceFormSchema>;
