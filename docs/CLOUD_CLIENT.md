# Fireflow Cloud Client - SaaS Management Documentation

## Overview

The **Cloud Client** (`src/shared/lib/cloudClient.ts`) is a separate, optional Supabase integration for **SaaS operations ONLY**:
- License key management
- Subscription tracking
- Payment verification
- Trial period management

**IMPORTANT:** This is completely separate from the **operational database** (PostgreSQL + Prisma) which handles orders, staff, tables, etc.

## Architecture

```
┌─────────────────────────────────────┐
│     Fireflow Application            │
├─────────────────────────────────────┤
│                                      │
│  ┌──────────────────────────────┐   │
│  │  Local Database (server.ts)  │   │  ← Operational Data
│  │  PostgreSQL via Prisma       │   │     (Orders, Staff, Tables, etc.)
│  │  - localhost:5432            │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  Cloud Client (cloudClient.ts)   │  ← SaaS Operations
│  │  Supabase PostgreSQL         │   │     (Licenses, Subscriptions, Payments)
│  │  - VITE_SUPABASE_URL         │   │
│  └──────────────────────────────┘   │
│                                      │
└─────────────────────────────────────┘
```

## Configuration

### Environment Variables

Add to `.env` or `.env.local`:

```dotenv
# Cloud SaaS Operations (Optional)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Note:** If not configured, the app works in **local-only mode** without cloud features.

## API Functions

### 1. License Key Management

#### `checkLicenseKey(key: string)`
Validates a license key before activation.

```typescript
const result = await checkLicenseKey('FIREFLOW-ABC123-XYZ789');

if (result.error) {
  console.error(result.error); // "License key already active"
} else {
  console.log(result.data.plan); // "BASIC", "STANDARD", or "PREMIUM"
}
```

**Returns:**
```typescript
{
  data: {
    id: string;
    key: string;
    plan: 'BASIC' | 'STANDARD' | 'PREMIUM';
    status: 'unused' | 'active' | 'revoked';
  } | null;
  error: string | null;
}
```

---

#### `activateLicenseKey(key: string, restaurantId: string)`
Activates a license key and links it to a restaurant.

```typescript
const result = await activateLicenseKey(
  'FIREFLOW-ABC123-XYZ789',
  '52a3b890-3a2d-4b8e-8c90-cf94ade2be9c'
);

if (!result.error) {
  console.log('License activated on:', result.data?.activated_at);
}
```

**Returns:**
```typescript
{
  data: {
    id: string;
    key: string;
    restaurant_id: string;
    activated_at: string; // ISO timestamp
  } | null;
  error: string | null;
}
```

---

### 2. Restaurant Registration

#### `registerRestaurant(data: RestaurantRegistrationData)`
Registers a restaurant in the cloud SaaS system.

```typescript
const result = await registerRestaurant({
  restaurantId: '52a3b890-3a2d-4b8e-8c90-cf94ade2be9c',
  name: 'Karachi Kitchen',
  phone: '+923001234567',
  city: 'Karachi',
  slug: 'karachi-kitchen',
  subscriptionPlan: 'STANDARD'
});

if (!result.error) {
  console.log('Trial ends on:', result.data?.trial_ends_at);
}
```

**Returns:**
```typescript
{
  data: {
    id: string;
    restaurant_id: string;
    name: string;
    subscription_status: 'trial' | 'active' | 'expired';
    trial_ends_at: string; // ISO timestamp (30 days from now)
  } | null;
  error: string | null;
}
```

**Automatic behavior:**
- Creates 30-day trial period
- Sets subscription plan
- Links to local restaurant_id

---

### 3. Subscription Management

#### `getSubscriptionStatus(restaurantId: string)`
Fetches current subscription status and expiry information.

```typescript
const result = await getSubscriptionStatus(
  '52a3b890-3a2d-4b8e-8c90-cf94ade2be9c'
);

if (!result.error) {
  const { status, plan, expiryDate, monthlyFee } = result.data!;
  
  if (status === 'expired') {
    console.log('Subscription expired on:', expiryDate);
  }
}
```

**Returns:**
```typescript
{
  data: {
    status: 'trial' | 'active' | 'expired';
    plan: 'BASIC' | 'STANDARD' | 'PREMIUM';
    expiryDate: string | null; // ISO timestamp
    monthlyFee: number; // in PKR
    currency: string; // "PKR"
    trialEndsAt: string | null;
  } | null;
  error: string | null;
}
```

**Status Logic:**
- Trial period: Checks against `trial_ends_at`
- Active subscription: Checks against `subscription_expires_at`
- Auto-marks as expired if dates have passed

---

### 4. Payment Operations

#### `submitPaymentProof(restaurantId: string, proofUrl: string, amount: number)`
Submits payment proof for manual verification.

```typescript
const result = await submitPaymentProof(
  '52a3b890-3a2d-4b8e-8c90-cf94ade2be9c',
  'https://supabase-storage-url/payment-proof.jpg',
  9999 // Rs. 9,999
);

