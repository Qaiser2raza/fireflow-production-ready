import { Prisma, PrismaClient, ShiftStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export type ShiftBoundaries = { dayStart: string; dayEnd: string; timezone: string | null };

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseShiftBoundary(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new Error('INVALID_SHIFT_BOUNDARY');
  return Number(match[1]) * 60 + Number(match[2]);
}

function localDateParts(timezone: string, at: Date): { year: number; month: number; day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  if (![year, month, day, hour, minute].every(Number.isFinite)) throw new Error('INVALID_TIMEZONE');
  return { year, month, day, minutes: hour * 60 + minute };
}

/** Returns a UTC date-only value representing the restaurant-local business date. */
export function calculateBusinessDate(boundaries: ShiftBoundaries, at = new Date()): Date {
  const start = parseShiftBoundary(boundaries.dayStart);
  const end = parseShiftBoundary(boundaries.dayEnd);
  const local = localDateParts(boundaries.timezone || 'Asia/Karachi', at);
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const spansMidnight = start > end;
  if ((spansMidnight && local.minutes < end) || (!spansMidnight && start !== end && local.minutes < start)) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
}

export class ShiftSessionService {
  constructor(private readonly prisma: PrismaClient) {}

  async openShift(params: { restaurantId: string; openedBy: string; openingFloat: Decimal; terminalId?: string; now?: Date }) {
    const now = params.now || new Date();
    const restaurant = await this.prisma.restaurants.findUnique({
      where: { id: params.restaurantId }, select: { day_start: true, day_end: true, timezone: true },
    });
    if (!restaurant) throw new Error('RESTAURANT_NOT_FOUND');
    const businessDate = calculateBusinessDate({ dayStart: restaurant.day_start, dayEnd: restaurant.day_end, timezone: restaurant.timezone }, now);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.shift_sessions.findFirst({
          where: { restaurant_id: params.restaurantId, business_date: businessDate, status: ShiftStatus.OPEN }, select: { id: true },
        });
        if (existing) throw new Error('SHIFT_ALREADY_OPEN');
        return tx.shift_sessions.create({
          data: {
            restaurant_id: params.restaurantId, business_date: businessDate, day_start: now,
            status: ShiftStatus.OPEN, opening_float: params.openingFloat, expected_cash: params.openingFloat,
            terminal_id: params.terminalId, opened_by: params.openedBy,
          },
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new Error('SHIFT_ALREADY_OPEN');
      throw error;
    }
  }

  async getActiveShift(restaurantId: string) {
    return this.prisma.shift_sessions.findFirst({
      where: { restaurant_id: restaurantId, status: ShiftStatus.OPEN }, orderBy: { day_start: 'desc' },
    });
  }

  async closeShift(params: { restaurantId: string; shiftId: string; closedBy: string; actualCash: Decimal; notes?: string; terminalId?: string; now?: Date }) {
    const now = params.now || new Date();
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift_sessions.findFirst({
        where: { id: params.shiftId, restaurant_id: params.restaurantId, status: ShiftStatus.OPEN },
      });
      if (!shift) throw new Error('ACTIVE_SHIFT_NOT_FOUND');
      const transactions = await tx.transactions.findMany({
        where: {
          restaurant_id: params.restaurantId, payment_method: 'CASH', status: { in: ['COMPLETED', 'REFUNDED'] },
          created_at: { gte: shift.day_start, lte: now },
        }, select: { amount: true, status: true },
      });
      const expected = transactions.reduce((total, transaction) => (
        transaction.status === 'REFUNDED' ? total.minus(transaction.amount) : total.plus(transaction.amount)
      ), new Decimal(shift.opening_float.toString()));
      return tx.shift_sessions.update({
        where: { id: shift.id },
        data: {
          status: ShiftStatus.CLOSED, day_end: now, expected_cash: expected, actual_cash: params.actualCash,
          difference: params.actualCash.minus(expected), closed_by: params.closedBy, notes: params.notes,
          ...(params.terminalId ? { terminal_id: params.terminalId } : {}),
        },
      });
    });
  }

  async listShifts(restaurantId: string, from?: Date, to?: Date) {
    return this.prisma.shift_sessions.findMany({
      where: { restaurant_id: restaurantId, ...(from || to ? { business_date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
      orderBy: [{ business_date: 'desc' }, { day_start: 'desc' }],
    });
  }

  async getShift(restaurantId: string, shiftId: string) {
    return this.prisma.shift_sessions.findFirst({ where: { id: shiftId, restaurant_id: restaurantId } });
  }

  async updateBoundaries(restaurantId: string, dayStart: string, dayEnd: string) {
    parseShiftBoundary(dayStart);
    parseShiftBoundary(dayEnd);
    return this.prisma.restaurants.update({ where: { id: restaurantId }, data: { day_start: dayStart, day_end: dayEnd }, select: { day_start: true, day_end: true, timezone: true } });
  }

  async getSettings(restaurantId: string) {
    return this.prisma.restaurants.findUnique({ where: { id: restaurantId }, select: { day_start: true, day_end: true, timezone: true } });
  }
}

export type ShiftTransactionClient = Prisma.TransactionClient;
