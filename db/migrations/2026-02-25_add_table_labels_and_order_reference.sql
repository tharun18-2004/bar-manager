-- Add table labels like T1/VIP1/BAR and support assigning running order references.
-- Safe to run multiple times.

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS table_label text,
  ADD COLUMN IF NOT EXISTS order_reference text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill label from legacy numeric table number.
UPDATE public.tables
SET table_label = COALESCE(table_label, CONCAT('T', table_number::text))
WHERE table_number IS NOT NULL;

-- Map legacy reserved state to operational cleaning state.
UPDATE public.tables
SET status = 'needs_cleaning'
WHERE status = 'reserved';
