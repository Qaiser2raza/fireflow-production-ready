import { PrismaClient } from '@prisma/client';

export type DeviceDetails = {
  fingerprint: string;
  name?: string;
};

/**
 * Trusted devices for tenant staff authentication.
 * Deliberately separate from registered_devices, which is a licensing/pairing
 * session model and must never grant PIN-authentication trust.
 */
export class StaffDeviceService {
  constructor(private readonly prisma: PrismaClient) {}

  static normalize(details: DeviceDetails | undefined): DeviceDetails | null {
    if (!details || typeof details.fingerprint !== 'string') return null;
    const fingerprint = details.fingerprint.trim();
    if (!/^[a-f0-9]{64}$/i.test(fingerprint)) return null;
    const name = typeof details.name === 'string' ? details.name.trim().slice(0, 100) : undefined;
    return { fingerprint, name: name || undefined };
  }

  async isTrusted(staffId: string, restaurantId: string, fingerprint: string): Promise<boolean> {
    return Boolean(await (this.prisma as any).staff_devices.findFirst({
      where: { staff_id: staffId, restaurant_id: restaurantId, device_fingerprint: fingerprint }
    }));
  }

  async trust(staffId: string, restaurantId: string, details: DeviceDetails): Promise<void> {
    const existing = await (this.prisma as any).staff_devices.findFirst({
      where: { staff_id: staffId, restaurant_id: restaurantId, device_fingerprint: details.fingerprint }
    });
    const now = new Date();
    if (existing) {
      await (this.prisma as any).staff_devices.update({
        where: { id: existing.id },
        data: { device_name: details.name, last_used_at: now }
      });
      return;
    }
    await (this.prisma as any).staff_devices.create({
      data: { staff_id: staffId, restaurant_id: restaurantId, device_fingerprint: details.fingerprint, device_name: details.name, last_used_at: now }
    });
  }

  async touch(staffId: string, restaurantId: string, fingerprint: string): Promise<void> {
    await (this.prisma as any).staff_devices.updateMany({
      where: { staff_id: staffId, restaurant_id: restaurantId, device_fingerprint: fingerprint },
      data: { last_used_at: new Date() }
    });
  }

  async list(staffId: string, restaurantId: string) {
    return (this.prisma as any).staff_devices.findMany({
      where: { staff_id: staffId, restaurant_id: restaurantId },
      select: { id: true, device_name: true, last_used_at: true, created_at: true },
      orderBy: { last_used_at: 'desc' }
    });
  }

  async revoke(deviceId: string, staffId: string, restaurantId: string): Promise<boolean> {
    const result = await (this.prisma as any).staff_devices.deleteMany({
      where: { id: deviceId, staff_id: staffId, restaurant_id: restaurantId }
    });
    return result.count === 1;
  }
}
