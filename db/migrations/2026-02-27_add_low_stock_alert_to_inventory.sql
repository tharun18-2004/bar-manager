-- Add per-item low stock threshold for inventory status highlighting.
-- Safe to run multiple times.

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS low_stock_alert integer NOT NULL DEFAULT 5 CHECK (low_stock_alert >= 0);
