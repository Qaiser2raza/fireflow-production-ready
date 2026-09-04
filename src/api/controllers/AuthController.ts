// src/api/controllers/AuthController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { JwtService } from '../services/auth/JwtService';
import { EmailVerificationService } from '../services/EmailVerificationService';
import { refreshTokenService } from '../services/auth/RefreshTokenService';

const BCRYPT_COST = 14;
const DUMMY_PIN_HASH = '$2b$12$GYLhc.xEurgMkyT0l46AZumEF7vrGJ0zgcZPyfk3OvFc6d0jY2CJy';

// In-memory rate limiting trackers
const loginRateLimitTracker = new Map<string, number[]>();
const resendVerificationTracker = new Map<string, number[]>();
const resetPasswordRateLimitTracker = new Map<string, number[]>();

export class AuthController {
  private prisma: PrismaClient;
  private jwtService: JwtService;
  private emailVerificationService: typeof EmailVerificationService;

  constructor(
    prisma: PrismaClient,
    jwtService: JwtService,
    emailVerificationService: typeof EmailVerificationService
  ) {
    this.prisma = prisma;
    this.jwtService = jwtService;
    this.emailVerificationService = emailVerificationService;

    // Bind methods to preserve `this` context when passed directly as Express handlers
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.verifyEmail = this.verifyEmail.bind(this);
    this.resendVerification = this.resendVerification.bind(this);
    this.changePassword = this.changePassword.bind(this);
    this.requestPasswordReset = this.requestPasswordReset.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
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
    const startTime = Date.now();
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown';

    try {
      const { email, password, pin } = req.body;

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
        // Device trust check: must have registered trusted device
        const deviceFingerprint = (req.headers['x-device-fingerprint'] as string) || req.body.device_fingerprint;

        let isDeviceTrusted = false;
        if (deviceFingerprint) {
          const registeredDevice = await this.prisma.registered_devices.findFirst({
            where: {
              staff_id: staff.id,
              restaurant_id: staff.restaurant_id,
              device_fingerprint: deviceFingerprint,
              is_active: true
            }
          });
          if (registeredDevice) {
            isDeviceTrusted = true;
          }
        }

        if (!isDeviceTrusted) {
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

      // Update matching owner_invites
      await this.prisma.owner_invites.updateMany({
        where: {
          email: result.email.toLowerCase(),
          state: 'INVITE_PENDING'
        },
        data: {
          state: 'VERIFIED',
          updated_at: new Date()
        }
      });

      // Update matching staff record
      if (result.staffId) {
        await this.prisma.staff.update({
          where: { id: result.staffId },
          data: { is_email_verified: true }
        }).catch(() => {});
      } else {
        await this.prisma.staff.updateMany({
          where: { email: result.email.toLowerCase() },
          data: { is_email_verified: true }
        }).catch(() => {});
      }

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
