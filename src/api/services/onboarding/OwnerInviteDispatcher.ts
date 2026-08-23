// src/api/services/onboarding/OwnerInviteDispatcher.ts
// Phase 1 slice B: consumes provisioning intents toward Supabase.
//
// Claim model (documented deviation, approved conditions preserved): the
// generic OutboxReader already claims ALL outbox rows and marks them PROCESSED
// after in-memory EventBus publish, so a second row-level consumer would race
// it. This dispatcher therefore treats the outbox rows as the durable record
// of intent and claims WORK FROM STATE instead:
//   - owner_invites.state ∈ {PENDING, UNKNOWN, FAILED_RETRYING}   (invite work)
//   - restaurants.cloud_synced_at IS NULL + has an owner_invite    (mirror work)
// Every property of the required contract holds: idempotency key = invite_id /
// restaurant_id; optimistic state-guarded transitions; a provider timeout or
// dropped connection resolves to UNKNOWN — never failure — and reconciles via
// lookup before any duplicate create.
import { prisma } from '../../../shared/lib/prisma';
import {
  CloudRegisterPort,
  SupabaseInvitePort,
  supabaseAdminService,
} from '../platform/SupabaseAdminService';

const MAX_INVITE_ATTEMPTS = 5;

export interface DispatcherPorts {
  invite: SupabaseInvitePort;
  cloud: CloudRegisterPort;
  isConfigured(): boolean;
}

function defaultPorts(): DispatcherPorts {
  const svc = supabaseAdminService;
  return { invite: svc, cloud: svc, isConfigured: () => svc.isConfigured() };
}

export class OwnerInviteDispatcher {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs: number;
  private readonly ports: DispatcherPorts;
  private loggedIdle = false;

  constructor(ports?: Partial<DispatcherPorts>, pollIntervalMs: number = 2000) {
    const defaults = defaultPorts();
    this.ports = {
      invite: ports?.invite ?? defaults.invite,
      cloud: ports?.cloud ?? defaults.cloud,
      isConfigured: ports?.isConfigured ?? defaults.isConfigured,
    };
    this.pollIntervalMs = pollIntervalMs;
  }

