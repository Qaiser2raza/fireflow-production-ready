# PIN Hashing Phase 2 – Quick Reference

## 🚀 Execute Migration (One Command)

```bash
npm run migrate:pins
```

**What it does**:
1. ✅ Finds all staff with plaintext PINs
2. ✅ Hashes each PIN with bcrypt (12 rounds, ~50ms per record)
3. ✅ Updates database atomically (all-or-nothing)
4. ✅ Creates audit logs for compliance
5. ✅ Enables bcrypt-based login immediately

---

## 📊 Verify Success

```bash
# Check migration results
SELECT COUNT(*) as migrated_staff 
FROM audit_logs 
WHERE action_type = 'PIN_HASH_MIGRATION';

# See who still needs migration (should be 0)
SELECT COUNT(*) as unmigrated_staff 
FROM staff 
WHERE pin IS NOT NULL AND hashed_pin IS NULL;
```

---

## 🧪 Test Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"pin": "1234"}'

# Expected: { "success": true, "staff": {...} }
# Check logs: Should show bcrypt method, no warnings
```

---

## ⏳ 48-Hour Monitoring Checklist

- [ ] Migration completed (0 errors)
- [ ] Test login works (bcrypt method)
- [ ] Audit logs show PIN_HASH_MIGRATION entries
- [ ] No legacy auth warnings in logs
- [ ] Login success rate = 100% (no new 401 errors)
- [ ] Monitor for 48 hours

---

## 🧹 After 48 Hours (Cleanup)

```bash
# Create cleanup migration to drop plaintext pin column
npx prisma migrate dev --name drop_plaintext_pin

# This removes the grace period fallback (irreversible!)
# Only do this after confirmed 48h monitoring
```

---

## 🔄 Tech Stack

| Layer | Technology |
|-------|------------|
| **Hashing** | bcrypt, 12 rounds |
| **Database** | PostgreSQL transactions (SERIALIZABLE) |
| **Atomicity** | Prisma $transaction |
| **Audit Trail** | audit_logs table |
| **Grace Period** | Plaintext fallback (48h) |
| **Login Latency** | +50–100ms (acceptable) |

---

## 🛡️ If Something Goes Wrong

| Scenario | Action |
|----------|--------|
| **Migration fails** | No DB changes (rollback). Retry: `npm run migrate:pins` |
| **Login issues** | Check if `hashed_pin` is NULL. Falls back to plaintext. |
| **Plaintext warnings** | Normal during grace period. Should stop after 48h. |
| **Can't drop pin column** | Wait longer. All staff must be migrated first. |

---

## 📝 Implementation Status

```
✅ Schema: hashed_pin column added
✅ Login: Grace period enabled (bcrypt preferred, plaintext fallback)
✅ Script: Production-ready with atomicity & rollback safety
✅ Audit: PIN_HASH_MIGRATION logging enabled
✅ bcrypt: Already installed (v5.1.1)
✅ Documentation: Complete
```

**Ready to execute Phase 2 Milestone 1** 🚀

---

See full implementation details: [PIN_HASHING_PHASE2_IMPLEMENTATION.md](PIN_HASHING_PHASE2_IMPLEMENTATION.md)