if (!result.error) {
  console.log('Payment recorded:', result.data?.id);
  console.log('Status: PENDING - awaiting admin verification');
}
```

**Returns:**
```typescript
{
  data: {
    id: string;
    restaurant_id: string;
    amount: number;
    status: 'pending' | 'verified' | 'rejected';
    created_at: string;
  } | null;
  error: string | null;
}
```

**Workflow:**
1. Customer uploads proof file (should upload to Supabase Storage first)
2. Call `submitPaymentProof()` with proof URL
3. Payment status = "pending"
4. Admin verifies in dashboard
5. Status updated to "verified" or "rejected"

---

## Subscription Plans & Pricing

| Plan | Monthly Fee | Features |
|------|------------|----------|
| **BASIC** | Rs. 4,999 | Basic POS operations |
| **STANDARD** | Rs. 9,999 | Standard features + Reports |
| **PREMIUM** | Rs. 19,999 | All features + Support |

## Database Schema

### Cloud Tables (Supabase)

#### `license_keys`
```sql
id UUID (PK)
key VARCHAR UNIQUE
plan VARCHAR (BASIC | STANDARD | PREMIUM)
status VARCHAR (unused | active | revoked)
restaurant_id UUID (FK to restaurants_cloud)
created_at TIMESTAMP
activated_at TIMESTAMP
```

#### `restaurants_cloud`
```sql
id UUID (PK)
restaurant_id UUID UNIQUE (from local DB)
name VARCHAR
phone VARCHAR
city VARCHAR
slug VARCHAR UNIQUE
subscription_plan VARCHAR
subscription_status VARCHAR (trial | active | expired)
trial_ends_at TIMESTAMP
subscription_expires_at TIMESTAMP
monthly_fee DECIMAL
currency VARCHAR
created_at TIMESTAMP
```

#### `subscription_payments`
```sql
id UUID (PK)
restaurant_id UUID (FK)
amount DECIMAL
payment_method VARCHAR
payment_proof_url VARCHAR
status VARCHAR (pending | verified | rejected)
transaction_id VARCHAR
notes TEXT
created_at TIMESTAMP
verified_at TIMESTAMP
```

---

## Setup Instructions

### 1. Create Supabase Project
- Go to https://supabase.com
- Create new project
- Note the **Project URL** and **Anon Key**

### 2. Run Migration
```bash
# In Supabase dashboard:
# 1. Go to SQL Editor
# 2. Create new query
# 3. Copy content from: supabase/saas_schema.sql
# 4. Execute
```

### 3. Configure Environment
```bash
cp .env.example .env.local

# Edit .env.local and add:
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### 4. Test Connection
```typescript
import { getSupabaseClient } from '@/shared/lib/cloudClient';

const client = getSupabaseClient();
// If no error, connection is working
```

---

## Integration Examples

### Example: Onboarding Flow

```typescript
import {
  checkLicenseKey,
  activateLicenseKey,
  registerRestaurant
} from '@/shared/lib/cloudClient';

async function onboardNewRestaurant(
  licenseKey: string,
  restaurantData: RestaurantRegistrationData
) {
  // 1. Verify license key
  const checkResult = await checkLicenseKey(licenseKey);
  if (checkResult.error) {
    throw new Error(`Invalid license: ${checkResult.error}`);
  }

  // 2. Register in cloud system
  const registerResult = await registerRestaurant(restaurantData);
  if (registerResult.error) {
    throw new Error(`Registration failed: ${registerResult.error}`);
  }

  // 3. Activate license key
  const activateResult = await activateLicenseKey(
    licenseKey,
    restaurantData.restaurantId
  );
  if (activateResult.error) {
    throw new Error(`Activation failed: ${activateResult.error}`);
  }

  console.log('✅ Restaurant onboarded successfully');
  console.log(`Trial expires: ${registerResult.data?.trial_ends_at}`);
  
  return {
    restaurant: registerResult.data,
    license: activateResult.data
  };
}
```

---

### Example: Check Subscription Before Operations

```typescript
import { getSubscriptionStatus } from '@/shared/lib/cloudClient';

async function canRestaurantOperate(restaurantId: string): Promise<boolean> {
  const result = await getSubscriptionStatus(restaurantId);
  
  if (result.error) {
    console.error('Could not verify subscription:', result.error);
    return false; // Assume no access on error
  }

  if (result.data?.status === 'expired') {
    return false; // Subscription expired
  }

  return true; // trial or active
}
```

---

## Error Handling

All functions follow the `{ data, error }` pattern:

```typescript
const result = await checkLicenseKey('INVALID-KEY');

// Always check error first
if (result.error) {
  // Handle error
  console.error(result.error);
} else {
  // Use data (guaranteed non-null if no error)
  console.log(result.data.plan);
}
```

---

## Troubleshooting

### "Supabase credentials not configured"
- Ensure `.env` or `.env.local` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Restart dev server after env changes

### "License key not found"
- Verify key exists in Supabase dashboard
- Check case sensitivity (keys are uppercase)
- Ensure key status is "unused"

### Network errors
- Check internet connection
- Verify Supabase project is active
- Check browser console for CORS issues

---

## Important Notes

✅ **What stays local:**
- Orders, menu items, staff data
- Tables, sections, floor management
- All operational data

✅ **What goes to cloud:**
- License keys
- Subscription status
- Payment records
- Trial tracking

🚀 **The app works without Supabase!**
If Supabase isn't configured, all cloud operations fail gracefully and the app continues operating in local-only mode.

---

## File Structure

```
src/
├── shared/
│   └── lib/
│       └── cloudClient.ts        ← Cloud SaaS client
├── vite-env.d.ts                 ← Type definitions
└── api/
    └── server.ts                 ← Untouched (local DB only)

supabase/
└── saas_schema.sql               ← Cloud schema migration

.env.example                       ← Updated with Supabase vars
```

---

## References

- [Supabase Docs](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Fireflow Architecture](../docs/ARCHITECTURE.md)
