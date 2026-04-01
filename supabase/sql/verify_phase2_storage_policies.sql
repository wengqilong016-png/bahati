-- ============================================================
-- Verification script: Phase 2 storage buckets + policies
-- Validates:
--   A) buckets exist
--   B) authenticated user upload under own uid prefix is allowed
--   C) cross-user path upload is rejected
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f supabase/sql/verify_phase2_storage_policies.sql
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT ARRAY(
    SELECT b.bucket
    FROM (
      VALUES ('onboarding-photos'), ('task-photos'), ('reset-request-photos')
    ) AS b(bucket)
    WHERE NOT EXISTS (
      SELECT 1
      FROM storage.buckets sb
      WHERE sb.id = b.bucket
    )
  )
  INTO v_missing;

  IF COALESCE(array_length(v_missing, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Missing required storage buckets: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'Bucket existence check passed.';
END
$$;

-- Simulate authenticated user A
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

-- Positive case: own prefix upload should pass
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES (
  'task-photos',
  '11111111-1111-1111-1111-111111111111/rls-smoke/pass.txt',
  '11111111-1111-1111-1111-111111111111',
  '{}'::jsonb
);

RAISE NOTICE 'Authenticated own-prefix upload passed.';

-- Negative case: cross-user prefix should be rejected
DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
      'task-photos',
      '22222222-2222-2222-2222-222222222222/rls-smoke/deny.txt',
      '11111111-1111-1111-1111-111111111111',
      '{}'::jsonb
    );

    RAISE EXCEPTION 'Expected cross-user prefix upload to fail, but it succeeded.';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'Cross-user prefix upload correctly rejected: %', SQLERRM;
  END;
END
$$;

ROLLBACK;
