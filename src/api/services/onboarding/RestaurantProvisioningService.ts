// src/api/services/onboarding/RestaurantProvisioningService.ts
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { platformAuthService } from '../platform/PlatformAuthService';
import { prisma } from '../../../shared/lib/prisma';

export interface ProvisioningResult {
  success: boolean;
  restaurant?: any;
  ownerStaff?: any;
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
            pin: ownerPin,
            hashed_pin: ownerPinHash,
            status: 'active',
            created_at: now,
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
            },
            performed_by_role: 'MANAGER',
          },
        });

        return {
          restaurant,
          ownerStaff: {
            ...ownerStaff,
            temporary_pin: ownerPin,
          },
        };
      });

      return {
        success: true,
        restaurant: result.restaurant,
        ownerStaff: result.ownerStaff,
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
    const chars = '0123456789';
    let pin = '';
    for (let i = 0; i < 6; i++) {
      pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pin;
  }
}

export const restaurantProvisioningService = new RestaurantProvisioningService();
