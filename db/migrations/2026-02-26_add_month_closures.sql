-- Month-end closure snapshots for accounting/reporting.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.month_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key text NOT NULL UNIQUE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_sales numeric(12, 2) NOT NULL DEFAULT 0,
  total_orders integer NOT NULL DEFAULT 0,
  top_item_name text,
  top_item_quantity integer NOT NULL DEFAULT 0,
  cancelled_open_tabs_count integer NOT NULL DEFAULT 0,
  cancelled_open_tabs_amount numeric(12, 2) NOT NULL DEFAULT 0,
  closed_by_user_id uuid,
  closed_by_email text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_month_closures_period_start
  ON public.month_closures(period_start DESC);

ALTER TABLE public.month_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS month_closures_select_owner_only ON public.month_closures;
CREATE POLICY month_closures_select_owner_only
ON public.month_closures
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS month_closures_insert_owner_only ON public.month_closures;
CREATE POLICY month_closures_insert_owner_only
ON public.month_closures
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['owner']));
