-- ============================================================
-- Phase 2 Storage buckets + RLS policies (idempotent)
-- Buckets: onboarding-photos, task-photos, reset-request-photos
-- Path rule: objects must be under "{auth.uid()}/..."
-- ============================================================

-- 1) Idempotent bucket creation
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'onboarding-photos',
    'onboarding-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'task-photos',
    'task-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  (
    'reset-request-photos',
    'reset-request-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  )
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) RLS policy: authenticated users can upload only into their own uid prefix
DROP POLICY IF EXISTS "phase2 storage insert own prefix" ON storage.objects;
CREATE POLICY "phase2 storage insert own prefix"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('onboarding-photos', 'task-photos', 'reset-request-photos')
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- 3) RLS policy: authenticated users can read only their own uid prefix
DROP POLICY IF EXISTS "phase2 storage select own prefix" ON storage.objects;
CREATE POLICY "phase2 storage select own prefix"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN ('onboarding-photos', 'task-photos', 'reset-request-photos')
  AND split_part(name, '/', 1) = auth.uid()::text
);

-- 4) RLS policy: authenticated users can update only their own uid prefix
-- Required for upsert=true on existing objects.
DROP POLICY IF EXISTS "phase2 storage update own prefix" ON storage.objects;
CREATE POLICY "phase2 storage update own prefix"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('onboarding-photos', 'task-photos', 'reset-request-photos')
  AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id IN ('onboarding-photos', 'task-photos', 'reset-request-photos')
  AND split_part(name, '/', 1) = auth.uid()::text
);
