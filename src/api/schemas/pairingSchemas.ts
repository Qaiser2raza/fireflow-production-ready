import { z } from 'zod';

export const pairingVerifySchema = z.object({
    restaurantId: z.string().uuid(),
    codeId: z.string().uuid(),
    code: z.string().length(6).regex(/^[A-Z0-9]{6}$/, "Code must be 6 uppercase alphanumeric characters"),
    deviceFingerprint: z.string(),
    deviceName: z.string().min(2).max(50),
    userAgent: z.string().optional(),
    platform: z.enum(['ios', 'android', 'linux', 'darwin', 'win32'])
});

export type PairingVerifyInput = z.infer<typeof pairingVerifySchema>;
