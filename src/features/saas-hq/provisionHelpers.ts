// src/features/saas-hq/provisionHelpers.ts
// Phase 1 Slice C: pure helpers for the Vault provisioning UI.
// Kept framework-free so they are unit-testable without a DOM runner.

export type InviteState =
  | 'INVITE_PENDING'
  | 'INVITE_SENT'
  | 'INVITE_UNKNOWN'
  | 'INVITE_FAILED_RETRYING'
  | 'INVITE_FAILED_MANUAL';

export interface InviteBadgeMeta {
  label: string;
  className: string;
  retryable: boolean;
}

const BADGE_META: Record<InviteState, InviteBadgeMeta> = {
  INVITE_PENDING: {
    label: 'PENDING',
    className: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    retryable: false,
  },
  INVITE_SENT: {
    label: 'SENT',
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    retryable: false,
  },
  INVITE_UNKNOWN: {
    label: 'VERIFYING',
    className: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    retryable: true,
  },
  INVITE_FAILED_RETRYING: {
    label: 'RETRYING',
    className: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    retryable: true,
  },
  INVITE_FAILED_MANUAL: {
    label: 'ACTION REQUIRED',
    className: 'text-red-400 bg-red-500/10 border-red-500/20',
    retryable: true,
  },
};

export function inviteStateMeta(state: string): InviteBadgeMeta {
  return (
    BADGE_META[state as InviteState] ?? {
      label: state || 'UNKNOWN_STATE',
      className: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
      retryable: false,
    }
  );
}

/** Server-side slug rule mirrored for immediate client feedback only. */
export function isValidSlugFormat(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export interface ProvisionFormInput {
  name: string;
  slug?: string;
  ownerName: string;
  ownerEmail: string;
}

export function validateProvisionForm(input: ProvisionFormInput): string | null {
  if (!input.name.trim()) return 'Restaurant name is required';
  if (!input.ownerName.trim()) return 'Owner name is required';
  const email = input.ownerEmail.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid owner email is required';
  if (input.slug && input.slug.trim() && !isValidSlugFormat(input.slug.trim())) {
    return 'Slug must be lowercase letters/digits separated by single hyphens';
  }
  return null;
}
