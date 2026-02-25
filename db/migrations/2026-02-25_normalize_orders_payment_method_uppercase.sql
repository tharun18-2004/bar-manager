-- Normalize orders.payment_method to uppercase values.
-- Safe to run multiple times.

UPDATE public.orders
SET payment_method = UPPER(payment_method)
WHERE payment_method IS NOT NULL;

ALTER TABLE public.orders
  ALTER COLUMN payment_method SET DEFAULT 'COMPLIMENTARY';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND constraint_name = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE public.orders
      DROP CONSTRAINT orders_payment_method_check;
  END IF;

  ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('CASH', 'CARD', 'UPI', 'COMPLIMENTARY'));
END $$;
