-- Enable RLS + role-based policies aligned with app/api-auth.ts
-- Roles are read from JWT app metadata (fallback to user metadata):
--   app_metadata.role or user_metadata.role in ['staff','manager','owner']

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'staff'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(allowed text[])
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_app_role() = ANY (allowed);
$$;

-- SALES ----------------------------------------------------------------------
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_select_staff_manager_owner ON public.sales;
CREATE POLICY sales_select_staff_manager_owner
ON public.sales
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS sales_insert_staff_manager_owner ON public.sales;
CREATE POLICY sales_insert_staff_manager_owner
ON public.sales
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS sales_update_staff_manager_owner ON public.sales;
CREATE POLICY sales_update_staff_manager_owner
ON public.sales
FOR UPDATE
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']))
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));

-- INVENTORY ------------------------------------------------------------------
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_select_staff_manager_owner ON public.inventory;
CREATE POLICY inventory_select_staff_manager_owner
ON public.inventory
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS inventory_insert_manager_owner ON public.inventory;
CREATE POLICY inventory_insert_manager_owner
ON public.inventory
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['manager', 'owner']));

DROP POLICY IF EXISTS inventory_update_manager_owner ON public.inventory;
CREATE POLICY inventory_update_manager_owner
ON public.inventory
FOR UPDATE
TO authenticated
USING (public.has_role(ARRAY['manager', 'owner']))
WITH CHECK (public.has_role(ARRAY['manager', 'owner']));

-- CUSTOMERS ------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select_manager_owner ON public.customers;
CREATE POLICY customers_select_manager_owner
ON public.customers
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['manager', 'owner']));

DROP POLICY IF EXISTS customers_insert_manager_owner ON public.customers;
CREATE POLICY customers_insert_manager_owner
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['manager', 'owner']));

DROP POLICY IF EXISTS customers_update_manager_owner ON public.customers;
CREATE POLICY customers_update_manager_owner
ON public.customers
FOR UPDATE
TO authenticated
USING (public.has_role(ARRAY['manager', 'owner']))
WITH CHECK (public.has_role(ARRAY['manager', 'owner']));

DROP POLICY IF EXISTS customers_delete_manager_owner ON public.customers;
CREATE POLICY customers_delete_manager_owner
ON public.customers
FOR DELETE
TO authenticated
USING (public.has_role(ARRAY['manager', 'owner']));

-- STAFF ----------------------------------------------------------------------
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_select_manager_owner ON public.staff;
CREATE POLICY staff_select_manager_owner
ON public.staff
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['manager', 'owner']));

DROP POLICY IF EXISTS staff_insert_owner ON public.staff;
CREATE POLICY staff_insert_owner
ON public.staff
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS staff_update_owner ON public.staff;
CREATE POLICY staff_update_owner
ON public.staff
FOR UPDATE
TO authenticated
USING (public.has_role(ARRAY['owner']))
WITH CHECK (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS staff_delete_owner ON public.staff;
CREATE POLICY staff_delete_owner
ON public.staff
FOR DELETE
TO authenticated
USING (public.has_role(ARRAY['owner']));

-- TABLES ---------------------------------------------------------------------
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tables_select_staff_manager_owner ON public.tables;
CREATE POLICY tables_select_staff_manager_owner
ON public.tables
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS tables_insert_manager_owner ON public.tables;
CREATE POLICY tables_insert_manager_owner
ON public.tables
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['manager', 'owner']));

DROP POLICY IF EXISTS tables_update_staff_manager_owner ON public.tables;
CREATE POLICY tables_update_staff_manager_owner
ON public.tables
FOR UPDATE
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']))
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));

-- VOIDS ----------------------------------------------------------------------
ALTER TABLE public.void_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS void_logs_select_manager_owner ON public.void_logs;
CREATE POLICY void_logs_select_manager_owner
ON public.void_logs
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['manager', 'owner']));

DROP POLICY IF EXISTS void_logs_insert_staff_manager_owner ON public.void_logs;
CREATE POLICY void_logs_insert_staff_manager_owner
ON public.void_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));

-- PAYMENTS -------------------------------------------------------------------
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_tx_select_staff_manager_owner ON public.payment_transactions;
CREATE POLICY payment_tx_select_staff_manager_owner
ON public.payment_transactions
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS payment_tx_insert_staff_manager_owner ON public.payment_transactions;
CREATE POLICY payment_tx_insert_staff_manager_owner
ON public.payment_transactions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));
