-- Backfill legacy sales rows with a default size_ml for reporting consistency.
-- Safe to run multiple times.

-- Ensure quantity is always positive for old rows.
UPDATE public.sales
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;

-- Ensure line_total exists if amount exists.
UPDATE public.sales
SET line_total = amount
WHERE line_total IS NULL
  AND amount IS NOT NULL;

-- Ensure unit_price exists when total + quantity are present.
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

-- Assign default size for legacy records that never stored size.
UPDATE public.sales
SET size_ml = 60
WHERE size_ml IS NULL;
