-- Add explicit total column for stock register rows.
-- Safe to run multiple times.

ALTER TABLE public.stock_register
  ADD COLUMN IF NOT EXISTS total integer NOT NULL DEFAULT 0 CHECK (total >= 0);

UPDATE public.stock_register
SET total = COALESCE(opening_balance, 0) + COALESCE(received, 0)
WHERE total IS NULL OR total = 0;
