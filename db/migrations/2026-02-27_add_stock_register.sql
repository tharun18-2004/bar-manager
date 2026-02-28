-- Digital stock register for daily/monthly inventory bookkeeping.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.stock_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  opening_balance integer NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  received integer NOT NULL DEFAULT 0 CHECK (received >= 0),
  sale integer NOT NULL DEFAULT 0 CHECK (sale >= 0),
  total integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  closing_balance integer NOT NULL DEFAULT 0 CHECK (closing_balance >= 0),
  amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  date date NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, date)
);

CREATE INDEX IF NOT EXISTS idx_stock_register_month_year
  ON public.stock_register(year, month, date DESC);

ALTER TABLE public.stock_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_register_select_staff_manager_owner ON public.stock_register;
CREATE POLICY stock_register_select_staff_manager_owner
ON public.stock_register
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS stock_register_insert_staff_manager_owner ON public.stock_register;
CREATE POLICY stock_register_insert_staff_manager_owner
ON public.stock_register
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS stock_register_update_staff_manager_owner ON public.stock_register;
CREATE POLICY stock_register_update_staff_manager_owner
ON public.stock_register
FOR UPDATE
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']))
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));
