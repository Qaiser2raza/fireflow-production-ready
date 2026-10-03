// src/api/controllers/AuthController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { JwtService } from '../services/auth/JwtService';
import { EmailVerificationService } from '../services/EmailVerificationService';
import { refreshTokenService } from '../services/auth/RefreshTokenService';
import { StaffDeviceService } from '../services/auth/StaffDeviceService';
import { userSessionService, MAX_FAILED_LOGINS, ACCOUNT_LOCK_MINUTES } from '../services/auth/UserSessionService';

// Shared bcrypt cost for every credential hash in the system (login, reset,
// provisioning). Provisioning imports this so identity hashes cannot drift.
export const BCRYPT_COST = 14;
const DUMMY_PIN_HASH = '$2b$12$GYLhc.xEurgMkyT0l46AZumEF7vrGJ0zgcZPyfk3OvFc6d0jY2CJy';
// Cost-14 hash of a random throwaway value. Comparing against it keeps the
// "email does not exist" path the same length as a real failed comparison.
const DUMMY_PASSWORD_HASH = '$2b$14$5Fb3WNZWDzVivHBXPkbexehd37QUDPeKXzP0Jxb8h1aWty9k8znxO';

// In-memory rate limiting trackers
const loginRateLimitTracker = new Map<string, number[]>();
const resendVerificationTracker = new Map<string, number[]>();
const resetPasswordRateLimitTracker = new Map<string, number[]>();

/**
 * Clears the in-memory auth rate-limit trackers.
 * Exported for regression tests only; the application never calls it.
 */
export function resetLoginRateLimitTrackersForTests(): void {
  loginRateLimitTracker.clear();
  resendVerificationTracker.clear();
  resetPasswordRateLimitTracker.clear();
}

export class AuthController {
  private prisma: PrismaClient;
  private jwtService: JwtService;
  private emailVerificationService: typeof EmailVerificationService;
  private staffDeviceService: StaffDeviceService;

  constructor(
    prisma: PrismaClient,
    jwtService: JwtService,
    emailVerificationService: typeof EmailVerificationService
  ) {
    this.prisma = prisma;
    this.jwtService = jwtService;
    this.emailVerificationService = emailVerificationService;
    this.staffDeviceService = new StaffDeviceService(prisma);

    // Bind methods to preserve `this` context when passed directly as Express handlers
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.selectRestaurant = this.selectRestaurant.bind(this);
    this.verifyEmail = this.verifyEmail.bind(this);
    this.verifyEmailLink = this.verifyEmailLink.bind(this);
    this.resendVerification = this.resendVerification.bind(this);
    this.changePassword = this.changePassword.bind(this);
    this.requestPasswordReset = this.requestPasswordReset.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
    this.listDevices = this.listDevices.bind(this);
    this.revokeDevice = this.revokeDevice.bind(this);
  }

  /**
   * Helper to check and record attempts in rate limiter
   */
  private checkRateLimit(tracker: Map<string, number[]>, key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (tracker.get(key) || []).filter(ts => ts > windowStart);
    if (timestamps.length >= maxAttempts) {
      return false;
    }
    timestamps.push(now);
    tracker.set(key, timestamps);
    return true;
  }

  /**
   * Helper to validate password complexity
   * (Min 8 chars, at least 1 uppercase, 1 lowercase, 1 number)
   */
  private isPasswordStrong(password: string): boolean {
    if (!password || typeof password !== 'string' || password.length < 8) return false;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return hasUpper && hasLower && hasNumber;
  }

  /**
   * Helper to validate email format
   */
  private isEmailValid(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim();
    return trimmed.includes('@') && trimmed.includes('.');
  }

