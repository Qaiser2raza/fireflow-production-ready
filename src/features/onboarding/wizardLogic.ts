// src/features/onboarding/wizardLogic.ts
// Phase 2: pure step-derivation for the first-login wizard. Framework-free
// so sequencing rules are unit-testable without a DOM runner (TD-5).

export interface OnboardingRequirements {
  pin_change_required: boolean;
  profile_fields?: Record<string, boolean>;
}

export type WizardStepId = 'change_pin' | 'profile' | 'review';

export interface WizardStep {
  id: WizardStepId;
  title: string;
  description: string;
}

/**
 * Deterministic step plan from server-reported requirements.
 * Order is fixed: PIN change always precedes profile/review because the
 * server refuses completion while any forced-change flag is outstanding.
 *
 * F-V6: when the tenant is already ACTIVE (onboarding completed by a
 * manager), the profile/review steps are dropped — a forced PIN change is
 * the only outstanding requirement, and non-manager roles cannot call the
 * completion endpoint. Without this, staff hit a dead-end "Insufficient
 * permissions" screen after changing their PIN.
 */
export function deriveWizardSteps(req: OnboardingRequirements, onboardingStatus?: string): WizardStep[] {
  const steps: WizardStep[] = [];
  const tenantActive = onboardingStatus === 'ACTIVE';
  if (req.pin_change_required) {
    steps.push({
      id: 'change_pin',
      title: 'Secure your account',
      description: 'Replace your temporary PIN with one only you know.'
    });
  }
  if (!tenantActive) {
    steps.push({
      id: 'profile',
      title: 'Restaurant details',
      description: 'Confirm the public details of your establishment.'
    });
    steps.push({
      id: 'review',
      title: 'Finish setup',
      description: 'Review and activate your FireFlow workspace.'
    });
  }
  return steps;
}

/** Distinct server error codes mapped to safe, user-facing guidance. */
export function wizardErrorMessage(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'PIN_EXPIRED':
      return 'This PIN has expired and cannot be used. Request a new PIN from FireFlow support.';
    case 'PIN_CHANGE_REQUIRED':
      return 'Change your PIN before finishing setup.';
    case 'SETUP_INCOMPLETE':
      return 'Complete the remaining setup steps first.';
    case 'ALREADY_ACTIVE':
      return 'Setup was already completed. Continuing to your workspace.';
    default:
      return fallback;
  }
}

/** True when the server reports the tenant no longer needs the wizard. */
export function isSetupFinished(status: {
  onboarding_status?: string;
} | undefined, pinChangeRequired?: boolean): boolean {
  return status?.onboarding_status === 'ACTIVE' && pinChangeRequired !== true;
}
