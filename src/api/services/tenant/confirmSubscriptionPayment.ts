/**
 * Task 04c — manual payment confirmation (manual billing, no gateway).
 *
 * A restaurant owner pays us out of band (bank transfer, Easypaisa, JazzCash,
 * cash), sends the confirmation through WhatsApp or support, and a SUPER_ADMIN
 * records it here. This module is the ONLY way a manual payment activates or
 * extends a subscription.
 *
 * Source of truth: the LOCAL `restaurants` row. `setSubscriptionStatus` remains
 * the authoritative status writer, so every activation appends exactly one
 * `subscription_events` row.
 *
 * Atomicity (Task 04c closure): the payment row, the status change and its event
 * are ONE transaction. A payment can never be left recorded as verified while the
 * activation failed, and a tenant can never be left ACTIVE with a payment that
 * still says pending. Inside that transaction the payment row is first written as
 * `pending`, then the authoritative status transition runs, then the row is marked
 * `verified` — so the intermediate state is never observable and never survives a
 * failure. Status errors are not caught.
 *
 * This works because `setSubscriptionStatusInTransaction` runs the identical
 * transition body as `setSubscriptionStatus` while letting this module own the
 * boundary. There is still exactly one implementation of the status rules.
 */
import type { PrismaClient, SubscriptionStatus } from '@prisma/client';
import crypto from 'crypto';
import { setSubscriptionStatusInTransaction } from './setSubscriptionStatus';

export const MANUAL_PAYMENT_METHODS = [
  'BANK_TRANSFER',
  'EASYPAISA',
  'JAZZCASH',
  'CASH',
  'OTHER',
] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

