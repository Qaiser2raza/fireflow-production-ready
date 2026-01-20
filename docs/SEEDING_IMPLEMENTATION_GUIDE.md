## 🚀 Production-Grade Seeding Implementation Guide

This guide walks you through implementing the idempotent seeding fix step-by-step. Once complete, your seeding will be **safe, repeatable, and duplicate-free**.

---

## 📋 What's Changed

### 1. ✅ **Prisma Schema Updates** ([prisma/schema.prisma](prisma/schema.prisma))
Added unique constraints to prevent database-level duplicates:

```prisma
// sections table now has:
@@unique([restaurant_id, name])

// tables table now has:
@@unique([restaurant_id, name])

// staff table now has:
@@unique([restaurant_id, name, role])
```

**Why**: These constraints ensure PostgreSQL rejects duplicate inserts automatically.

---

### 2. ✅ **Improved Seed Endpoint** ([src/api/server.ts](src/api/server.ts))
Changed from `.create()` (throws error on duplicate) to idempotent logic using:
- **Check first**: Look for existing "Main Hall" section
- **Skip if exists**: Return success without duplicating
- **Use upsert**: For categories, sections, tables → safe re-runs
- **Find + create fallback**: For menu items (until unique constraint added)

**Key improvements**:
```typescript
// BEFORE: Always creates → errors on duplicate
const mainHall = await prisma.sections.create({...});

// AFTER: Safe upsert → skips if exists
const mainHall = await prisma.sections.upsert({
  where: { restaurant_id_name: { restaurant_id, name: 'Main Hall' } },
  update: {},
  create: {...}
});
```

---

### 3. ✅ **UI/UX Improvements** ([src/features/settings/SettingsView.tsx](src/features/settings/SettingsView.tsx))

**Before**: Scary red "Reseed Database" button with vague warning
```
❌ WARNING: This will overwrite or reset your database with default data. Continue?
```

**After**: Friendly blue "Seed Sample Data" button with clear intent
```
✅ Add sample data if missing.
   Already existing data will NOT be duplicated.
   Continue?
```

**Plus**:
- Loading spinner while seeding
- Success/error message feedback
- Auto-hides message after 5 seconds
- Button disabled during seeding
- Clear status indicators

---

### 4. ✅ **Cleanup Script** ([scripts/cleanup-duplicates.sql](scripts/cleanup-duplicates.sql))
One-time SQL script to remove existing duplicates from your development database.

---

## 🔧 Implementation Steps (15-20 minutes)

### Step 1: Run Prisma Migration
```bash
# Add unique constraints to database schema
npx prisma migrate dev --name add_seed_uniqueness_constraints

# or if you just want to push without creating new migration:
# npx prisma db push
```

**Expected output**:
```
✓ Created migration: migrations/xxx_add_seed_uniqueness_constraints
```

---

### Step 2: Clean Up Existing Duplicates
**⚠️ IMPORTANT: Do this BEFORE running the new seed endpoint**

1. **Open pgAdmin** (or psql terminal)
   - Navigate to: `fireflow_local` database
   - Open SQL editor

2. **Run the cleanup script**:
   - Open: [scripts/cleanup-duplicates.sql](scripts/cleanup-duplicates.sql)
   - Copy ALL the SQL
   - Paste into pgAdmin
   - Execute

3. **Verify cleanup**:
   - Run the verification queries at the bottom of the script
   - You should see **0 results** for duplicates

---

### Step 3: Test the New Seed Endpoint
**Do this AFTER cleanup is complete**

1. **Start your dev server**:
   ```bash
   npm run dev
   ```

2. **Navigate to Settings** (Manager only)
   - Click **"Seed Sample Data"** button
   - You should see: ✅ "Sample data added successfully"

3. **Run it AGAIN** (test idempotency):
   - Click the button again
   - You should see: ✅ "Already seeded - skipped duplicate (safe & idempotent)"

4. **Verify in UI**:
   - Go to Zones → should show only ONE "Main Hall" (not 3)
   - Go to Tables → should show only T-1, T-2, T-3 (not duplicates)
   - Go to Personnel → should show only ONE "Admin Manager"

---

## 📊 What Each File Does

| File | Purpose | Status |
|------|---------|--------|
| `prisma/schema.prisma` | Database schema with unique constraints | ✅ Updated |
| `src/api/server.ts` | Idempotent seed endpoint | ✅ Updated |
| `src/features/settings/SettingsView.tsx` | Better UI + feedback | ✅ Updated |
| `scripts/cleanup-duplicates.sql` | One-time duplicate cleanup | ✅ Created |

---

## 🧪 Testing Checklist

- [ ] Migration runs successfully (`npx prisma migrate dev`)
- [ ] Cleanup script runs without errors
- [ ] First seed click: Returns "Sample data added successfully"
- [ ] Second seed click: Returns "Already seeded - skipped duplicate"
- [ ] UI shows only ONE Main Hall zone
- [ ] UI shows T-1, T-2, T-3 tables (no duplicates)
- [ ] UI shows only ONE Admin Manager in Personnel
- [ ] Reseed works 3+ times without creating duplicates
- [ ] Database integrity maintained (no orphaned records)

---

## 🔍 Verification Queries

Run these in pgAdmin to verify everything is correct:

```sql
-- Check sections (should show 1 Main Hall per restaurant)
SELECT restaurant_id, name, COUNT(*) FROM sections 
GROUP BY restaurant_id, name 
ORDER BY restaurant_id, name;

-- Check tables (should show unique names per restaurant)
SELECT restaurant_id, name, COUNT(*) FROM tables 
GROUP BY restaurant_id, name 
ORDER BY restaurant_id, name;

-- Check staff (should show unique name+role per restaurant)
SELECT restaurant_id, name, role, COUNT(*) FROM staff 
GROUP BY restaurant_id, name, role 
ORDER BY restaurant_id, name, role;
```

All results should show `COUNT(*) = 1` (no duplicates).

---

## ⚡ Pro Tips

1. **For multiple restaurants**: Each restaurant can be seeded independently - the constraints are per-restaurant
2. **Safe to run repeatedly**: After first seed, subsequent runs are instant (early return)
3. **Backward compatible**: Existing data is untouched, only new data is added
4. **Debugging**: Check server logs for:
   - `✅ Restaurant already seeded - skipping`
   - `✅ Seeded restaurant successfully`

---

## 🚨 Troubleshooting

### Issue: Migration fails with "duplicate key"
**Solution**: Run cleanup SQL script BEFORE migration
```sql
-- In pgAdmin, delete existing duplicates first
DELETE FROM sections WHERE restaurant_id_name not in (
  SELECT MIN(id) FROM sections GROUP BY restaurant_id, name
);
```

### Issue: Seed button shows error after first run
**Solution**: The cleanup script wasn't run. Do:
1. Stop server
2. Run `scripts/cleanup-duplicates.sql`
3. Start server again
4. Click seed again

### Issue: "Already seeded" appears immediately on first seed
**Solution**: Database already has Main Hall section. Run cleanup script to verify state.

---

## 📚 Next Steps

1. ✅ Run migration
2. ✅ Clean up duplicates
3. ✅ Test seeding (3-4 times)
4. ✅ Verify UI shows clean data
5. 🎉 Enjoy production-grade seeding!

---

**Questions?** Check `PROJECT_CONTEXT.md` for overall architecture or review the code changes inline.
