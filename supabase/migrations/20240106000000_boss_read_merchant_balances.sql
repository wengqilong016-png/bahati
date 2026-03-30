-- ============================================================
-- Boss-only RPC to read restricted merchant balance columns
-- ============================================================

-- Ensure is_boss() helper has search_path set (security hardening only — logic unchanged)
CREATE OR REPLACE FUNCTION public.is_boss()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'boss'
  );
$$;

-- Boss-only read RPC for merchant balances
CREATE OR REPLACE FUNCTION public.read_merchant_balances()
RETURNS TABLE(merchant_id UUID, merchant_name TEXT, retained_balance NUMERIC, debt_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_boss() THEN
    RAISE EXCEPTION 'Permission denied: boss only'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.id, m.name, m.retained_balance, m.debt_balance
    FROM public.merchants m
    ORDER BY m.name;
END;
$$;

-- Restrict to authenticated role only (revoke default PUBLIC execute, then re-grant)
REVOKE EXECUTE ON FUNCTION public.read_merchant_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_merchant_balances() TO authenticated;
