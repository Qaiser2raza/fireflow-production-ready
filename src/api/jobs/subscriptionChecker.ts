/**
 * Subscription Checker Job
 * Monitors trial and subscription expiration statuses
 * Runs immediately on startup and then every 24 hours
 * Sends notifications for expiring/expired subscriptions
 * Updates Supabase with new statuses
 */

import { createClient } from '@supabase/supabase-js';
import {
  sendTrialExpiringSoon,
  sendTrialExpired,
  sendPaymentRejected,
} from '../services/notificationService.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Starts the subscription checker job
 * Runs immediately and then every 24 hours
 * Silently returns if Supabase credentials not configured
 */
export function startSubscriptionChecker(): void {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.warn(
      '[SUBSCRIPTION CHECKER] ⚠️ Supabase credentials not configured. Job not started.'
    );
    return;
  }

  async function runCheck(): Promise<void> {
    try {
      console.log(
        '[SUBSCRIPTION CHECKER] 🔄 Running check at',
        new Date().toISOString()
      );

      // Step 1: Find trials expiring in 5 days
      {
        const fiveDaysFromNow = new Date(
          Date.now() + 5 * 24 * 60 * 60 * 1000
        );
        const fiveDaysStart = new Date(fiveDaysFromNow);
        fiveDaysStart.setHours(0, 0, 0, 0);
        const fiveDaysEnd = new Date(fiveDaysFromNow);
        fiveDaysEnd.setHours(23, 59, 59, 999);

        const { data, error } = await supabaseAdmin
          .from('restaurants_cloud')
          .select('name, phone')
          .gte('trial_ends_at', fiveDaysStart.toISOString())
          .lte('trial_ends_at', fiveDaysEnd.toISOString())
          .eq('subscription_status', 'trial');

        if (error) {
          console.warn(
            '[SUBSCRIPTION CHECKER] ⚠️ Error querying trials expiring in 5 days:',
            error.message
          );
        } else if (data) {
          for (const result of data) {
            await sendTrialExpiringSoon({
              name: result.name,
              phone: result.phone,
              daysLeft: 5,
            });
          }
          console.log(
            '[SUBSCRIPTION CHECKER] 📅 Found',
            data.length,
            'trials expiring in 5 days'
          );
        }
      }

      // Step 2: Find trials that expired today
      {
        const now = new Date();
        const { data, error } = await supabaseAdmin
          .from('restaurants_cloud')
          .select('id, name, phone')
          .lt('trial_ends_at', now.toISOString())
          .eq('subscription_status', 'trial');

        if (error) {
          console.warn(
            '[SUBSCRIPTION CHECKER] ⚠️ Error querying expired trials:',
            error.message
          );
        } else if (data) {
          for (const result of data) {
            // Update status to expired
            const { error: updateError } = await supabaseAdmin
              .from('restaurants_cloud')
              .update({ subscription_status: 'expired' })
              .eq('id', result.id);

            if (updateError) {
              console.warn(
                '[SUBSCRIPTION CHECKER] ⚠️ Error updating trial status:',
                updateError.message
              );
            } else {
              // Send notification
              await sendTrialExpired({
                name: result.name,
                phone: result.phone,
              });
            }
          }
          console.log('[SUBSCRIPTION CHECKER] ⛔ Expired', data.length, 'trials');
        }
      }

      // Step 3: Find active subscriptions expiring in 3 days
      {
        const threeDaysFromNow = new Date(
          Date.now() + 3 * 24 * 60 * 60 * 1000
        );
        const threeDaysStart = new Date(threeDaysFromNow);
        threeDaysStart.setHours(0, 0, 0, 0);
        const threeDaysEnd = new Date(threeDaysFromNow);
        threeDaysEnd.setHours(23, 59, 59, 999);

        const { data, error } = await supabaseAdmin
          .from('restaurants_cloud')
          .select('name, phone')
          .gte('subscription_expires_at', threeDaysStart.toISOString())
          .lte('subscription_expires_at', threeDaysEnd.toISOString())
          .eq('subscription_status', 'active');

        if (error) {
          console.warn(
            '[SUBSCRIPTION CHECKER] ⚠️ Error querying subscriptions expiring in 3 days:',
            error.message
          );
        } else if (data) {
          for (const result of data) {
            await sendTrialExpiringSoon({
              name: result.name,
              phone: result.phone,
              daysLeft: 3,
            });
          }
          console.log(
            '[SUBSCRIPTION CHECKER] 📅 Found',
            data.length,
            'subscriptions expiring in 3 days'
          );
        }
      }

      // Step 4: Find active subscriptions that expired
      {
        const now = new Date();
        const { data, error } = await supabaseAdmin
          .from('restaurants_cloud')
          .select('id, name, phone')
          .lt('subscription_expires_at', now.toISOString())
          .eq('subscription_status', 'active');

        if (error) {
          console.warn(
            '[SUBSCRIPTION CHECKER] ⚠️ Error querying expired subscriptions:',
            error.message
          );
        } else if (data) {
          for (const result of data) {
            // Update status to expired
            const { error: updateError } = await supabaseAdmin
              .from('restaurants_cloud')
              .update({ subscription_status: 'expired' })
              .eq('id', result.id);

            if (updateError) {
              console.warn(
                '[SUBSCRIPTION CHECKER] ⚠️ Error updating subscription status:',
                updateError.message
              );
            } else {
              // Send notification
              await sendPaymentRejected({
                name: result.name,
                phone: result.phone,
                reason:
                  'Your subscription has expired. Please renew to restore access.',
              });
            }
          }
          console.log(
            '[SUBSCRIPTION CHECKER] ⛔ Expired',
            data.length,
            'subscriptions'
          );
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[SUBSCRIPTION CHECKER] ❌ Error:', errorMessage);
    }
  }

  // Run immediately
  runCheck();

  // Run every 24 hours (skip in test mode)
  if (process.env.NODE_ENV !== 'test') {
    setInterval(runCheck, 24 * 60 * 60 * 1000);
  }
}
