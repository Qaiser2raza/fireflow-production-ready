/**
 * Notification Service
 * Sends bilingual (English/Urdu) SMS/WhatsApp notifications via webhook
 * All functions are non-throwing — failures are logged but don't interrupt flow
 */

export interface NotificationTarget {
  name: string;
  phone: string;
}

/**
 * Sends trial expiration warning (5 days before expiry)
 * @param target - Restaurant name, phone, and days remaining
 */
export async function sendTrialExpiringSoon(
  target: NotificationTarget & { daysLeft: number }
): Promise<void> {
  try {
    if (process.env.NOTIFICATION_ENABLED !== 'true') {
      return;
    }

    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('[NOTIFY] ⚠️ NOTIFICATION_WEBHOOK_URL not configured');
      return;
    }

    const message = `🔔 Fireflow Alert
Your trial for "${target.name}" expires in ${target.daysLeft} days.

فائر فلو اطلاع
"${target.name}" کا ٹرائل ${target.daysLeft} دنوں میں ختم ہو جائے گا۔

Submit payment to continue: Reply RENEW or visit your billing page.`;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: target.phone, message }),
    });

    console.log('[NOTIFY] ✅ Sent to:', target.phone.slice(0, 7) + '***');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[NOTIFY] ⚠️ Failed:', errorMessage);
  }
}

/**
 * Sends trial expiration notification
 * @param target - Restaurant name and phone
 */
export async function sendTrialExpired(target: NotificationTarget): Promise<void> {
  try {
    if (process.env.NOTIFICATION_ENABLED !== 'true') {
      return;
    }

    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('[NOTIFY] ⚠️ NOTIFICATION_WEBHOOK_URL not configured');
      return;
    }

    const message = `⚠️ Fireflow - Trial Expired
Your trial for "${target.name}" has ended. Your system is now locked.

فائر فلو - ٹرائل ختم
"${target.name}" کا ٹرائل ختم ہو گیا۔ سسٹم بند ہو گیا ہے۔

Submit payment proof to restore access immediately.`;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: target.phone, message }),
    });

    console.log('[NOTIFY] ✅ Sent to:', target.phone.slice(0, 7) + '***');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[NOTIFY] ⚠️ Failed:', errorMessage);
  }
}

/**
 * Sends payment received confirmation
 * @param target - Restaurant name, phone, and amount received
 */
export async function sendPaymentReceived(
  target: NotificationTarget & { amount: number }
): Promise<void> {
  try {
    if (process.env.NOTIFICATION_ENABLED !== 'true') {
      return;
    }

    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('[NOTIFY] ⚠️ NOTIFICATION_WEBHOOK_URL not configured');
      return;
    }

    const message = `✅ Fireflow - Payment Received
We received your payment of Rs.${target.amount} for "${target.name}".

فائر فلو - ادائیگی موصول
"${target.name}" کے لیے Rs.${target.amount} موصول ہوئے۔

Verification in progress. Usually done within 12-24 hours.`;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: target.phone, message }),
    });

    console.log('[NOTIFY] ✅ Sent to:', target.phone.slice(0, 7) + '***');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[NOTIFY] ⚠️ Failed:', errorMessage);
  }
}

/**
 * Sends payment verified confirmation with plan details
 * @param target - Restaurant name, phone, and subscription plan
 */
export async function sendPaymentVerified(
  target: NotificationTarget & { plan: string }
): Promise<void> {
  try {
    if (process.env.NOTIFICATION_ENABLED !== 'true') {
      return;
    }

    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('[NOTIFY] ⚠️ NOTIFICATION_WEBHOOK_URL not configured');
      return;
    }

    const message = `🎉 Fireflow - Payment Verified!
Your ${target.plan} subscription for "${target.name}" is now ACTIVE.

فائر فلو - ادائیگی تصدیق!
"${target.name}" کی ${target.plan} سبسکرپشن فعال ہو گئی۔

Thank you! Your system is fully operational.`;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: target.phone, message }),
    });

    console.log('[NOTIFY] ✅ Sent to:', target.phone.slice(0, 7) + '***');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[NOTIFY] ⚠️ Failed:', errorMessage);
  }
}

/**
 * Sends payment rejection notification with optional reason
 * @param target - Restaurant name, phone, and optional rejection reason
 */
export async function sendPaymentRejected(
  target: NotificationTarget & { reason?: string }
): Promise<void> {
  try {
    if (process.env.NOTIFICATION_ENABLED !== 'true') {
      return;
    }

    const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('[NOTIFY] ⚠️ NOTIFICATION_WEBHOOK_URL not configured');
      return;
    }

    const reasonLine = target.reason ? `Reason: ${target.reason}` : '';

    const message = `❌ Fireflow - Payment Issue
We could not verify your payment for "${target.name}".
${reasonLine}

فائر فلو - ادائیگی مسئلہ
"${target.name}" کی ادائیگی تصدیق نہ ہو سکی۔

Please resubmit with correct payment proof.`;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: target.phone, message }),
    });

    console.log('[NOTIFY] ✅ Sent to:', target.phone.slice(0, 7) + '***');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[NOTIFY] ⚠️ Failed:', errorMessage);
  }
}
