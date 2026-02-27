# Cloud Client - Quick Reference

## Files Created

✅ `src/shared/lib/cloudClient.ts` - Main cloud client (470+ lines)
✅ `src/vite-env.d.ts` - TypeScript environment type definitions  
✅ `supabase/saas_schema.sql` - Database schema for Supabase
✅ `docs/CLOUD_CLIENT.md` - Complete documentation
✅ `.env.example` - Updated with Supabase config

## What the Cloud Client Does

**SaaS Operations ONLY** (separate from local operational database):
- License key validation & activation
- Restaurant registration
- Subscription status tracking
- Payment proof submission

## Quick Start

### 1. Environment Setup
```bash
# Add to .env.local
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_key_here
```

### 2. Create Supabase Project
- Visit https://supabase.com
- Create project
- Run SQL from `supabase/saas_schema.sql`

### 3. Use in Components
```typescript
import {
  checkLicenseKey,
  activateLicenseKey,
  registerRestaurant,
  getSubscriptionStatus,
  submitPaymentProof
} from '@/shared/lib/cloudClient';

// All functions return { data, error } pattern
const result = await checkLicenseKey('FIREFLOW-ABC123-XYZ789');
if (result.error) {
  console.error(result.error);
} else {
  console.log(result.data.plan); // "BASIC" | "STANDARD" | "PREMIUM"
}
```

## Key Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `checkLicenseKey(key)` | Validate unused key | `{ data: key details \| null, error }` |
| `activateLicenseKey(key, restaurantId)` | Link key to restaurant | `{ data: activation info \| null, error }` |
| `registerRestaurant(data)` | Create cloud record | `{ data: restaurant info \| null, error }` |
| `getSubscriptionStatus(restaurantId)` | Check expiry/status | `{ data: status info \| null, error }` |
| `submitPaymentProof(restaurantId, proofUrl, amount)` | Submit payment | `{ data: payment record \| null, error }` |

## Pricing Tiers

- **BASIC**: Rs. 4,999/month
- **STANDARD**: Rs. 9,999/month  
- **PREMIUM**: Rs. 19,999/month

## Architecture

```
Local DB (PostgreSQL)         Cloud DB (Supabase)
├─ orders                     ├─ license_keys
├─ staff                      ├─ restaurants_cloud
├─ tables                     └─ subscription_payments
└─ menu_items
```

✅ **Local DB**: Operational data (untouched by cloud client)
✅ **Cloud DB**: SaaS management data only

## Error Handling

All functions return errors gracefully:
```typescript
const result = await getSubscriptionStatus(restaurantId);
if (result.error) {
  // Handle error (missing config, network, etc.)
  return;
}
// result.data is guaranteed non-null here
```

## Testing the Connection

```typescript
import { getSupabaseClient } from '@/shared/lib/cloudClient';

try {
  const client = getSupabaseClient();
  console.log('✅ Cloud client ready');
} catch (error) {
  console.log('⚠️ Cloud client not configured (local-only mode)');
}
```

## Important Notes

🔒 **Security**: Supabase Anon Key is safe for client-side (public)
📱 **Optional**: App works without Supabase (local-only mode)
🔄 **Separate**: Cloud client never touches local operational database
✅ **TypeScript**: Fully typed with interfaces for all operations

## Files NOT Modified

✅ `src/api/server.ts` - Local DB operations
✅ `src/shared/lib/db.ts` - Untouched  
✅ All existing components - Untouched

---

## Next Steps

1. Create Supabase project at https://supabase.com
2. Run `supabase/saas_schema.sql` in Supabase SQL editor
3. Add credentials to `.env.local`
4. Restart dev server
5. Start using cloud functions in components

See `docs/CLOUD_CLIENT.md` for detailed documentation.
