import { prisma } from '../../shared/lib/prisma';
import { setSubscriptionStatus } from './tenant/setSubscriptionStatus';
import { confirmSubscriptionPayment } from './tenant/confirmSubscriptionPayment';
import { logger, LogLevel } from '../../shared/lib/logger';
import { getSupabaseClient } from '../../shared/lib/cloudClient';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function base64url(input: string | Buffer | object): string {
    const buf = Buffer.isBuffer(input)
        ? input
        : Buffer.from(typeof input === 'string' ? input : JSON.stringify(input), 'utf8');
    return buf.toString('base64url');
}

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
        hardwareFingerprint?: string;
    }) {
        const { restaurantId, licenseType = 'STANDARD', deviceLimit = 1, expiryMonths = 12, hardwareFingerprint } = data;

        // 1. Generate via Cloud Client (it will use the SERVICE role on the server)
        const { generateLicenseKey: cloudGenerateKey } = await import('../../shared/lib/cloudClient');
        const cloudResult = await cloudGenerateKey(licenseType as any);

        if (cloudResult.error || !cloudResult.data) {
            throw new Error(`Cloud License Generation Failed: ${cloudResult.error}`);
        }

        let key = cloudResult.data.key;

        // 1b. If hardware fingerprint is provided, generate a signed JWT offline instead of using the plain text key.
        if (hardwareFingerprint) {
            try {
                const privateKeyPath = path.join(process.cwd(), 'saas_private.pem');
                if (!fs.existsSync(privateKeyPath)) {
                    throw new Error('SaaS Private Key not found on server.');
                }
                const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8').trim();

                const now = new Date();
                const expiresAt = new Date(now);
                expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

                let restaurantName = 'SaaS Partner';
                if (restaurantId) {
                    const r = await prisma.restaurants.findUnique({ where: { id: restaurantId }, select: { name: true }});
                    if (r) restaurantName = r.name;
                }

                const payload = {
                    restaurant_id: restaurantId || 'SYSTEM',
                    restaurant_name: restaurantName,
                    plan: licenseType,
                    subscription_expires_at: expiresAt.toISOString(),
                    grace_period_days: 7,
                    hardware_fingerprint: hardwareFingerprint,
                    issued_at: now.toISOString()
                };

                const header = { alg: 'ES256', typ: 'LIC' };
                const headerB64 = base64url(header);
                const payloadB64 = base64url(payload);
                const signingInput = `${headerB64}.${payloadB64}`;

                const signer = crypto.createSign('SHA256');
                signer.update(signingInput);
                const signature = signer.sign(privateKeyPem);
                const signatureB64 = signature.toString('base64url');

                key = `${headerB64}.${payloadB64}.${signatureB64}`;

                // Update the key in Supabase cloud tracking record
                const cloud = getSupabaseClient();
                const { error: updateError } = await cloud
                    .from('license_keys')
                    .update({ key })
                    .eq('id', cloudResult.data.id);

                if (updateError) {
                    throw new Error(`Failed to update key in Supabase cloud: ${updateError.message}`);
                }
            } catch (err: any) {
                console.error('[SUPER ADMIN] JWT generation failed:', err.message);
                throw new Error(`JWT Generation failed: ${err.message}`);
            }
        }

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

        // Task 04: status goes through the single writer, so the status change and
        // its subscription_events row are committed together.
        await setSubscriptionStatus(prisma, {
            restaurantId,
            toStatus: 'ACTIVE',
            actorType: 'SUPER_ADMIN',
            actorId: null,
            reason: 'license_applied',
        });

        await prisma.restaurants.update({
            where: { id: restaurantId },
            data: {
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

        // Check if it's unused, if so we might want to delete instead of just revoke
        // For simplicity, we'll offer a separate delete method, but here we just revoke
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
     * Delete a license key (Hard delete)
     */
    async deleteLicenseKey(id: string) {
        const { deleteLicenseKey: cloudDelete } = await import('../../shared/lib/cloudClient');

        // 1. Delete from Cloud
        const cloudResult = await cloudDelete(id);
        if (cloudResult.error) {
            throw new Error(`Cloud Deletion Failed: ${cloudResult.error}`);
        }

        // 2. Delete from local if exists
        await prisma.license_keys.deleteMany({
            where: { id: id }
        });

        return { success: true };
    }

    /**
     * Verify or Reject a subscription payment.
     *
     * Task 04c: this used to read and write `subscription_payments` in Supabase
     * cloud and then poke `restaurants_cloud`. Both are wrong now — the local
     * `restaurants` row is the subscription source of truth — so the whole method
     * is local and delegates the activating half to `confirmSubscriptionPayment`,
     * which is the only path that may grant a period.
     *
     * `POST /tenants/:restaurantId/confirm-payment` is the primary action; this
     * endpoint stays for confirming an already-filed evidence row by id and for
     * rejecting one.
     */
    async verifyPayment(paymentId: string, status: 'verified' | 'rejected', adminId?: string) {
        const payment = await prisma.subscription_payments.findUnique({
            where: { id: paymentId },
            select: {
                id: true,
                restaurant_id: true,
                amount: true,
                payment_method: true,
                billing_period: true,
                status: true,
            },
        });

        if (!payment) {
            throw new Error(`Payment not found: ${paymentId}`);
        }

        const verifier = adminId || null;

        if (status === 'rejected') {
            // A rejection is a decision about the payment only. It never changes
            // the tenant's status.
            const rejected = await prisma.subscription_payments.update({
                where: { id: payment.id },
                data: {
                    status: 'rejected',
                    verified_at: new Date(),
                    ...(verifier ? { verified_by: verifier } : {}),
                },
            });

            logger.log({
                level: LogLevel.INFO,
                service: 'super-admin',
                action: 'payment_rejected',
                restaurant_id: payment.restaurant_id,
                metadata: { paymentId: payment.id }
            });

            return rejected;
        }

        const confirmed = await confirmSubscriptionPayment(prisma, {
            restaurantId: payment.restaurant_id,
            amount: payment.amount.toString(),
            paymentMethod: payment.payment_method || 'OTHER',
            periodDays: periodDaysFromBillingPeriod(payment.billing_period),
            transactionRef: null, // the row already exists; do not re-key it
            adminId: verifier || 'SYSTEM_ADMIN',
        });

        logger.log({
            level: LogLevel.INFO,
            service: 'super-admin',
            action: 'payment_verified',
            restaurant_id: payment.restaurant_id,
            metadata: { paymentId: payment.id, amount: payment.amount.toString() }
        });

        return confirmed;
    }
}

/**
 * Task 04c: legacy evidence rows stored a human billing period ('monthly').
 * Only the four manual periods are grantable, so an unknown label falls back to
 * 30 days and the admin can see the resulting dates and correct them.
 */
function periodDaysFromBillingPeriod(billingPeriod: string | null): 30 | 90 | 180 | 365 {
    switch ((billingPeriod || '').trim().toLowerCase()) {
        case '90d':
        case 'quarterly':
        case 'quarter':
            return 90;
        case '180d':
        case 'biannual':
            return 180;
        case '365d':
        case 'yearly':
        case 'annual':
            return 365;
        default:
            return 30;
    }
}

export const superAdminService = new SuperAdminService();
