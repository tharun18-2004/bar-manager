-- Backfill default 60 ml size pricing for legacy inventory rows
-- that do not yet have any inventory_sizes entries.
-- Safe to run multiple times.

INSERT INTO public.inventory_sizes (
  inventory_id,
  size_label,
  size_ml,
  selling_price,
  is_active
)
SELECT
  i.id,
  'Peg 60 ml',
  60,
  COALESCE(
    NULLIF(i.selling_price, 0),
    NULLIF(i.sale_price, 0),
    NULLIF(i.unit_price, 0),
    0
  )::numeric(10, 2),
  true
FROM public.inventory i
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inventory_sizes s
  WHERE s.inventory_id = i.id
)
AND COALESCE(
  NULLIF(i.selling_price, 0),
  NULLIF(i.sale_price, 0),
  NULLIF(i.unit_price, 0),
  0
) > 0;
