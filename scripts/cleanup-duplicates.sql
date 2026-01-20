-- ================================================================
-- CLEANUP SCRIPT: Remove Duplicate Seed Data
-- ================================================================
-- This script removes duplicate sections, tables, and staff entries
-- that were created by running seed operations multiple times.
--
-- USAGE:
-- 1. Connect to fireflow_local database in pgAdmin or psql
-- 2. Run this entire script
-- 3. After cleanup, run seed-restaurant endpoint again → should skip (already seeded)
--
-- SAFETY: This keeps the FIRST entry of each duplicate set
-- ================================================================

-- ⚠️ OPTIONAL: Backup before running (do this in separate query window first)
-- SELECT * INTO public.sections_backup FROM public.sections;
-- SELECT * INTO public.tables_backup FROM public.tables;
-- SELECT * INTO public.staff_backup FROM public.staff;

-- ================================================================
-- 1. DELETE DUPLICATE SECTIONS (keep first by id)
-- ================================================================
-- Find duplicates: SELECT restaurant_id, name, COUNT(*) FROM sections 
-- GROUP BY restaurant_id, name HAVING COUNT(*) > 1;

DELETE FROM sections
WHERE id NOT IN (
  SELECT MIN(id)
  FROM sections
  WHERE restaurant_id IS NOT NULL
  GROUP BY restaurant_id, name
);

COMMIT;
RAISE NOTICE 'Deleted duplicate sections';

-- ================================================================
-- 2. DELETE DUPLICATE TABLES (keep first by id)
-- ================================================================
-- Find duplicates: SELECT restaurant_id, name, COUNT(*) FROM tables 
-- GROUP BY restaurant_id, name HAVING COUNT(*) > 1;

DELETE FROM tables
WHERE id NOT IN (
  SELECT MIN(id)
  FROM tables
  GROUP BY restaurant_id, name
);

COMMIT;
RAISE NOTICE 'Deleted duplicate tables';

-- ================================================================
-- 3. DELETE DUPLICATE STAFF (Admin Manager, keep first by id)
-- ================================================================
-- Find duplicates: SELECT restaurant_id, name, role, COUNT(*) FROM staff 
-- GROUP BY restaurant_id, name, role HAVING COUNT(*) > 1;

DELETE FROM staff
WHERE id NOT IN (
  SELECT MIN(id)
  FROM staff
  WHERE restaurant_id IS NOT NULL
  GROUP BY restaurant_id, name, role
);

COMMIT;
RAISE NOTICE 'Deleted duplicate staff entries';

-- ================================================================
-- VERIFICATION QUERIES (run these to confirm cleanup)
-- ================================================================
-- Run these queries AFTER running the deletes to verify no duplicates remain:

-- Check sections for duplicates:
-- SELECT restaurant_id, name, COUNT(*) as count FROM sections 
-- GROUP BY restaurant_id, name HAVING COUNT(*) > 1;

-- Check tables for duplicates:
-- SELECT restaurant_id, name, COUNT(*) as count FROM tables 
-- GROUP BY restaurant_id, name HAVING COUNT(*) > 1;

-- Check staff for duplicates:
-- SELECT restaurant_id, name, role, COUNT(*) as count FROM staff 
-- GROUP BY restaurant_id, name, role HAVING COUNT(*) > 1;

-- Show current sections:
-- SELECT id, restaurant_id, name FROM sections WHERE restaurant_id IS NOT NULL ORDER BY restaurant_id, name;

-- Show current tables:
-- SELECT id, restaurant_id, name, section_id FROM tables ORDER BY restaurant_id, name;

-- Show current staff:
-- SELECT id, restaurant_id, name, role FROM staff WHERE restaurant_id IS NOT NULL ORDER BY restaurant_id, name, role;

-- ================================================================
-- AFTER CLEANUP: Test the seed endpoint
-- ================================================================
-- In Postman or your client:
-- POST http://localhost:3001/api/system/seed-restaurant
-- Body: { "restaurantId": "YOUR_RESTAURANT_ID" }
--
-- Expected response: 
-- { "success": true, "message": "Restaurant already seeded (skipped duplicate)", "alreadySeeded": true }
-- ================================================================
