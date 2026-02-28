-- Shift close logs for staff cash reconciliation.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.shift_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid,
  staff_email text,
  shift_start timestamptz NOT NULL,
  shift_end timestamptz NOT NULL,
  total_sales numeric(12, 2) NOT NULL DEFAULT 0,
  cash_expected numeric(12, 2) NOT NULL DEFAULT 0,
  card_expected numeric(12, 2) NOT NULL DEFAULT 0,
  upi_expected numeric(12, 2) NOT NULL DEFAULT 0,
  complimentary_amount numeric(12, 2) NOT NULL DEFAULT 0,
  cash_counted numeric(12, 2) NOT NULL DEFAULT 0,
  difference numeric(12, 2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_logs_staff_id_shift_end
  ON public.shift_logs(staff_id, shift_end DESC);

ALTER TABLE public.shift_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_logs_select_staff_manager_owner ON public.shift_logs;
CREATE POLICY shift_logs_select_staff_manager_owner
ON public.shift_logs
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS shift_logs_insert_staff_manager_owner ON public.shift_logs;
CREATE POLICY shift_logs_insert_staff_manager_owner
ON public.shift_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));
