-- Add brand size variants and atomic sales stock-deduction RPC.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.inventory_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  size_label text,
  size_ml integer NOT NULL CHECK (size_ml > 0),
  selling_price numeric(10, 2) NOT NULL CHECK (selling_price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inventory_id, size_ml)
);

CREATE INDEX IF NOT EXISTS idx_inventory_sizes_inventory_id
  ON public.inventory_sizes(inventory_id);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS inventory_size_id uuid REFERENCES public.inventory_sizes(id),
  ADD COLUMN IF NOT EXISTS size_ml integer,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price numeric(10, 2),
  ADD COLUMN IF NOT EXISTS line_total numeric(10, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_size_ml_positive'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_size_ml_positive CHECK (size_ml IS NULL OR size_ml > 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_sale_with_stock(
  p_inventory_id uuid,
  p_inventory_size_id uuid,
  p_quantity integer DEFAULT 1,
  p_staff_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.inventory%ROWTYPE;
  v_size public.inventory_sizes%ROWTYPE;
  v_current_stock_ml numeric(10, 2);
  v_required_ml numeric(10, 2);
  v_next_stock_ml numeric(10, 2);
  v_bottle_size_ml integer;
  v_next_stock_qty integer;
  v_item_name text;
  v_line_total numeric(10, 2);
  v_sale_id text;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be > 0';
  END IF;

  SELECT *
  INTO v_inventory
  FROM public.inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory item not found';
  END IF;

  SELECT *
  INTO v_size
  FROM public.inventory_sizes
  WHERE id = p_inventory_size_id
    AND inventory_id = p_inventory_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory size not found or inactive';
  END IF;

  v_bottle_size_ml := GREATEST(COALESCE(v_inventory.bottle_size_ml, 750), 1);
  v_current_stock_ml := COALESCE(
    v_inventory.current_stock_ml,
    COALESCE(v_inventory.stock_quantity, 0) * v_bottle_size_ml
  );
  v_required_ml := (v_size.size_ml * p_quantity)::numeric(10, 2);

  IF v_current_stock_ml < v_required_ml THEN
    RAISE EXCEPTION 'insufficient stock: required %, available %', v_required_ml, v_current_stock_ml;
  END IF;

  v_next_stock_ml := (v_current_stock_ml - v_required_ml)::numeric(10, 2);
  v_next_stock_qty := GREATEST(FLOOR(v_next_stock_ml / v_bottle_size_ml)::int, 0);
  v_item_name := COALESCE(NULLIF(v_inventory.brand_name, ''), NULLIF(v_inventory.item_name, ''), 'Unknown Item');
  v_line_total := (v_size.selling_price * p_quantity)::numeric(10, 2);

  UPDATE public.inventory
  SET
    current_stock_ml = v_next_stock_ml,
    stock_quantity = v_next_stock_qty,
    quantity = v_next_stock_qty,
    updated_at = now()
  WHERE id = p_inventory_id;

  INSERT INTO public.sales (
    item_name,
    amount,
    is_voided,
    staff_name,
    inventory_size_id,
    size_ml,
    quantity,
    unit_price,
    line_total,
    created_at
  )
  VALUES (
    v_item_name,
    v_line_total,
    false,
    COALESCE(NULLIF(p_staff_name, ''), 'staff'),
    p_inventory_size_id,
    v_size.size_ml,
    p_quantity,
    v_size.selling_price,
    v_line_total,
    now()
  )
  RETURNING id::text INTO v_sale_id;

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'item_name', v_item_name,
    'size_ml', v_size.size_ml,
    'quantity', p_quantity,
    'unit_price', v_size.selling_price,
    'line_total', v_line_total,
    'remaining_stock_ml', v_next_stock_ml
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_with_stock(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_sale_with_stock(uuid, uuid, integer, text) TO authenticated;

ALTER TABLE public.inventory_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_sizes_select_staff_manager_owner ON public.inventory_sizes;
CREATE POLICY inventory_sizes_select_staff_manager_owner
ON public.inventory_sizes
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS inventory_sizes_insert_manager_owner ON public.inventory_sizes;
CREATE POLICY inventory_sizes_insert_manager_owner
ON public.inventory_sizes
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['manager', 'owner']));

DROP POLICY IF EXISTS inventory_sizes_update_manager_owner ON public.inventory_sizes;
CREATE POLICY inventory_sizes_update_manager_owner
ON public.inventory_sizes
FOR UPDATE
TO authenticated
USING (public.has_role(ARRAY['manager', 'owner']))
WITH CHECK (public.has_role(ARRAY['manager', 'owner']));
