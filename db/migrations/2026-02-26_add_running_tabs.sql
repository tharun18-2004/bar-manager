-- Running tabs for bar counter/table sessions.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_code text UNIQUE,
  customer_name text NOT NULL,
  table_label text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  opened_by text,
  opened_by_user_id uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  payment_method text CHECK (payment_method IN ('CASH', 'CARD', 'UPI', 'COMPLIMENTARY')),
  total_amount numeric(10, 2) NOT NULL DEFAULT 0,
  order_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES public.tabs(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  inventory_id uuid NOT NULL REFERENCES public.inventory(id),
  inventory_size_id text,
  size_label text,
  size_ml integer,
  unit_price numeric(10, 2) NOT NULL CHECK (unit_price >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total numeric(10, 2) NOT NULL CHECK (line_total >= 0),
  added_by text,
  added_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tabs_status_opened_at
  ON public.tabs(status, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_tab_items_tab_id
  ON public.tab_items(tab_id, added_at DESC);

ALTER TABLE public.tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tabs_select_staff_manager_owner ON public.tabs;
CREATE POLICY tabs_select_staff_manager_owner
ON public.tabs
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS tabs_insert_staff_manager_owner ON public.tabs;
CREATE POLICY tabs_insert_staff_manager_owner
ON public.tabs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS tabs_update_staff_manager_owner ON public.tabs;
CREATE POLICY tabs_update_staff_manager_owner
ON public.tabs
FOR UPDATE
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']))
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS tab_items_select_staff_manager_owner ON public.tab_items;
CREATE POLICY tab_items_select_staff_manager_owner
ON public.tab_items
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS tab_items_insert_staff_manager_owner ON public.tab_items;
CREATE POLICY tab_items_insert_staff_manager_owner
ON public.tab_items
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));
