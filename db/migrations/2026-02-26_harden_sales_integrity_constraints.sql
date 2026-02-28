-- Harden sales integrity to prevent null/invalid pricing and quantity values.
-- Safe to run multiple times.

-- Normalize any residual legacy rows before enforcing constraints.
UPDATE public.sales
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;

UPDATE public.sales
SET line_total = amount
WHERE line_total IS NULL
  AND amount IS NOT NULL;

UPDATE public.sales
SET unit_price = ROUND(
  (
    COALESCE(line_total, amount) / NULLIF(quantity, 0)
  )::numeric,
  2
)
WHERE unit_price IS NULL
  AND COALESCE(line_total, amount) IS NOT NULL
  AND quantity > 0;

UPDATE public.sales
SET size_ml = 60
WHERE size_ml IS NULL;

-- Enforce non-null guarantees.
ALTER TABLE public.sales
  ALTER COLUMN quantity SET NOT NULL,
  ALTER COLUMN unit_price SET NOT NULL,
  ALTER COLUMN line_total SET NOT NULL,
  ALTER COLUMN size_ml SET NOT NULL;

-- Enforce valid ranges.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_quantity_positive'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_quantity_positive CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_unit_price_non_negative'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_unit_price_non_negative CHECK (unit_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_line_total_non_negative'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_line_total_non_negative CHECK (line_total >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_size_ml_positive'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_size_ml_positive CHECK (size_ml > 0);
  END IF;
END $$;
