// lib/validations/auth.ts
import { z } from "zod";

export const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(20, "Username must be at most 20 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed"),
    email: z.string().email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Include at least one uppercase letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

// --- Top-up flow ---

export const accountInfoSchema = z.record(z.string(), z.string().min(1, "Required"));

export const checkoutSchema = z.object({
  gameId: z.string().cuid(),
  productId: z.string().cuid(),
  paymentMethod: z.enum(["CREDIT_CARD", "PAYPAL", "CRYPTO", "E_WALLET"]),
  accountInfo: accountInfoSchema,
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