/** The only periods a manual confirmation may grant. */
export const MANUAL_PAYMENT_PERIOD_DAYS = [30, 90, 180, 365] as const;
export type ManualPaymentPeriodDays = (typeof MANUAL_PAYMENT_PERIOD_DAYS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export type ConfirmPaymentErrorCode =
  | 'INVALID_INPUT'
  | 'RESTAURANT_NOT_FOUND'
  | 'PAYMENT_NOT_FOUND'
  | 'DUPLICATE_PAYMENT';

export class ConfirmPaymentError extends Error {
  readonly code: ConfirmPaymentErrorCode;
  readonly statusCode: number;

  constructor(code: ConfirmPaymentErrorCode, statusCode: number, message: string) {
    super(message);
    this.name = 'ConfirmPaymentError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ConfirmSubscriptionPaymentInput {
  restaurantId: string;
  /** The amount actually received, not the list price. */
  amount: number | string;
  paymentMethod: ManualPaymentMethod | string;
  periodDays: ManualPaymentPeriodDays | number;
  /** Optional bank/transaction reference; also the duplicate-protection key. */
  transactionRef?: string | null;
  note?: string | null;
  /** Free-text pointer to proof held elsewhere (WhatsApp thread, receipt no). */
  proofReference?: string | null;
  /** When the customer actually paid. Defaults to now. */
  paymentDate?: Date | string | null;
  adminId: string;
  now?: Date;
}

export interface ConfirmSubscriptionPaymentResult {
  paymentId: string;
  paymentStatus: string;
  /** True when an existing pending evidence row was confirmed, false when created. */
  confirmedExisting: boolean;
  fromStatus: SubscriptionStatus;
  toStatus: SubscriptionStatus;
  statusChanged: boolean;
  eventId: string | null;
  periodDays: ManualPaymentPeriodDays;
  /** The date the new period was added to (the old expiry, or today). */
  periodStart: Date;
  periodEnd: Date;
  extendedExistingPeriod: boolean;
}

type Db = PrismaClient;

const optionalText = (value: unknown, maxLength: number, field: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, `${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
};

const parseAmount = (value: number | string): number => {
  const amount = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, 'amount must be a positive number');
  }
  if (amount > 99_999_999.99) {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, 'amount is out of range');
  }
  // Two decimals maximum: the column is Decimal(10,2) and silent rounding here
  // would make the recorded amount disagree with what the admin typed.
  if (Math.round(amount * 100) !== amount * 100) {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, 'amount must have at most two decimal places');
  }
  return amount;
};

const parsePeriodDays = (value: number | string): ManualPaymentPeriodDays => {
  const days = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof days !== 'number' || !Number.isFinite(days)) {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, 'periodDays must be a number');
  }
  if (!(MANUAL_PAYMENT_PERIOD_DAYS as readonly number[]).includes(days)) {
    throw new ConfirmPaymentError(
      'INVALID_INPUT',
      400,
      `periodDays must be one of ${MANUAL_PAYMENT_PERIOD_DAYS.join(', ')}`
    );
  }
  return days as ManualPaymentPeriodDays;
};

const parsePaymentDate = (value: Date | string | null | undefined, now: Date): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, 'paymentDate is not a valid date');
  }
  if (date.getTime() > now.getTime()) {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, 'paymentDate cannot be in the future');
  }
  return date;
};

/**
 * Where the new period is added to.
 *
 * A tenant whose paid period is still running keeps that remaining time; an
 * expired or suspended tenant starts a fresh period today. A trial that has
 * already lapsed therefore never gets free time from its old trial end date.
 */
function resolvePeriodStart(
  now: Date,
  status: SubscriptionStatus,
  subscriptionExpiresAt: Date | null
): { start: Date; extended: boolean } {
  const stillRunning =
    (status === 'TRIAL' || status === 'PENDING_REVIEW' || status === 'ACTIVE') &&
    subscriptionExpiresAt !== null &&
    subscriptionExpiresAt.getTime() > now.getTime();

  if (stillRunning) {
    return { start: subscriptionExpiresAt as Date, extended: true };
  }
  return { start: now, extended: false };
}

export async function confirmSubscriptionPayment(
  db: Db,
  input: ConfirmSubscriptionPaymentInput
): Promise<ConfirmSubscriptionPaymentResult> {
  const now = input.now ?? new Date();

  if (!input.restaurantId || typeof input.restaurantId !== 'string') {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, 'restaurantId is required');
  }
  if (!input.adminId || typeof input.adminId !== 'string') {
    throw new ConfirmPaymentError('INVALID_INPUT', 400, 'adminId is required');
  }

  const amount = parseAmount(input.amount);
  const periodDays = parsePeriodDays(input.periodDays);
  const paymentMethod = String(input.paymentMethod || '').trim().toUpperCase();

  if (!(MANUAL_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    throw new ConfirmPaymentError(
      'INVALID_INPUT',
      400,
      `paymentMethod must be one of ${MANUAL_PAYMENT_METHODS.join(', ')}`
    );
  }

  const transactionRef = optionalText(input.transactionRef, 100, 'transactionRef');
  const note = optionalText(input.note, 255, 'note');
  const proofReference = optionalText(input.proofReference, 500, 'proofReference');
  const paidOn = parsePaymentDate(input.paymentDate, now) ?? now;

  // Everything below is ONE transaction: the tenant read (so the period is
  // computed from the state this confirmation actually sees), the duplicate
  // guard, the payment row, the authoritative status change and its event.
  try {
    return await db.$transaction(async (tx) => {
      const restaurant = await tx.restaurants.findUnique({
        where: { id: input.restaurantId },
        select: { id: true, subscription_status: true, subscription_expires_at: true },
      });

      if (!restaurant) {
        throw new ConfirmPaymentError('RESTAURANT_NOT_FOUND', 404, 'Restaurant not found');
      }

      // Duplicate protection. `transaction_id` is UNIQUE, so the same reference can
      // never produce two payment rows: an existing row is UPDATED and confirmed,
      // never inserted alongside. A second confirmation of an already verified
      // payment is refused outright, because activating on it would silently grant
      // a second period for a single payment.
      let existing: { id: string; status: string } | null = null;
      if (transactionRef) {
        existing = await tx.subscription_payments.findUnique({
          where: { transaction_id: transactionRef },
          select: { id: true, status: true },
        });
        if (existing && existing.status === 'verified') {
          throw new ConfirmPaymentError(
            'DUPLICATE_PAYMENT',
            409,
            `A verified payment already exists for reference ${transactionRef}`
          );
        }
      }

      const { start: periodStart, extended } = resolvePeriodStart(
        now,
        restaurant.subscription_status,
        restaurant.subscription_expires_at
      );
      const periodEnd = new Date(periodStart.getTime() + periodDays * DAY_MS);

      // The row lands as `pending` first. It only becomes `verified` after the
      // status transition has succeeded, and the whole thing commits together, so
      // no observer ever sees a verified payment without its activation.
      const pendingData = {
        restaurant_id: restaurant.id,
        amount,
        payment_method: paymentMethod,
        billing_period: `${periodDays}d`,
        reference_note: transactionRef,
        submitted_by: input.adminId,
        status: 'pending',
        updated_at: now,
        ...(note ? { payment_proof: note } : {}),
        ...(proofReference ? { payment_proof_url: proofReference } : {}),
        // The row records when the payment happened; verified_at separately
        // records the admin's decision.
        created_at: paidOn,
      };

      let paymentId: string;
      let confirmedExisting = false;

      if (existing) {
        confirmedExisting = true;
        const updated = await tx.subscription_payments.update({
          where: { id: existing.id },
          data: pendingData,
          select: { id: true },
        });
        paymentId = updated.id;
      } else {
        const created = await tx.subscription_payments.create({
          data: {
            ...pendingData,
            // A manual confirmation without a bank reference still needs a value
            // for the UNIQUE column. The `manual:` prefix keeps it distinguishable
            // from a client-submitted proof key (a sha256 hex digest).
            transaction_id: transactionRef ?? `manual:${crypto.randomUUID()}`,
          },
          select: { id: true },
        });
        paymentId = created.id;
      }

      // Authoritative status write, inside the same transaction.
      const statusResult = await setSubscriptionStatusInTransaction(
        tx,
        {
          restaurantId: restaurant.id,
          toStatus: 'ACTIVE',
          actorType: 'SUPER_ADMIN',
          actorId: input.adminId,
          reason: 'manual_payment_confirmed',
          subscriptionExpiresAt: periodEnd,
        },
        now
      );

      await tx.subscription_payments.update({
        where: { id: paymentId },
        data: {
          status: 'verified',
          verified_by: input.adminId,
          verified_at: now,
          updated_at: now,
        },
      });

      return {
        paymentId,
        paymentStatus: 'verified',
        confirmedExisting,
        fromStatus: statusResult.fromStatus,
        toStatus: statusResult.toStatus,
        statusChanged: statusResult.changed,
        eventId: statusResult.eventId,
        periodDays,
        periodStart,
        periodEnd,
        extendedExistingPeriod: extended,
      };
    });
  } catch (error: any) {
    // A concurrent confirmation of the same reference can win the race between the
    // lookup above and the insert. The UNIQUE constraint is the authority, so the
    // conflict is reported as the duplicate it is instead of a 500.
    if (isTransactionIdConflict(error)) {
      throw new ConfirmPaymentError(
        'DUPLICATE_PAYMENT',
        409,
        `A payment with reference ${transactionRef} was confirmed concurrently`
      );
    }
    // Anything else — including a failed activation — propagates, and because the
    // work was transactional, nothing was written.
    throw error;
  }
}

/**
 * The payment reference is UNIQUE, so a P2002 naming that column means exactly one
 * thing: this reference was already taken. Any other integrity error is NOT
 * swallowed.
 */
function isTransactionIdConflict(error: unknown): boolean {
  const err = error as { code?: string; meta?: { target?: unknown } } | null;
  if (!err || err.code !== 'P2002') return false;

  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
  return fields.some((field) => field.includes('transaction_id'));
}