  start(): void {
    if (this.intervalId) return;
    if (!this.ports.isConfigured()) {
      if (!this.loggedIdle) {
        console.log('[OWNER-INVITE] Idle: Supabase credentials not configured; invites stay PENDING');
        this.loggedIdle = true;
      }
      return;
    }
    this.intervalId = setInterval(() => {
      void this.processOnce();
    }, this.pollIntervalMs);
    console.log(`[OWNER-INVITE] Started (interval: ${this.pollIntervalMs}ms)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[OWNER-INVITE] Stopped');
    }
  }

  /** One deterministic sweep pass. Returns processed work counts. */
  async processOnce(): Promise<{ invites: number; registrations: number }> {
    const dueInvites = await prisma.owner_invites.findMany({
      where: { state: { in: ['INVITE_PENDING', 'INVITE_UNKNOWN', 'INVITE_FAILED_RETRYING'] } },
      orderBy: { updated_at: 'asc' },
      take: 25,
    });

    let invites = 0;
    for (const invite of dueInvites) {
      await this.processInvite(invite.id);
      invites++;
    }

    const unmirrored = await prisma.restaurants.findMany({
      where: { cloud_synced_at: null, owner_invites: { some: {} } },
      select: { id: true, name: true, slug: true, phone: true, subscription_plan: true },
      take: 25,
    });

    let registrations = 0;
    for (const r of unmirrored) {
      await this.processRegistration(r);
      registrations++;
    }

    return { invites, registrations };
  }

  /**
   * Idempotent invite drive keyed by invite_id. Transitions are guarded by the
   * state observed at selection time so concurrent sweeps or a manual action
   * cannot be clobbered.
   */
  async processInvite(inviteId: string): Promise<void> {
    const invite = await prisma.owner_invites.findUnique({ where: { id: inviteId } });
    if (!invite) return;
    if (invite.state === 'INVITE_SENT' || invite.state === 'INVITE_FAILED_MANUAL') return;

    // ---- UNKNOWN first means RECONCILE, never blind re-create ----
    if (invite.state === 'INVITE_UNKNOWN') {
      const lookup = await this.ports.invite.findUserIdByEmail(invite.email);
      if (lookup.outcome === 'FOUND') {
        await this.transition(invite.id, invite.state, 'INVITE_SENT', null, lookup.userId, true);
        return;
      }
      if (lookup.outcome === 'UNKNOWN') {
        // Stay recoverable; next sweep retries according to policy.
        await prisma.owner_invites.update({
          where: { id: invite.id, state: 'INVITE_UNKNOWN' },
          data: { updated_at: new Date() },
        }).catch(() => { });
        return;
      }
      // NOT_FOUND → fall through and (re-)issue the creation attempt.
    }

    const attemptNo = invite.attempt_count + 1;
    const created = await this.ports.invite.createUser(invite.email, {
      restaurant_id: invite.restaurant_id,
      invite_id: invite.id,
      restaurant_name: undefined,
    });

    switch (created.outcome) {
      case 'SENT':
        await this.transition(invite.id, invite.state, 'INVITE_SENT', null, created.userId, true, attemptNo);
        break;
      case 'ALREADY_PRESENT':
        // Known-negative: an account already exists for this email. Human must
        // decide (owner identity safety) — never auto-attach a tenant to it.
        await this.transition(invite.id, invite.state, 'INVITE_FAILED_MANUAL', 'SUPABASE_DUPLICATE_EMAIL', undefined, false, attemptNo);
        break;
      case 'RETRYABLE':
        if (attemptNo >= MAX_INVITE_ATTEMPTS) {
          await this.transition(invite.id, invite.state, 'INVITE_FAILED_MANUAL', 'MAX_ATTEMPTS_EXHAUSTED', undefined, false, attemptNo);
        } else {
          await this.transition(invite.id, invite.state, 'INVITE_FAILED_RETRYING', created.code, undefined, false, attemptNo);
        }
        break;
      case 'UNKNOWN':
        // Timeout / dropped connection: outcome genuinely unknown. Recoverable
        // and reconciliable — NEVER recorded as definitive failure.
        await this.transition(invite.id, invite.state, 'INVITE_UNKNOWN', created.code, undefined, false, attemptNo);
        break;
    }
  }

  /** Manual recovery: reset any terminal/unknown invite for another drive. */
  async manualRetry(inviteId: string, actorNote: string): Promise<{ ok: boolean; state?: string; error?: string }> {
    const invite = await prisma.owner_invites.findUnique({ where: { id: inviteId } });
    if (!invite) return { ok: false, error: 'Invite not found' };
    if (!['INVITE_FAILED_MANUAL', 'INVITE_UNKNOWN', 'INVITE_FAILED_RETRYING'].includes(invite.state)) {
      return { ok: false, error: `Invite in state ${invite.state}; retry not applicable` };
    }

    await prisma.owner_invites.update({
      where: { id: invite.id },
      data: { state: 'INVITE_PENDING', attempt_count: 0, last_error: null, updated_at: new Date() },
    });

    await prisma.audit_logs.create({
      data: {
        restaurant_id: invite.restaurant_id,
        action_type: 'OWNER_INVITE_MANUAL_RETRY',
        entity_type: 'OWNER_INVITE',
        entity_id: invite.id,
        details: { previous_state: invite.state, previous_error: invite.last_error, note: actorNote },
        performed_by_role: 'SUPER_ADMIN',
      },
    });

    return { ok: true, state: 'INVITE_PENDING' };
  }

  /** Idempotent cloud mirror registration keyed by restaurant_id. */
  async processRegistration(r: {
    id: string; name: string; slug: string | null;
    phone: string | null; city?: string | null; subscription_plan: string;
  }): Promise<void> {
    if (!r.slug) {
      // Phase 1 mirror requires a slug (public-surface key). Leave unsynced.
      return;
    }

    const existing = await this.ports.cloud.findCloudRestaurant(r.id);
    if ('found' in existing && existing.found) {
      await prisma.restaurants.update({ where: { id: r.id }, data: { cloud_synced_at: new Date() } }).catch(() => { });
      return;
    }
    if ('unknown' in existing && existing.unknown) {
      return; // transient provider ambiguity — retry next sweep
    }

    const result = await this.ports.cloud.createCloudRestaurant({
      restaurant_id: r.id,
      name: r.name,
      slug: r.slug,
      phone: r.phone,
      city: r.city,
      subscription_plan: r.subscription_plan,
    });

    if (result.outcome === 'REGISTERED' || result.outcome === 'ALREADY_PRESENT') {
      await prisma.restaurants.update({ where: { id: r.id }, data: { cloud_synced_at: new Date() } }).catch(() => { });
    }
    // RETRYABLE / UNKNOWN → remain unsynced; swept again next pass.
  }

  /**
   * Optimistic transition: the WHERE clause repeats the expected source state,
   * so a concurrent sweep, manual retry, or reconciliation win cannot be
   * overwritten by a stale in-flight result.
   */
  private async transition(
    inviteId: string,
    expectedState: string,
    nextState: string,
    sanitizedError: string | null,
    supabaseUserId?: string,
    invitedOk?: boolean,
    attemptCount?: number,
  ): Promise<void> {
    const data: any = {
      state: nextState,
      last_error: sanitizedError,
      updated_at: new Date(),
    };
    if (supabaseUserId !== undefined) data.supabase_user_id = supabaseUserId;
    if (invitedOk) data.invited_at = new Date();
    if (attemptCount !== undefined) data.attempt_count = attemptCount;

    try {
      await prisma.owner_invites.updateMany({
        where: { id: inviteId, state: expectedState },
        data,
      });
    } catch (e: any) {
      console.error('[OWNER-INVITE] transition failed:', e?.message);
    }
  }
}

export const ownerInviteDispatcher = new OwnerInviteDispatcher(supabaseAdminService);
