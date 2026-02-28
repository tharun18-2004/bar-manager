-- Simplify runtime RBAC to owner/staff only.
-- Safe to run multiple times.

UPDATE public.users
SET role = 'staff'
WHERE role = 'manager';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND constraint_name = 'users_role_check'
  ) THEN
    ALTER TABLE public.users
      DROP CONSTRAINT users_role_check;
  END IF;

  ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role IN ('staff', 'owner'));
END $$;

-- sales
DROP POLICY IF EXISTS sales_select_staff_manager_owner ON public.sales;
CREATE POLICY sales_select_staff_owner
ON public.sales
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS sales_insert_staff_manager_owner ON public.sales;
CREATE POLICY sales_insert_staff_owner
ON public.sales
FOR INSERT
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS sales_update_staff_manager_owner ON public.sales;
CREATE POLICY sales_update_staff_owner
ON public.sales
FOR UPDATE
USING (public.has_role(ARRAY['staff', 'owner']))
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

-- inventory
DROP POLICY IF EXISTS inventory_select_staff_manager_owner ON public.inventory;
CREATE POLICY inventory_select_staff_owner
ON public.inventory
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS inventory_insert_manager_owner ON public.inventory;
CREATE POLICY inventory_insert_owner
ON public.inventory
FOR INSERT
WITH CHECK (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS inventory_update_manager_owner ON public.inventory;
CREATE POLICY inventory_update_owner
ON public.inventory
FOR UPDATE
USING (public.has_role(ARRAY['owner']))
WITH CHECK (public.has_role(ARRAY['owner']));

-- customers
DROP POLICY IF EXISTS customers_select_manager_owner ON public.customers;
CREATE POLICY customers_select_owner
ON public.customers
FOR SELECT
USING (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS customers_insert_manager_owner ON public.customers;
CREATE POLICY customers_insert_owner
ON public.customers
FOR INSERT
WITH CHECK (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS customers_update_manager_owner ON public.customers;
CREATE POLICY customers_update_owner
ON public.customers
FOR UPDATE
USING (public.has_role(ARRAY['owner']))
WITH CHECK (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS customers_delete_manager_owner ON public.customers;
CREATE POLICY customers_delete_owner
ON public.customers
FOR DELETE
USING (public.has_role(ARRAY['owner']));

-- legacy staff table
DROP POLICY IF EXISTS staff_select_manager_owner ON public.staff;
CREATE POLICY staff_select_owner
ON public.staff
FOR SELECT
USING (public.has_role(ARRAY['owner']));

-- tables
DROP POLICY IF EXISTS tables_select_staff_manager_owner ON public.tables;
CREATE POLICY tables_select_staff_owner
ON public.tables
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS tables_insert_manager_owner ON public.tables;
CREATE POLICY tables_insert_owner
ON public.tables
FOR INSERT
WITH CHECK (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS tables_update_staff_manager_owner ON public.tables;
CREATE POLICY tables_update_staff_owner
ON public.tables
FOR UPDATE
USING (public.has_role(ARRAY['staff', 'owner']))
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

-- void logs
DROP POLICY IF EXISTS void_logs_select_manager_owner ON public.void_logs;
CREATE POLICY void_logs_select_owner
ON public.void_logs
FOR SELECT
USING (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS void_logs_insert_staff_manager_owner ON public.void_logs;
CREATE POLICY void_logs_insert_staff_owner
ON public.void_logs
FOR INSERT
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

-- payment_transactions
DROP POLICY IF EXISTS payment_tx_select_staff_manager_owner ON public.payment_transactions;
CREATE POLICY payment_tx_select_staff_owner
ON public.payment_transactions
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS payment_tx_insert_staff_manager_owner ON public.payment_transactions;
CREATE POLICY payment_tx_insert_staff_owner
ON public.payment_transactions
FOR INSERT
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

-- inventory_sizes
DROP POLICY IF EXISTS inventory_sizes_select_staff_manager_owner ON public.inventory_sizes;
CREATE POLICY inventory_sizes_select_staff_owner
ON public.inventory_sizes
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS inventory_sizes_insert_manager_owner ON public.inventory_sizes;
CREATE POLICY inventory_sizes_insert_owner
ON public.inventory_sizes
FOR INSERT
WITH CHECK (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS inventory_sizes_update_manager_owner ON public.inventory_sizes;
CREATE POLICY inventory_sizes_update_owner
ON public.inventory_sizes
FOR UPDATE
USING (public.has_role(ARRAY['owner']))
WITH CHECK (public.has_role(ARRAY['owner']));

-- order_splits
DROP POLICY IF EXISTS order_splits_select_staff_manager_owner ON public.order_splits;
CREATE POLICY order_splits_select_staff_owner
ON public.order_splits
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS order_splits_insert_staff_manager_owner ON public.order_splits;
CREATE POLICY order_splits_insert_staff_owner
ON public.order_splits
FOR INSERT
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

-- tabs + tab_items
DROP POLICY IF EXISTS tabs_select_staff_manager_owner ON public.tabs;
CREATE POLICY tabs_select_staff_owner
ON public.tabs
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS tabs_insert_staff_manager_owner ON public.tabs;
CREATE POLICY tabs_insert_staff_owner
ON public.tabs
FOR INSERT
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS tabs_update_staff_manager_owner ON public.tabs;
CREATE POLICY tabs_update_staff_owner
ON public.tabs
FOR UPDATE
USING (public.has_role(ARRAY['staff', 'owner']))
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS tab_items_select_staff_manager_owner ON public.tab_items;
CREATE POLICY tab_items_select_staff_owner
ON public.tab_items
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS tab_items_insert_staff_manager_owner ON public.tab_items;
CREATE POLICY tab_items_insert_staff_owner
ON public.tab_items
FOR INSERT
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

-- stock_register + day locks
DROP POLICY IF EXISTS stock_register_select_staff_manager_owner ON public.stock_register;
CREATE POLICY stock_register_select_staff_owner
ON public.stock_register
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS stock_register_insert_staff_manager_owner ON public.stock_register;
CREATE POLICY stock_register_insert_staff_owner
ON public.stock_register
FOR INSERT
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS stock_register_update_staff_manager_owner ON public.stock_register;
CREATE POLICY stock_register_update_staff_owner
ON public.stock_register
FOR UPDATE
USING (public.has_role(ARRAY['staff', 'owner']))
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS stock_register_day_locks_select_staff_manager_owner ON public.stock_register_day_locks;
CREATE POLICY stock_register_day_locks_select_staff_owner
ON public.stock_register_day_locks
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

-- shift logs
DROP POLICY IF EXISTS shift_logs_select_staff_manager_owner ON public.shift_logs;
CREATE POLICY shift_logs_select_staff_owner
ON public.shift_logs
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS shift_logs_insert_staff_manager_owner ON public.shift_logs;
CREATE POLICY shift_logs_insert_staff_owner
ON public.shift_logs
FOR INSERT
WITH CHECK (public.has_role(ARRAY['staff', 'owner']));

-- categories + items
DROP POLICY IF EXISTS categories_select_staff_manager_owner ON public.categories;
CREATE POLICY categories_select_staff_owner
ON public.categories
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));

DROP POLICY IF EXISTS items_select_staff_manager_owner ON public.items;
CREATE POLICY items_select_staff_owner
ON public.items
FOR SELECT
USING (public.has_role(ARRAY['staff', 'owner']));
