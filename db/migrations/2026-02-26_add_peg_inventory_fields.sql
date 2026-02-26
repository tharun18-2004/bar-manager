-- Add product + peg tracking fields to inventory, with safe backfill.
-- Safe to run multiple times.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS bottle_size_ml integer DEFAULT 750,
  ADD COLUMN IF NOT EXISTS cost_price numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_quantity integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_stock_ml numeric(10, 2) DEFAULT 0;

-- Backfill new columns from legacy schema.
UPDATE public.inventory
SET selling_price = COALESCE(selling_price, unit_price, 0)
WHERE selling_price IS NULL;

UPDATE public.inventory
SET stock_quantity = COALESCE(stock_quantity, quantity, 0)
WHERE stock_quantity IS NULL;

UPDATE public.inventory
SET bottle_size_ml = COALESCE(bottle_size_ml, 750)
WHERE bottle_size_ml IS NULL OR bottle_size_ml <= 0;

UPDATE public.inventory
SET current_stock_ml = COALESCE(current_stock_ml, COALESCE(stock_quantity, 0) * COALESCE(bottle_size_ml, 750))
WHERE current_stock_ml IS NULL;

-- Keep legacy columns aligned for existing screens/code paths.
UPDATE public.inventory
SET unit_price = COALESCE(unit_price, selling_price, 0)
WHERE unit_price IS NULL;

UPDATE public.inventory
SET quantity = COALESCE(quantity, stock_quantity, 0)
WHERE quantity IS NULL;

ALTER TABLE public.inventory
  ALTER COLUMN bottle_size_ml SET DEFAULT 750,
  ALTER COLUMN cost_price SET DEFAULT 0,
  ALTER COLUMN selling_price SET DEFAULT 0,
  ALTER COLUMN stock_quantity SET DEFAULT 0,
  ALTER COLUMN current_stock_ml SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_bottle_size_ml_positive'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_bottle_size_ml_positive CHECK (bottle_size_ml > 0);
  END IF;
END $$;