  /**
   * POST /api/auth/register
   * Registers a tenant staff member with email + password
   */
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, name, role, pin } = req.body;
      const restaurant_id = (req as any).restaurantId;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }

      if (!restaurant_id || typeof restaurant_id !== 'string') {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!role || typeof role !== 'string') {
        res.status(400).json({ error: 'role is required' });
        return;
      }

      if (!this.isEmailValid(email)) {
        res.status(400).json({ error: 'A valid email address is required' });
        return;
      }

      if (!this.isPasswordStrong(password)) {
        res.status(400).json({
          error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number'
        });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Verify restaurant exists
      const restaurant = await this.prisma.restaurants.findUnique({
        where: { id: restaurant_id },
        select: { id: true, is_active: true }
      });

      if (!restaurant || !restaurant.is_active) {
        res.status(404).json({ error: 'Restaurant not found or inactive' });
        return;
      }

      // Check if staff member with that email already exists for this restaurant
      const existingStaff = await this.prisma.staff.findFirst({
        where: {
          restaurant_id,
          email: normalizedEmail
        }
      });

      if (existingStaff) {
        res.status(409).json({ error: 'A staff member with this email already exists for this restaurant' });
        return;
      }

      // Hash password with bcrypt cost 14
      const password_hash = await bcrypt.hash(password, BCRYPT_COST);

      if (pin !== undefined && (typeof pin !== 'string' || !/^\d{6}$/.test(pin))) {
        res.status(400).json({ error: 'PIN must be exactly 6 digits' });
        return;
      }
      const fastAuthPin = pin || Math.floor(100000 + Math.random() * 900000).toString();
      const hashedPin = await bcrypt.hash(fastAuthPin, 12);

      const staff = await this.prisma.staff.create({
        data: {
          restaurant_id,
          name: name.trim(),
          role: role.toUpperCase(),
          email: normalizedEmail,
          password_hash,
          pin: '', // Never store plaintext PIN
          hashed_pin: hashedPin,
          must_change_password: true,
          must_change_pin: true,
          is_email_verified: false,
          status: 'active',
        }
      });

      // Create an email verification token record (48h expiry)
      await this.emailVerificationService.createVerificationEmail(
        normalizedEmail,
        staff.id,
        restaurant_id
      );

      res.status(201).json({
        success: true,
        message: 'Registration successful. Please verify your email.',
        staffId: staff.id
      });
    } catch (err: any) {
      console.error('[AUTH_CONTROLLER] register error:', err);
      res.status(500).json({ error: 'Registration failed' });
    }
  }

  /**
   * POST /api/auth/login
   * Primary mode: email + password
   * Fast-auth mode: email + PIN (requires trusted device)
   */
  async login(req: Request, res: Response): Promise<void> {
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';

    try {
      const { email, password, pin, device_fingerprint, device_name } = req.body;

      if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'Email is required' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Rate limit: max 5 attempts per 15 minutes per email
      const rateLimitAllowed = this.checkRateLimit(
        loginRateLimitTracker,
        `login:${normalizedEmail}`,
        5,
        15 * 60 * 1000
      );

      if (!rateLimitAllowed) {
        res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
        return;
      }

      const isPasswordMode = typeof password === 'string' && password.length > 0;
      const isPinMode = typeof pin === 'string' && pin.length > 0;

      if (!isPasswordMode && !isPinMode) {
        res.status(400).json({ error: 'Password or PIN is required' });
        return;
      }
      if (isPasswordMode && isPinMode) {
        res.status(400).json({ error: 'Choose either password or PIN authentication' });
        return;
      }

      const device = StaffDeviceService.normalize({ fingerprint: device_fingerprint, name: device_name });

      // Cloud identity first: an owner account lives in `users` + `memberships`
      // and its session in `user_sessions`. Staff accounts that only exist in
      // `staff` (PIN or legacy email/password) fall through to the path below.
      if (isPasswordMode) {
        const user = await this.prisma.users.findUnique({
          where: { email: normalizedEmail },
          select: { id: true, email: true, name: true, is_active: true, email_verified_at: true, password_hash: true, failed_login_count: true, locked_until: true }
        });

        if (user) {
          await this.loginOwner(req, res, {
            user,
            password: password as string,
            device,
            ipAddress,
          });
          return;
        }

        // Unknown account: burn an equivalent bcrypt compare so response time
        // does not reveal whether the email exists.
        await bcrypt.compare(password as string, DUMMY_PASSWORD_HASH).catch(() => false);
      }

      // Look up staff by email
      const staff = await this.prisma.staff.findFirst({
        where: { email: normalizedEmail },
        include: {
          restaurants: {
            select: { id: true, name: true, slug: true, is_active: true, onboarding_status: true }
          }
        }
      });

      if (!staff || !staff.restaurants || !staff.restaurants.is_active) {
        // Burn timing equalization compare
        await bcrypt.compare(pin || '000000', DUMMY_PIN_HASH).catch(() => false);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const now = Date.now();

      // Check account lock
      if (staff.locked_until && staff.locked_until.getTime() > now) {
        res.status(403).json({
          error: 'Account is temporarily locked due to multiple failed attempts. Please try again later.'
        });
        return;
      }

      if (staff.status?.toLowerCase() !== 'active') {
        res.status(403).json({ error: 'Account is inactive', code: 'STAFF_INACTIVE' });
        return;
      }

      // Check email verification status
      if (!staff.is_email_verified) {
        res.status(403).json({
          error: 'Please verify your email address before logging in.',
          code: 'EMAIL_NOT_VERIFIED'
        });
        return;
      }

      // Handle PRIMARY MODE (Email + Password)
      if (isPasswordMode) {
        if (!staff.password_hash) {
          // No password hash configured yet
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        const passwordMatch = await bcrypt.compare(password, staff.password_hash);
        if (!passwordMatch) {
          const newFailed = (staff.failed_login_count || 0) + 1;
          const updateData: any = { failed_login_count: newFailed };
          if (newFailed >= 5) {
            updateData.locked_until = new Date(now + 30 * 60 * 1000); // 30 mins
          }
          await this.prisma.staff.update({ where: { id: staff.id }, data: updateData });

          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }
      }

      // Handle FAST-AUTH MODE (Email + PIN)
      if (isPinMode) {
        if (!device || !await this.staffDeviceService.isTrusted(staff.id, staff.restaurant_id, device.fingerprint)) {
          res.status(403).json({
            error: 'PIN login is only permitted on paired, trusted devices. Please sign in with email and password.',
            code: 'DEVICE_NOT_TRUSTED'
          });
          return;
        }

        if (!staff.hashed_pin) {
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        const pinMatch = await bcrypt.compare(pin, staff.hashed_pin);
        if (!pinMatch) {
          const newFailed = (staff.failed_login_count || 0) + 1;
          const updateData: any = { failed_login_count: newFailed };
          if (newFailed >= 5) {
            updateData.locked_until = new Date(now + 30 * 60 * 1000);
          }
          await this.prisma.staff.update({ where: { id: staff.id }, data: updateData });

          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }
      }

      // A successful full credential login is the only enrollment path. A
      // client fingerprint is never sufficient to create trust by itself.
      if (isPasswordMode && device) {
        await this.staffDeviceService.trust(staff.id, staff.restaurant_id, device);
      } else if (isPinMode && device) {
        await this.staffDeviceService.touch(staff.id, staff.restaurant_id, device.fingerprint);
      }

      // Successful Authentication -> reset failure count and update last_login
      const lastLoginAt = new Date();
      await this.prisma.staff.update({
        where: { id: staff.id },
        data: {
          last_login: lastLoginAt,
          failed_login_count: 0,
          locked_until: null
        }
      });

      // Generate Access and Refresh tokens
      const accessToken = this.jwtService.generateAccessToken(
        staff.id,
        staff.restaurant_id,
        staff.role,
        staff.name
      );

      const { token: refreshToken } = await refreshTokenService.createStaffRefreshToken(
        staff.id,
        staff.restaurant_id
      );

      await this.prisma.audit_logs.create({
        data: {
          restaurant_id: staff.restaurant_id,
          staff_id: staff.id,
          action_type: 'STAFF_LOGIN',
          entity_type: 'STAFF',
          entity_id: staff.id,
          details: {
            mode: isPasswordMode ? 'password' : 'pin',
            ip_address: ipAddress
          }
        }
      });

      res.json({
        success: true,
        accessToken,
        refreshToken,
        staff: {
          id: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
          restaurant_id: staff.restaurant_id,
          status: staff.status,
          must_change_password: staff.must_change_password === true,
          must_change_pin: staff.must_change_pin === true,
          is_email_verified: staff.is_email_verified,
          last_login: lastLoginAt
        },
        device: { trusted: Boolean(device), enrolled: isPasswordMode && Boolean(device) },
        restaurant: staff.restaurants,
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 15 * 60
        }
      });
    } catch (err: any) {
      console.error('[AUTH_CONTROLLER] login error:', err);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  /**
   * Cloud-identity login: `users` + `memberships` + `user_sessions`.
   *
   * Runs only when a `users` row exists for the email. Staff-only accounts are
   * untouched and keep using the legacy staff path in `login`.
   */
  private async loginOwner(
    req: Request,
    res: Response,
    ctx: {
      user: {
        id: string;
        email: string;
        name: string;
        is_active: boolean;
        email_verified_at: Date | null;
        password_hash: string;
        failed_login_count: number;
        locked_until: Date | null;
      };
      password: string;
      device: { fingerprint: string; name?: string } | null;
      ipAddress: string;
    }
  ): Promise<void> {
    const { user, password, device, ipAddress } = ctx;
    const now = Date.now();

    if (user.locked_until && user.locked_until.getTime() > now) {
      res.status(403).json({
        error: 'Account is temporarily locked due to multiple failed attempts. Please try again later.',
        code: 'ACCOUNT_LOCKED',
      });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      const failed = (user.failed_login_count || 0) + 1;
      await this.prisma.users.update({
        where: { id: user.id },
        data: {
          failed_login_count: failed,
          locked_until: failed >= MAX_FAILED_LOGINS ? new Date(now + ACCOUNT_LOCK_MINUTES * 60 * 1000) : null,
        },
      });
      // Identical response for a wrong password and an unknown account.
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ error: 'Account is inactive', code: 'ACCOUNT_INACTIVE' });
      return;
    }

    if (!user.email_verified_at) {
      res.status(403).json({
        error: 'Please verify your email address before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
      });
      return;
    }

    const memberships = await this.prisma.memberships.findMany({
      where: { user_id: user.id },
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true, is_active: true, onboarding_status: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    if (memberships.length === 0) {
      res.status(403).json({
        error: 'This account is not a member of any restaurant yet.',
        code: 'NO_MEMBERSHIP',
      });
      return;
    }

    await this.prisma.users.update({
      where: { id: user.id },
      data: { failed_login_count: 0, locked_until: null, last_login_at: new Date() },
    });

    // Two or more workspaces: no session yet, only a short-lived
    // single-purpose selection token.
    if (memberships.length > 1) {
      const selectionToken = this.jwtService.generateSelectionToken(user.id);
      res.status(200).json({
        requires_restaurant_selection: true,
        restaurants: memberships.map((m) => ({
          restaurant_id: m.restaurant_id,
          name: m.restaurant.name,
          slug: m.restaurant.slug,
          role: m.role,
        })),
        selection_token: selectionToken,
      });
      return;
    }

    await this.issueOwnerSession(req, res, user, memberships[0], device, ipAddress);
  }

  /**
   * POST /api/auth/select-restaurant
   * Second step for accounts that belong to more than one restaurant.
   */
  async selectRestaurant(req: Request, res: Response): Promise<void> {
    try {
      const { selection_token, restaurant_id, device_fingerprint, device_name } = req.body;
      const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';

      if (!selection_token || typeof selection_token !== 'string') {
        res.status(400).json({ error: 'selection_token is required' });
        return;
      }
      if (!restaurant_id || typeof restaurant_id !== 'string') {
        res.status(400).json({ error: 'restaurant_id is required' });
        return;
      }

      const decoded = this.jwtService.verifySelectionToken(selection_token);
      if (!decoded.valid || !decoded.payload) {
        res.status(401).json({
          error: 'Restaurant selection is invalid or has expired. Please sign in again.',
          code: 'INVALID_SELECTION_TOKEN',
        });
        return;
      }

      const user = await this.prisma.users.findUnique({
        where: { id: decoded.payload.userId },
        select: { id: true, email: true, name: true, is_active: true, email_verified_at: true },
      });

      if (!user || !user.is_active || !user.email_verified_at) {
        res.status(401).json({
          error: 'Restaurant selection is invalid or has expired. Please sign in again.',
          code: 'INVALID_SELECTION_TOKEN',
        });
        return;
      }

      // Membership is the authority: a foreign restaurant_id is rejected.
      const membership = await this.prisma.memberships.findFirst({
        where: { user_id: user.id, restaurant_id },
        include: {
          restaurant: {
            select: { id: true, name: true, slug: true, is_active: true, onboarding_status: true },
          },
        },
      });

      if (!membership) {
        res.status(403).json({
          error: 'You do not have access to this restaurant.',
          code: 'NO_MEMBERSHIP_FOR_RESTAURANT',
        });
        return;
      }

      const device = StaffDeviceService.normalize({ fingerprint: device_fingerprint, name: device_name });
      await this.issueOwnerSession(req, res, user, membership, device, ipAddress);
    } catch (err: any) {
      console.error('[AUTH_CONTROLLER] selectRestaurant error:', err.message);
      res.status(500).json({ error: 'Restaurant selection failed' });
    }
  }

  /**
   * Issues the owner session: an access token with the exact staff claims the
   * app already expects, plus a `user_sessions` row whose raw token only ever
   * travels in an httpOnly cookie.
   */
  private async issueOwnerSession(
    req: Request,
    res: Response,
    user: { id: string; email: string; name: string },
    membership: { restaurant_id: string; staff_id: string | null; role: string; restaurant: { id: string; name: string; slug: string | null; is_active: boolean; onboarding_status: string } },
    device: { fingerprint: string; name?: string } | null,
    ipAddress: string
  ): Promise<void> {
    if (!membership.staff_id) {
      res.status(403).json({
        error: 'This account is not linked to a staff profile in this restaurant yet.',
        code: 'STAFF_LINK_MISSING',
      });
      return;
    }

    const staff = await this.prisma.staff.findUnique({
      where: { id: membership.staff_id },
      select: {
        id: true,
        restaurant_id: true,
        name: true,
        role: true,
        status: true,
        must_change_pin: true,
        is_email_verified: true,
        last_login: true,
      },
    });

    if (!staff || staff.restaurant_id !== membership.restaurant_id) {
      res.status(403).json({
        error: 'The staff profile linked to this membership is no longer available.',
        code: 'STAFF_LINK_MISSING',
      });
      return;
    }

    if (staff.status !== 'active') {
      res.status(403).json({ error: 'Account is inactive', code: 'STAFF_INACTIVE' });
      return;
    }

    if (!membership.restaurant.is_active) {
      res.status(403).json({ error: 'Restaurant is inactive', code: 'RESTAURANT_INACTIVE' });
      return;
    }

    // TODO(Task 04): single tenant status / trial check belongs here — after the
    // membership is resolved, before any session is issued.

    const accessToken = this.jwtService.generateAccessToken(
      staff.id,
      membership.restaurant_id,
      staff.role,
      staff.name
    );

    const issued = await userSessionService.createUserSession({
      userId: user.id,
      // Task 03b: the session is bound to the chosen restaurant, so a refresh can
      // never silently switch tenant.
      restaurantId: membership.restaurant_id,
      userAgent: (req.headers['user-agent'] as string) || null,
      ipAddress,
    });

    // Raw refresh token: cookie only, never in the response body.
    userSessionService.setRefreshCookie(res, issued.token);

    // Mirror the staff login device enrolment so PIN fast-auth keeps working.
    if (device) {
      await this.staffDeviceService.trust(staff.id, membership.restaurant_id, device).catch(() => { });
    }

    const lastLogin = new Date();
    await this.prisma.staff.update({
      where: { id: staff.id },
      data: { last_login: lastLogin, failed_login_count: 0, locked_until: null },
    });

    await this.prisma.audit_logs.create({
      data: {
        restaurant_id: membership.restaurant_id,
        staff_id: staff.id,
        action_type: 'USER_LOGIN',
        entity_type: 'USER',
        entity_id: user.id,
        details: {
          membership_role: membership.role,
          ip_address: ipAddress,
        },
      },
    });

    res.json({
      success: true,
      accessToken,
      staff: {
        id: staff.id,
        name: staff.name,
        email: user.email,
        role: staff.role,
        restaurant_id: membership.restaurant_id,
        status: staff.status,
        must_change_password: false,
        must_change_pin: staff.must_change_pin === true,
        is_email_verified: staff.is_email_verified,
        last_login: lastLogin,
      },
      device: { trusted: Boolean(device), enrolled: Boolean(device) },
      restaurant: membership.restaurant,
      tokens: {
        access_token: accessToken,
        expires_in: 15 * 60,
      },
    });
  }

  /** List trusted devices for the authenticated staff member or a manager's tenant staff. */
  async listDevices(req: Request, res: Response): Promise<void> {
    const actorId = (req as any).staffId;
    const restaurantId = (req as any).restaurantId;
    const targetStaffId = req.params.staffId;
    if (!actorId || !restaurantId || !targetStaffId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (actorId !== targetStaffId && !['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(String((req as any).role).toUpperCase())) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    const target = await this.prisma.staff.findFirst({ where: { id: targetStaffId, restaurant_id: restaurantId }, select: { id: true } });
    if (!target) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    res.json({ devices: await this.staffDeviceService.list(targetStaffId, restaurantId) });
  }

  /** Revoke a trusted device within the authenticated tenant only. */
  async revokeDevice(req: Request, res: Response): Promise<void> {
    const actorId = (req as any).staffId;
    const restaurantId = (req as any).restaurantId;
    const targetStaffId = req.params.staffId;
    const deviceId = req.params.deviceId;
    if (!actorId || !restaurantId || !targetStaffId || !deviceId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (actorId !== targetStaffId && !['MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(String((req as any).role).toUpperCase())) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    if (!await this.staffDeviceService.revoke(deviceId, targetStaffId, restaurantId)) {
      res.status(404).json({ error: 'Trusted device not found' });
      return;
    }
    await this.prisma.audit_logs.create({ data: { restaurant_id: restaurantId, staff_id: actorId, action_type: 'STAFF_DEVICE_REVOKED', entity_type: 'STAFF_DEVICE', entity_id: deviceId, details: { target_staff_id: targetStaffId } } });
    res.json({ success: true });
  }

  /**
   * Applies the result of a successful token verification.
   *
   * A verified email is recorded on the cloud identity row (`users`), which is
   * what the owner login path reads. The `staff` flag is kept in step for
   * staff-only accounts registered through /api/auth/register.
   */
  private async applyVerification(email: string, staffId?: string | null): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    // Owner invite state row (cloud provisioning ledger).
    await this.prisma.owner_invites.updateMany({
      where: {
        email: normalizedEmail,
        state: 'INVITE_PENDING'
      },
      data: {
        state: 'VERIFIED',
        updated_at: new Date()
      }
    });

    await this.prisma.users.update({
      where: { email: normalizedEmail },
      data: { email_verified_at: new Date() }
    }).catch(() => {});

    // Staff rows registered through the tenant-scoped registration route have
    // no `users` identity, so the staff flag still has to move for them.
    if (staffId) {
      await this.prisma.staff.update({
        where: { id: staffId },
        data: { is_email_verified: true }
      }).catch(() => {});
    } else {
      await this.prisma.staff.updateMany({
        where: { email: normalizedEmail },
        data: { is_email_verified: true }
      }).catch(() => {});
    }
  }

  /**
   * POST /api/auth/verify-email
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Verification token is required' });
        return;
      }

      const result = await this.emailVerificationService.verifyToken(token);
      if (!result.valid || !result.email) {
        res.status(400).json({ error: result.error || 'Invalid or expired verification token' });
        return;
      }

      await this.applyVerification(result.email, result.staffId);

      res.json({
        success: true,
        message: 'Email verified successfully',
        email: result.email
      });
    } catch (err: any) {
      console.error('[AUTH_CONTROLLER] verifyEmail error:', err);
      res.status(500).json({ error: 'Email verification failed' });
    }
  }

  /**
   * GET /api/auth/verify-email?token=...
   * Browser entry point for the verification link printed in development.
   * Consumes the same single-use token as the POST endpoint and renders a
   * minimal confirmation page. Never echoes the token back in the response.
   */
  async verifyEmailLink(req: Request, res: Response): Promise<void> {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const page = (title: string, message: string, ok: boolean) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;background:#020617;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><main style="max-width:32rem;padding:2rem;border:1px solid #1e293b;border-radius:1rem;background:#0f172a"><h1 style="font-size:1.25rem;margin:0 0 .75rem;color:${ok ? '#34d399' : '#f87171'}">${title}</h1><p style="font-size:.875rem;line-height:1.6;margin:0">${message}</p></main></body></html>`;

    try {
      if (!token) {
        res.status(400).send(page('Verification link invalid', 'This link is missing its verification token.', false));
        return;
      }

      const result = await this.emailVerificationService.verifyToken(token);
      if (!result.valid || !result.email) {
        res.status(400).send(page('Verification failed', result.error || 'This verification link is invalid or has expired. Request a new one from the sign-in screen.', false));
        return;
      }

      await this.applyVerification(result.email, result.staffId);

      res.status(200).send(page('Email verified', 'Your account is verified. You can now sign in with your email and password.', true));
    } catch (err: any) {
      console.error('[AUTH_CONTROLLER] verifyEmailLink error:', err.message);
      res.status(500).send(page('Verification failed', 'Something went wrong while verifying your account.', false));
    }
  }

  /**
   * POST /api/auth/resend-verification
   */
  async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      if (!this.isEmailValid(email)) {
        res.status(400).json({ error: 'A valid email address is required' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();

      const allowed = this.checkRateLimit(
        resendVerificationTracker,
        `resend:${normalizedEmail}`,
        3,
        60 * 60 * 1000
      );

      if (!allowed) {
        res.status(429).json({
          error: 'Too many verification requests. Please wait an hour before requesting another email.'
        });
        return;
      }

      const [invite, staff] = await Promise.all([
        this.prisma.owner_invites.findFirst({
          where: { email: normalizedEmail }
        }),
        this.prisma.staff.findFirst({
          where: { email: normalizedEmail }
        })
      ]);

      if (invite || staff) {
        await this.emailVerificationService.createVerificationEmail(
          normalizedEmail,
          staff?.id || null,
          invite?.restaurant_id || staff?.restaurant_id || null
        );
      }

      res.json({
        success: true,
        message: 'Verification email resent'
      });
    } catch (err: any) {
      console.error('[AUTH_CONTROLLER] resendVerification error:', err);
      res.status(500).json({ error: 'Failed to process resend request' });
    }
  }

  /**
   * POST /api/auth/change-password
   * Requires authenticated tenant staff
   */
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const staffId = (req as any).staffId;
      const restaurantId = (req as any).restaurantId;

      if (!staffId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { current_password, new_password } = req.body;

      if (!current_password || typeof current_password !== 'string') {
        res.status(400).json({ error: 'Current password is required' });
        return;
      }

      if (!this.isPasswordStrong(new_password)) {
        res.status(400).json({
          error: 'New password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number'
        });
        return;
      }

      const staff = await this.prisma.staff.findUnique({
        where: { id: staffId },
        select: { id: true, password_hash: true, restaurant_id: true }
      });

      if (!staff || !staff.password_hash) {
        res.status(401).json({ error: 'Invalid current credentials' });
        return;
      }

      const passwordMatch = await bcrypt.compare(current_password, staff.password_hash);
      if (!passwordMatch) {
        res.status(401).json({ error: 'Current password does not match' });
        return;
      }

      const newHash = await bcrypt.hash(new_password, BCRYPT_COST);

      await this.prisma.staff.update({
        where: { id: staffId },
        data: {
          password_hash: newHash,
          must_change_password: false
        }
      });

      // Revoke all refresh tokens for this staff member
      await refreshTokenService.revokeAllStaffRefreshTokens(staffId, restaurantId || staff.restaurant_id);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (err: any) {
      console.error('[AUTH_CONTROLLER] changePassword error:', err);
      res.status(500).json({ error: 'Password change failed' });
    }
  }

  /**
   * POST /api/auth/password-reset/request
   */
  async requestPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      if (!this.isEmailValid(email)) {
        res.status(400).json({ error: 'A valid email address is required' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();

      const allowed = this.checkRateLimit(
        resetPasswordRateLimitTracker,
        `reset:${normalizedEmail}`,
        3,
        60 * 60 * 1000
      );

      if (!allowed) {
        res.status(429).json({
          error: 'Too many password reset requests. Please wait an hour before requesting again.'
        });
        return;
      }

      const staff = await this.prisma.staff.findFirst({
        where: { email: normalizedEmail }
      });

      if (staff) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Invalidate prior unused tokens
        await this.prisma.staff_password_reset_tokens.updateMany({
          where: {
            staff_id: staff.id,
            used: false
          },
          data: { used: true }
        });

        await this.prisma.staff_password_reset_tokens.create({
          data: {
            staff_id: staff.id,
            email: normalizedEmail,
            token,
            expires_at: expiresAt,
            used: false
          }
        });
      }

      // Generic response to avoid leaking account existence
      res.json({
        success: true,
        message: 'If an account exists, a reset link has been sent'
      });
    } catch (err: any) {
      console.error('[AUTH_CONTROLLER] requestPasswordReset error:', err);
      res.status(500).json({ error: 'Failed to process password reset request' });
    }
  }

  /**
   * POST /api/auth/password-reset/complete
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, new_password } = req.body;

      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Reset token is required' });
        return;
      }

      if (!this.isPasswordStrong(new_password)) {
        res.status(400).json({
          error: 'New password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number'
        });
        return;
      }

      const resetRecord = await this.prisma.staff_password_reset_tokens.findUnique({
        where: { token: token.trim() }
      });

      if (!resetRecord || resetRecord.used || new Date() > resetRecord.expires_at) {
        res.status(400).json({ error: 'Invalid or expired password reset token' });
        return;
      }

      const newHash = await bcrypt.hash(new_password, BCRYPT_COST);

      await this.prisma.$transaction(async (tx) => {
        await tx.staff.update({
          where: { id: resetRecord.staff_id },
          data: {
            password_hash: newHash,
            must_change_password: false,
            failed_login_count: 0,
            locked_until: null
          }
        });

        await tx.staff_password_reset_tokens.update({
          where: { id: resetRecord.id },
          data: { used: true }
        });
      });

      res.json({
        success: true,
        message: 'Password reset successful'
      });
    } catch (err: any) {
      console.error('[AUTH_CONTROLLER] resetPassword error:', err);
      res.status(500).json({ error: 'Password reset failed' });
    }
  }
}
