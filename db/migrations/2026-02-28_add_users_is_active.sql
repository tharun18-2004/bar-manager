-- Add users.is_active for soft deactivation of staff accounts.
-- Safe to run multiple times.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active boolean;

UPDATE public.users
SET is_active = true
WHERE is_active IS NULL;

ALTER TABLE public.users
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;
