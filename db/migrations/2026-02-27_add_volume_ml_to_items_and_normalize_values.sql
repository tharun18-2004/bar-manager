-- Add volume_ml to items and normalize legacy litre-like decimal values into ml.
-- Safe to run multiple times.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS ml integer CHECK (ml >= 0);

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS volume_ml integer CHECK (volume_ml >= 0);

-- 1) Backfill from existing items.ml
UPDATE public.items
SET volume_ml = CASE
  WHEN COALESCE(volume_ml, 0) > 0 THEN volume_ml
  WHEN ml IS NULL THEN NULL
  WHEN ml > 0 AND ml <= 5 THEN ROUND(ml * 1000)::int
  ELSE ml
END
WHERE volume_ml IS NULL OR volume_ml = 0;

-- 2) Backfill from inventory.bottle_size_ml using item links
UPDATE public.items it
SET volume_ml = src.normalized_ml
FROM (
  SELECT
    i.item_id,
    MAX(
      CASE
        WHEN COALESCE(i.bottle_size_ml, 0) > 0 AND i.bottle_size_ml <= 5
          THEN ROUND(i.bottle_size_ml * 1000)::int
        ELSE COALESCE(i.bottle_size_ml, 0)::int
      END
    ) AS normalized_ml
  FROM public.inventory i
  WHERE i.item_id IS NOT NULL
  GROUP BY i.item_id
) src
WHERE it.id = src.item_id
  AND src.normalized_ml > 0
  AND (it.volume_ml IS NULL OR it.volume_ml = 0);

-- 3) Mirror volume_ml -> ml for compatibility reads
UPDATE public.items
SET ml = volume_ml
WHERE COALESCE(volume_ml, 0) > 0
  AND (ml IS NULL OR ml = 0 OR ml <> volume_ml);
