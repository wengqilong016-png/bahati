-- ============================================================
-- Boss-only RPC to read restricted merchant balance columns
-- ============================================================

-- Ensure is_boss() helper has search_path set
CREATE OR REPLACE FUNCTION public.is_boss()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drivers
    WHERE id = auth.uid()
    AND role = 'boss'
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
    RAISE EXCEPTION 'Forbidden: boss only';
  END IF;
  RETURN QUERY
    SELECT m.id, m.name, m.retained_balance, m.debt_balance
    FROM public.merchants m
    ORDER BY m.name;
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.read_merchant_balances() TO authenticated;
