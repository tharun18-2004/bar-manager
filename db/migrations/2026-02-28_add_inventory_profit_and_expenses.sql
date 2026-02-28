-- Add purchase/profit tracking columns and expenses table.
-- Safe to run multiple times.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS purchase_price numeric;

UPDATE public.inventory
SET purchase_price = COALESCE(purchase_price, cost_price, 0)
WHERE purchase_price IS NULL;

ALTER TABLE public.inventory
  ALTER COLUMN purchase_price SET DEFAULT 0,
  ALTER COLUMN purchase_price SET NOT NULL;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS profit numeric;

UPDATE public.inventory
SET profit = COALESCE(selling_price, unit_price, 0) - COALESCE(purchase_price, 0)
WHERE profit IS NULL;

CREATE TABLE IF NOT EXISTS public.expenses (
  id bigserial PRIMARY KEY,
  date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date DESC);
