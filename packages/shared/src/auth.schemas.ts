import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password must not exceed 100 characters');

const handleSchema = z
  .string()
  .min(2, 'Handle must be at least 2 characters')
  .max(30, 'Handle must not exceed 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Handle can only contain letters, numbers, underscores and hyphens');

export const SignupSchema = z.object({
  password: passwordSchema,
  displayName: z.string().min(1).max(50),
  handle: handleSchema,
  inviteCode: z.string().min(1, 'Invite code is required'),
});

export const SigninSchema = z.object({
  handle: handleSchema,
  password: z.string().min(1, 'Password is required'),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type SigninInput = z.infer<typeof SigninSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
