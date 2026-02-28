-- Canonical POS transaction ledger used by owner analytics.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  staff_name text NOT NULL DEFAULT 'staff',
  total_amount numeric(12, 2) NOT NULL CHECK (total_amount >= 0),
  payment_method text NOT NULL DEFAULT 'COMPLIMENTARY',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND constraint_name = 'transactions_payment_method_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_payment_method_check
      CHECK (payment_method IN ('CASH', 'CARD', 'UPI', 'COMPLIMENTARY'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
  ON public.transactions(created_at DESC);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_select_staff_owner ON public.transactions;
CREATE POLICY transactions_select_staff_owner
ON public.transactions
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS transactions_insert_staff_owner ON public.transactions;
CREATE POLICY transactions_insert_staff_owner
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

