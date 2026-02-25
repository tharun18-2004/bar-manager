-- Align legacy schemas with current API expectations.
-- Safe to run multiple times.

-- INVENTORY ------------------------------------------------------------------
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS item_name text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_price numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill item_name from legacy name if needed.
UPDATE public.inventory
SET item_name = COALESCE(item_name, name)
WHERE item_name IS NULL;

-- Legacy deployments may require these columns; make them nullable for API inserts.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.inventory ALTER COLUMN name DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'cost_price'
  ) THEN
    ALTER TABLE public.inventory ALTER COLUMN cost_price DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'sale_price'
  ) THEN
    ALTER TABLE public.inventory ALTER COLUMN sale_price DROP NOT NULL;
  END IF;
END $$;

-- SALES ----------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS staff_name text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.sales ALTER COLUMN is_voided SET DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'item_id'
  ) THEN
    ALTER TABLE public.sales ALTER COLUMN item_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'void_reason'
  ) THEN
    ALTER TABLE public.sales ALTER COLUMN void_reason DROP NOT NULL;
  END IF;
END $$;

-- Optional starter data for fresh environments (uncomment if needed):
-- INSERT INTO public.inventory (item_name, category, quantity, unit_price)
-- VALUES
--   ('Beer Pint', 'Drinks', 50, 6.00),
--   ('Whiskey Shot', 'Drinks', 40, 8.50),
--   ('Margherita Pizza', 'Food', 20, 12.00),
--   ('French Fries', 'Food', 30, 5.50);
