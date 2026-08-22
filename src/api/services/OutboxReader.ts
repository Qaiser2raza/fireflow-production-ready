import { outbox, Prisma } from '@prisma/client';
import { prisma } from '../../shared/lib/prisma';
import { EventBus, DomainEvent } from '../../shared/lib/EventBus';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;
const LEASE_DURATION_MS = 30000;
const BATCH_SIZE = 50;

export class OutboxReader {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;
  private readonly instanceId: string;

  constructor(pollIntervalMs: number = 1000) {
    this.pollIntervalMs = pollIntervalMs;
    this.instanceId = `outbox-reader-${process.pid}-${Math.random().toString(36).substring(2, 8)}`;
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(async () => {
      await this.processOutbox();
    }, this.pollIntervalMs);

    console.log(`[OutboxReader] Started (instance: ${this.instanceId}, interval: ${this.pollIntervalMs}ms)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`[OutboxReader] Stopped`);
    }
  }

  private async processOutbox(): Promise<void> {
    const claimed = await this.claimBatch();
    if (claimed.length === 0) return;

    const eventBus = EventBus.getInstance();

    for (const row of claimed) {
      try {
        const event: DomainEvent = {
          eventId: row.id,
          eventType: row.event_type,
          restaurantId: row.restaurant_id,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          payload: row.payload,
          occurredAt: row.occurred_at
        };

        eventBus.publish(event);

        await this.markProcessed(row.id);
      } catch (error: any) {
        if (this.isNotFoundError(error)) {
          continue;
        }
        await this.markFailed(row.id, error);
      }
    }
  }

  private async claimBatch(): Promise<outbox[]> {
    const now = new Date();
    const leaseExpiry = new Date(Date.now() + LEASE_DURATION_MS);

    const eligibleIds = await prisma.outbox.findMany({
      where: {
        OR: [
          {
            status: 'PENDING',
            available_at: { lte: now },
            OR: [
              { lock_expires_at: null },
              { lock_expires_at: { lte: now } }
            ]
          },
          {
            status: 'PROCESSING',
            lock_expires_at: { lte: now }
          }
        ]
      },
      select: { id: true },
      orderBy: { created_at: 'asc' },
      take: BATCH_SIZE
    });

    if (eligibleIds.length === 0) return [];

    const ids = eligibleIds.map(r => r.id);

    const claimResult = await prisma.outbox.updateMany({
      where: {
        id: { in: ids },
        OR: [
          {
            status: 'PENDING',
            available_at: { lte: now },
            OR: [
              { lock_expires_at: null },
              { lock_expires_at: { lte: now } }
            ]
          },
          {
            status: 'PROCESSING',
            lock_expires_at: { lte: now }
          }
        ]
      },
      data: {
        status: 'PROCESSING',
        lock_owner: this.instanceId,
        lock_expires_at: leaseExpiry,
        attempt_count: {
          increment: 1
        }
      }
    });

    if (claimResult.count === 0) {
      return [];
    }

    const claimed = await prisma.outbox.findMany({
      where: {
        id: { in: ids },
        lock_owner: this.instanceId
      }
    });

    return claimed;
  }

  private async markProcessed(id: string): Promise<void> {
    try {
      await prisma.outbox.update({
        where: { id, status: 'PROCESSING', lock_owner: this.instanceId },
        data: {
          status: 'PROCESSED',
          processed_at: new Date(),
          processed_by: this.instanceId,
          lock_owner: null,
          lock_expires_at: null
        }
      });
    } catch (error: any) {
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }
  }

  private async markFailed(id: string, error: any): Promise<void> {
    const row = await prisma.outbox.findUnique({ where: { id } });
    if (!row || row.lock_owner !== this.instanceId) {
      return;
    }

    const attemptCount = row.attempt_count + 1;
    const isDeadLetter = attemptCount >= MAX_ATTEMPTS;

    if (isDeadLetter) {
      try {
        await prisma.outbox.update({
          where: { id, status: 'PROCESSING', lock_owner: this.instanceId },
          data: {
            status: 'DEAD_LETTER',
            attempt_count: attemptCount,
            last_error: this.sanitizeError(error),
            lock_owner: null,
            lock_expires_at: null
          }
        });
      } catch (updateError: any) {
        if (!this.isNotFoundError(updateError)) {
          console.error(`[OutboxReader] Failed to mark dead letter ${id}:`, updateError);
        }
      }
    } else {
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attemptCount - 1);
      try {
        await prisma.outbox.update({
          where: { id, status: 'PROCESSING', lock_owner: this.instanceId },
          data: {
            status: 'PENDING',
            attempt_count: attemptCount,
            available_at: new Date(Date.now() + backoffMs),
            last_error: this.sanitizeError(error),
            lock_owner: null,
            lock_expires_at: null
          }
        });
      } catch (updateError: any) {
        if (!this.isNotFoundError(updateError)) {
          console.error(`[OutboxReader] Failed to retry ${id}:`, updateError);
        }
      }
    }
  }

  private isNotFoundError(error: any): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
  }

  private sanitizeError(error: any): string {
    const message = error?.message || 'Unknown error';
    return message.length > 500 ? message.substring(0, 500) + '...' : message;
  }
}
