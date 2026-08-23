// src/api/services/onboarding/RestaurantProvisioningService.ts
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { platformAuthService } from '../platform/PlatformAuthService';
import { prisma } from '../../../shared/lib/prisma';

export interface ProvisioningResult {
  success: boolean;
  restaurant?: any;
  ownerStaff?: any;
  ownerInviteId?: string;
  error?: string;
}

export class RestaurantProvisioningService {
  async provisionRestaurant(data: {
    name: string;
    slug?: string;
    phone?: string;
    address?: string;
    city?: string;
    subscriptionPlan?: 'BASIC' | 'STANDARD' | 'PREMIUM' | 'ENTERPRISE';
    subscriptionStatus?: 'trial' | 'active';
    ownerName: string;
    ownerEmail: string;
    ownerPhone?: string;
    actorId?: string;
  }): Promise<ProvisioningResult> {
    const normalizedEmail = platformAuthService.normalizeEmail(data.ownerEmail);
    const slug = data.slug || this.generateSlug(data.name);
    const subscriptionPlan = data.subscriptionPlan || 'BASIC';
    const subscriptionStatus = data.subscriptionStatus || 'trial';
    const now = new Date();
    const pinExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    const subscriptionExpiresAt = new Date(now);
    subscriptionExpiresAt.setMonth(subscriptionExpiresAt.getMonth() + 1);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingSlug = await tx.restaurants.findFirst({
          where: { slug },
        });
        if (existingSlug) {
          throw new Error('A restaurant with this slug already exists');
        }

        const restaurant = await tx.restaurants.create({
          data: {
            name: data.name,
            slug,
            phone: data.phone || data.ownerPhone,
            address: data.address,
            currency: 'PKR',
            timezone: 'Asia/Karachi',
            is_active: true,
            onboarding_status: 'SETUP_INCOMPLETE',
            subscription_plan: subscriptionPlan,
            subscription_status: subscriptionStatus,
            subscription_expires_at: subscriptionStatus === 'active' ? subscriptionExpiresAt : null,
            trial_ends_at: trialEndsAt,
            created_at: now,
            updated_at: now,
          },
        });

        const ownerPin = this.generateSecurePin();
        const ownerPinHash = await bcrypt.hash(ownerPin, 12);

        const ownerStaff = await tx.staff.create({
          data: {
            restaurant_id: restaurant.id,
            name: data.ownerName,
            role: 'MANAGER',
            pin: '',
            hashed_pin: ownerPinHash,
            must_change_pin: true,
            pin_expires_at: pinExpiresAt,
            status: 'active',
            created_at: now,
          },
        });

        // Owner invite state row: durable compensation ledger for the cloud side.
        // The Supabase invitation itself happens OUTSIDE this transaction (dispatcher).
        const ownerInvite = await tx.owner_invites.create({
          data: {
            restaurant_id: restaurant.id,
            email: normalizedEmail,
            state: 'INVITE_PENDING',
          },
        });

        const defaultSection = await tx.sections.create({
          data: {
            restaurant_id: restaurant.id,
            name: 'Main Dining',
            prefix: 'T',
            priority: 0,
            type: 'DINING',
          },
        });

        const defaultTable = await tx.tables.create({
          data: {
            restaurant_id: restaurant.id,
            name: 'Table 1',
            section_id: defaultSection.id,
            capacity: 4,
            status: 'AVAILABLE',
          },
        });

        const orderTypes = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as const;
        for (const orderType of orderTypes) {
          await tx.order_type_defaults.create({
            data: {
              restaurant_id: restaurant.id,
              order_type: orderType,
              tax_enabled: false,
              tax_rate: 0,
              svc_enabled: false,
              svc_rate: 5,
              delivery_fee: 0,
              discount_max: 0,
            },
          });
        }

        const defaultAccounts = [
          { code: '4000', name: 'Sales', type: 'REVENUE' as const },
          { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' as const },
          { code: '6000', name: 'Operating Expenses', type: 'EXPENSE' as const },
          { code: '1000', name: 'Cash', type: 'ASSET' as const },
          { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' as const },
        ];

        for (const account of defaultAccounts) {
          await tx.chart_of_accounts.create({
            data: {
              restaurant_id: restaurant.id,
              code: account.code,
              name: account.name,
              type: account.type,
              is_system: true,
            },
          });
        }

        await tx.audit_logs.create({
          data: {
            restaurant_id: restaurant.id,
            staff_id: ownerStaff.id,
            action_type: 'RESTAURANT_PROVISIONED',
            entity_type: 'RESTAURANT',
            entity_id: restaurant.id,
            details: {
              name: data.name,
              owner_email: normalizedEmail,
              subscription_plan: subscriptionPlan,
              subscription_status: subscriptionStatus,
              owner_staff_id: ownerStaff.id,
              default_section_id: defaultSection.id,
              default_table_id: defaultTable.id,
              owner_invite_id: ownerInvite.id,
              pin_expires_at: pinExpiresAt.toISOString(),
            },
            performed_by_role: 'MANAGER',
          },
        });

        // Outbox work items for the cloud dispatcher. Payloads carry identifiers
        // and routing data only — never the PIN or any secret.
        await tx.outbox.create({
          data: {
            restaurant_id: restaurant.id,
            event_type: 'RESTAURANT_CLOUD_REGISTER',
            aggregate_type: 'RESTAURANT',
            aggregate_id: restaurant.id,
            payload: {
              restaurant_id: restaurant.id,
              name: data.name,
              slug,
              phone: data.phone || data.ownerPhone || null,
              city: data.city || null,
              subscription_plan: subscriptionPlan,
            },
          },
        });

        await tx.outbox.create({
          data: {
            restaurant_id: restaurant.id,
            event_type: 'OWNER_INVITE_REQUESTED',
            aggregate_type: 'OWNER_INVITE',
            aggregate_id: ownerInvite.id,
            payload: {
              restaurant_id: restaurant.id,
              invite_id: ownerInvite.id,
              email: normalizedEmail,
              owner_name: data.ownerName,
              restaurant_name: data.name,
            },
          },
        });

        return {
          restaurant,
          ownerStaff: {
            ...ownerStaff,
            temporary_pin: ownerPin,
          },
          ownerInviteId: ownerInvite.id,
        };
      });

      return {
        success: true,
        restaurant: result.restaurant,
        ownerStaff: result.ownerStaff,
        ownerInviteId: result.ownerInviteId,
      };
    } catch (error: any) {
      console.error('[PROVISIONING] Error:', error.message);
      return {
        success: false,
        error: error.message || 'Provisioning failed',
      };
    }
  }

  async provisionDemoRestaurant(): Promise<ProvisioningResult> {
    return this.provisionRestaurant({
      name: 'FireFlow Restaurant',
      slug: 'fireflow-restaurant',
      phone: '+92-300-1234567',
      address: '123 Main Street, Clifton',
      city: 'Karachi',
      subscriptionPlan: 'PREMIUM',
      subscriptionStatus: 'active',
      ownerName: 'Demo Owner',
      ownerEmail: 'demo@fireflow.restaurant',
      ownerPhone: '+92-300-1234567',
      actorId: 'SYSTEM',
    });
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50) + '-' + crypto.randomBytes(3).toString('hex');
  }

  private generateSecurePin(): string {
    // CSPRNG per Phase 1 condition 2: 6 decimal digits (~19.9 bits).
    // The value is never used as a lookup key anywhere.
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}

export const restaurantProvisioningService = new RestaurantProvisioningService();
