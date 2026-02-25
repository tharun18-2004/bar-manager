-- Add orders table to persist completed POS orders with payment method.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.orders (
  id bigserial PRIMARY KEY,
  order_id text UNIQUE NOT NULL,
  staff_name text,
  total_amount numeric(10,2) NOT NULL,
  payment_method text NOT NULL DEFAULT 'complimentary',
  status text NOT NULL DEFAULT 'completed',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND constraint_name = 'orders_payment_method_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('cash', 'card', 'upi', 'complimentary'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_staff_name ON public.orders(staff_name);
