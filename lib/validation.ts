import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must include at least one uppercase letter")
  .regex(/[a-z]/, "Must include at least one lowercase letter")
  .regex(/[0-9]/, "Must include at least one number");

export const registerSchema = z
  .object({
    name: z.string().min(2, "Name is too short"),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores"),
    email: z.string().email("Enter a valid email"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const purchaseSchema = z.object({
  packageId: z.string().min(1),
  targetAccountId: z.string().min(2, "Enter a valid target account ID"),
});

export const packageInputSchema = z.object({
  sizeName: z.string().min(1, "Required"),
  normalPrice: z.coerce.number().nonnegative(),
  vipPrice: z.coerce.number().nonnegative(),
  apiEndpoint: z.string().url("Must be a valid URL"),
  apiSecretCode: z.string().min(1, "Required"),
});

export const serviceFormSchema = z.object({
  categoryId: z.string().min(1, "Required"),
  name: z.string().min(1, "Required"),
  slug: z
    .string()
    .min(1, "Required")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  imageUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  packages: z.array(packageInputSchema).min(1, "Add at least one package"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
export type ServiceFormInput = z.infer<typeof serviceFormSchema>;
