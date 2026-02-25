-- Add payment method tracking for POS transactions.
-- Safe to run multiple times.

ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS payment_method text;

UPDATE public.payment_transactions
SET payment_method = COALESCE(payment_method, 'complimentary');

ALTER TABLE public.payment_transactions
  ALTER COLUMN payment_method SET DEFAULT 'complimentary';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'payment_transactions'
      AND constraint_name = 'payment_transactions_payment_method_check'
  ) THEN
    ALTER TABLE public.payment_transactions
      ADD CONSTRAINT payment_transactions_payment_method_check
      CHECK (payment_method IN ('cash', 'card', 'upi', 'complimentary'));
  END IF;
END $$;
