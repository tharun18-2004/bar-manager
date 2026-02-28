-- Persist split-bill allocations per order.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.order_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
  split_mode text NOT NULL CHECK (split_mode IN ('BY_ITEM', 'EQUAL', 'BY_GUEST')),
  split_index integer NOT NULL CHECK (split_index >= 0),
  party_label text NOT NULL,
  party_detail text,
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_splits_order_id
  ON public.order_splits(order_id, split_index);

ALTER TABLE public.order_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_splits_select_staff_manager_owner ON public.order_splits;
CREATE POLICY order_splits_select_staff_manager_owner
ON public.order_splits
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS order_splits_insert_staff_manager_owner ON public.order_splits;
CREATE POLICY order_splits_insert_staff_manager_owner
ON public.order_splits
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['staff', 'manager', 'owner']));
