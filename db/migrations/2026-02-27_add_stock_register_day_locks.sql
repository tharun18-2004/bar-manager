-- Day-level lock table for stock register finalization.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.stock_register_day_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  locked_by_user_id uuid,
  locked_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_register_day_locks_year_month
  ON public.stock_register_day_locks(year, month, date DESC);

ALTER TABLE public.stock_register_day_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_register_day_locks_select_staff_manager_owner ON public.stock_register_day_locks;
CREATE POLICY stock_register_day_locks_select_staff_manager_owner
ON public.stock_register_day_locks
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS stock_register_day_locks_insert_owner_only ON public.stock_register_day_locks;
CREATE POLICY stock_register_day_locks_insert_owner_only
ON public.stock_register_day_locks
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['owner']));
