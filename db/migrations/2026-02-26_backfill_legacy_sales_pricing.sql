-- Backfill legacy sales rows so pricing fields are consistent with new POS schema.
-- Safe to run multiple times.

-- 1) Ensure quantity is always a positive integer.
UPDATE public.sales
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;

-- 2) Backfill line_total from amount when missing.
UPDATE public.sales
SET line_total = amount
WHERE line_total IS NULL
  AND amount IS NOT NULL;

-- 3) Backfill unit_price from line_total/quantity (or amount/quantity) when missing.
UPDATE public.sales
SET unit_price = ROUND(
  (
    COALESCE(line_total, amount) / NULLIF(COALESCE(quantity, 1), 0)
  )::numeric,
  2
)
WHERE unit_price IS NULL
  AND COALESCE(line_total, amount) IS NOT NULL
  AND COALESCE(quantity, 1) > 0;
