-- ============================================================
-- Phase 1: Kiosk onboarding type support
-- ============================================================

-- Add onboarding_type column to distinguish onboarding vs re-certification
ALTER TABLE public.machine_onboardings
  ADD COLUMN IF NOT EXISTS onboarding_type TEXT NOT NULL DEFAULT 'onboarding'
  CHECK (onboarding_type IN ('onboarding', 'recertification'));
