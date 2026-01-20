import { z } from 'zod';

export const loginSchema = z.object({
    pin: z.string().min(4).max(6).regex(/^\d+$/, "PIN must be numeric")
});

export const refreshSchema = z.object({
    refresh_token: z.string().min(1, "refresh_token is required")
});
