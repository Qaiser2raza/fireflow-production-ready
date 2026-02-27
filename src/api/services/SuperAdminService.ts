import { prisma } from '../../shared/lib/prisma';
import { logger, LogLevel } from '../../shared/lib/logger';

export class SuperAdminService {
    /**
     * Create a license key in the local database
     * (In a real SaaS, this might also sync to cloud)
     */
    async generateLicenseKey(data: {
        restaurantId?: string;
        licenseType?: string;
        deviceLimit?: number;
        expiryMonths?: number;
    }) {
        const { restaurantId, licenseType = 'STANDARD', deviceLimit = 1, expiryMonths = 12 } = data;

        // 1. Generate via Cloud Client (it will use the SERVICE role on the server)
        const { generateLicenseKey: cloudGenerateKey } = await import('../../shared/lib/cloudClient');
        const cloudResult = await cloudGenerateKey(licenseType as any);

        if (cloudResult.error || !cloudResult.data) {
            throw new Error(`Cloud License Generation Failed: ${cloudResult.error}`);
        }

        const key = cloudResult.data.key;

        // 2. Also track in local database for offline fallback/speed
        const license = await prisma.license_keys.create({
            data: {
                restaurant_id: restaurantId || null,
                license_key: key,
                is_active: false,
                license_type: licenseType,
                device_limit: deviceLimit,
                expires_at: new Date(Date.now() + expiryMonths * 30 * 24 * 60 * 60 * 1000),
                activated_at: null
            }
        });

        logger.log({
            level: LogLevel.INFO,
            service: 'super-admin',
            action: 'generate_license',
            restaurant_id: restaurantId || 'SYSTEM',
            metadata: { key, licenseType, cloud_id: cloudResult.data.id }
        });

        return {
            ...license,
            id: cloudResult.data.id // Use cloud ID as primary reference
        };
    }

    /**
     * Validate and apply a license key to a restaurant
     */
    async applyLicenseKey(restaurantId: string, key: string) {
        const license = await prisma.license_keys.findUnique({
            where: { license_key: key }
        });

        if (!license) {
            throw new Error('Invalid license key');
        }

        if (license.restaurant_id && license.restaurant_id !== restaurantId) {
            throw new Error('License key is already assigned to another restaurant');
        }

        // Update license
        const updatedLicense = await prisma.license_keys.update({
            where: { id: license.id },
            data: {
                restaurant_id: restaurantId,
                is_active: true,
                activated_at: new Date()
            }
        });

        // Update restaurant subscription status
        await prisma.restaurants.update({
            where: { id: restaurantId },
            data: {
                subscription_status: 'active',
                subscription_plan: license.license_type || 'STANDARD'
            }
        });

        return updatedLicense;
    }

    /**
     * Get all restaurants with their license status
     */
    async getRestaurantsOverview() {
        return prisma.restaurants.findMany({
            include: {
                license_keys: true,
                _count: {
                    select: { staff: true, orders: true }
                }
            }
        });
    }

    /**
     * Get all licenses (merged cloud and local)
     */
    async getLicenseKeys() {
        const { getLicenseKeys: cloudGetKeys } = await import('../../shared/lib/cloudClient');
        const cloudResult = await cloudGetKeys();

        if (cloudResult.error) {
            console.error('[SUPER ADMIN] Cloud Fetch Error:', cloudResult.error);
            // Fallback to local keys if cloud is down
            return prisma.license_keys.findMany({
                include: { restaurants: { select: { name: true } } },
                orderBy: { created_at: 'desc' }
            });
        }

        return cloudResult.data || [];
    }

    /**
     * Revoke a license key
     */
    async revokeLicenseKey(id: string) {
        const { revokeLicenseKey: cloudRevoke } = await import('../../shared/lib/cloudClient');
        const cloudResult = await cloudRevoke(id);

        if (cloudResult.error) {
            throw new Error(`Cloud Revocation Failed: ${cloudResult.error}`);
        }

        // Also update local record
        await prisma.license_keys.updateMany({
            where: { id: id },
            data: { is_active: false }
        });

        return { success: true };
    }

    /**
     * Verify or Reject a subscription payment
     */
    async verifyPayment(paymentId: string, status: 'verified' | 'rejected', adminId?: string) {
        const payment = await prisma.subscription_payments.findUnique({
            where: { id: paymentId }
        });

        if (!payment) throw new Error('Payment not found');

        // Update payment status
        const updatedPayment = await prisma.subscription_payments.update({
            where: { id: paymentId },
            data: {
                status,
                verified_at: new Date(),
                verified_by: adminId || 'SYSTEM_ADMIN'
            }
        });

        // If verified, update restaurant status
        if (status === 'verified') {
            await prisma.restaurants.update({
                where: { id: payment.restaurant_id },
                data: {
                    subscription_status: 'active',
                    // Extend subscription by 30 days from now
                    subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                }
            });

            logger.log({
                level: LogLevel.INFO,
                service: 'super-admin',
                action: 'payment_verified',
                restaurant_id: payment.restaurant_id,
                metadata: { paymentId, amount: payment.amount }
            });
        }

        return updatedPayment;
    }
}

export const superAdminService = new SuperAdminService();
