// src/api/services/onboarding/RestaurantProvisioningService.ts
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { platformAuthService } from '../platform/PlatformAuthService';
import { EmailVerificationService } from '../EmailVerificationService';
import { BCRYPT_COST } from '../../controllers/AuthController';
import { prisma } from '../../../shared/lib/prisma';

/** Owner-chosen password minimum length (matches the signup form rules). */
export const OWNER_PASSWORD_MIN_LENGTH = 10;

export const DUPLICATE_OWNER_EMAIL_CODE = 'EMAIL_ALREADY_REGISTERED';
export const DUPLICATE_OWNER_EMAIL_MESSAGE = 'This email already has an account. Sign in instead.';

/** Error carrying a machine-readable provisioning failure code. */
export class ProvisioningError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProvisioningError';
    this.code = code;
  }
}

export interface ProvisioningResult {
  success: boolean;
  restaurant?: any;
  /** Sanitized owner projection. Never carries a password or a PIN hash. */
  ownerStaff?: any;
  ownerInviteId?: string;
  /** Single-use verification token. Never sent in an HTTP response. */
  verificationToken?: string;
  errorCode?: string;
  error?: string;
}

export class RestaurantProvisioningService {
  /**
   * Server-side mirror of the signup form rules. Returns a human-readable
   * error, or null when the password is acceptable. The password value is
   * never logged, echoed back, or persisted in plaintext.
   */
  static validateOwnerPassword(password: unknown, email: string): string | null {
    if (typeof password !== 'string' || password.length === 0) {
      return 'Password is required';
    }
    if (password.length < OWNER_PASSWORD_MIN_LENGTH) {
      return `Password must be at least ${OWNER_PASSWORD_MIN_LENGTH} characters`;
    }
    if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
      return 'Password must not be the same as your email';
    }
    return null;
  }

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
    /**
     * Owner-chosen password (self-service signup). When provided, the same
     * transaction also creates the `users` + `memberships` identity rows and
     * dual-writes credentials onto `staff` for the current login path.
     * Provisioning paths that do not collect a password (super admin vault,
     * demo tenant) keep their PIN-only behaviour.
     */
    ownerPassword?: string;
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

    // A supplied password must be valid before any work is done.
    const ownsIdentity = data.ownerPassword !== undefined;
    if (ownsIdentity) {
      const passwordError = RestaurantProvisioningService.validateOwnerPassword(data.ownerPassword, normalizedEmail);
      if (passwordError) {
        return { success: false, error: passwordError };
      }
    }

    // Pre-compute bcrypt hash outside the transaction to avoid PG transaction
    // timeout (default 5s). bcrypt with 12 rounds can take >1s on modest hardware.
    const ownerPin = this.generateSecurePin();
    const ownerPinHash = await bcrypt.hash(ownerPin, 12);

    // Same shared cost as every other credential hash in the system.
    const ownerPasswordHash = ownsIdentity ? await bcrypt.hash(data.ownerPassword as string, BCRYPT_COST) : null;

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
            // TEMP: remove in Task 03 — credential dual-write onto `staff`.
            // Login still reads `staff.email`; Task 03 moves it to `users`.
            ...(ownsIdentity
              ? {
                  email: normalizedEmail,
                  password_hash: ownerPasswordHash,
                  is_email_verified: false,
                }
              : {}),
          },
        });

        if (ownsIdentity) {
          // One identity per email. A second workspace for an existing account
          // is a later task; signup must not create a duplicate user or tenant.
          const existingUser = await tx.users.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          });
          if (existingUser) {
            throw new ProvisioningError(DUPLICATE_OWNER_EMAIL_CODE, DUPLICATE_OWNER_EMAIL_MESSAGE);
          }

          const ownerUser = await tx.users.create({
            data: {
              email: normalizedEmail,
              password_hash: ownerPasswordHash as string,
              name: data.ownerName,
              email_verified_at: null,
              is_active: true,
            },
          });

          await tx.memberships.create({
            data: {
              user_id: ownerUser.id,
              restaurant_id: restaurant.id,
              role: 'OWNER',
              staff_id: ownerStaff.id,
            },
          });
        }

        // Owner invite state row: durable compensation ledger for the cloud side.
        // The Supabase invitation itself happens OUTSIDE this transaction (dispatcher).
        const ownerInvite = await tx.owner_invites.create({
          data: {
            restaurant_id: restaurant.id,
            email: normalizedEmail,
            state: 'INVITE_PENDING',
          },
        });

        // M035 Phase 1: Create 48-hour email verification token for the owner
        const verificationToken = EmailVerificationService.generateToken();
        const verificationExpiresAt = EmailVerificationService.getTokenExpiry();
        await tx.email_verification_tokens.create({
          data: {
            email: normalizedEmail,
            staff_id: ownerStaff.id,
            restaurant_id: restaurant.id,
            token: verificationToken,
            expires_at: verificationExpiresAt,
            used: false,
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
            id: ownerStaff.id,
            restaurant_id: ownerStaff.restaurant_id,
            name: ownerStaff.name,
            role: ownerStaff.role,
            status: ownerStaff.status,
            must_change_pin: ownerStaff.must_change_pin,
            pin_expires_at: ownerStaff.pin_expires_at,
            temporary_pin: ownerPin,
          },
          ownerInviteId: ownerInvite.id,
          verificationToken,
        };
      });

      // Development convenience only: no-ops in production and whenever an
      // email provider is configured. The token never leaves the server.
      if (result.verificationToken) {
        EmailVerificationService.logDevVerificationLink(normalizedEmail, result.verificationToken);
      }

      return {
        success: true,
        restaurant: result.restaurant,
        ownerStaff: result.ownerStaff,
        ownerInviteId: result.ownerInviteId,
        verificationToken: result.verificationToken,
      };
    } catch (error: any) {
      console.error('[PROVISIONING] Error:', error.message);
      return {
        success: false,
        errorCode: error instanceof ProvisioningError ? error.code : undefined,
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
