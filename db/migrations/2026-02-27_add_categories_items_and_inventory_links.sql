-- Normalize catalog structure for POS category/item separation.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  price numeric(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, category_id)
);

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES public.items(id) ON DELETE SET NULL;

INSERT INTO public.categories(name)
SELECT DISTINCT TRIM(category) AS name
FROM public.inventory
WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (name) DO NOTHING;

WITH category_map AS (
  SELECT id, name FROM public.categories
),
inventory_rows AS (
  SELECT
    i.id AS inventory_id,
    TRIM(COALESCE(i.item_name, i.name)) AS item_name,
    cm.id AS category_id,
    COALESCE(i.selling_price, i.sale_price, i.unit_price, 0)::numeric(10, 2) AS price,
    COALESCE(i.stock_quantity, i.quantity, 0)::int AS stock
  FROM public.inventory i
  JOIN category_map cm ON cm.name = TRIM(COALESCE(i.category, ''))
  WHERE TRIM(COALESCE(i.item_name, i.name, '')) <> ''
)
INSERT INTO public.items(name, category_id, price, stock)
SELECT item_name, category_id, MAX(price), MAX(stock)
FROM inventory_rows
GROUP BY item_name, category_id
ON CONFLICT (name, category_id) DO UPDATE
SET
  price = EXCLUDED.price,
  stock = EXCLUDED.stock,
  updated_at = now();

UPDATE public.inventory i
SET
  category_id = c.id,
  item_id = it.id
FROM public.categories c
JOIN public.items it ON it.category_id = c.id
WHERE TRIM(COALESCE(i.category, '')) = c.name
  AND TRIM(COALESCE(i.item_name, i.name, '')) = it.name
  AND (i.category_id IS DISTINCT FROM c.id OR i.item_id IS DISTINCT FROM it.id);

CREATE INDEX IF NOT EXISTS idx_inventory_item_name_ci
  ON public.inventory((lower(TRIM(item_name))));

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_select_staff_manager_owner ON public.categories;
CREATE POLICY categories_select_staff_manager_owner
ON public.categories
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS categories_insert_owner_only ON public.categories;
CREATE POLICY categories_insert_owner_only
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS items_select_staff_manager_owner ON public.items;
CREATE POLICY items_select_staff_manager_owner
ON public.items
FOR SELECT
TO authenticated
USING (public.has_role(ARRAY['staff', 'manager', 'owner']));

DROP POLICY IF EXISTS items_insert_owner_only ON public.items;
CREATE POLICY items_insert_owner_only
ON public.items
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(ARRAY['owner']));

DROP POLICY IF EXISTS items_update_owner_only ON public.items;
CREATE POLICY items_update_owner_only
ON public.items
FOR UPDATE
TO authenticated
USING (public.has_role(ARRAY['owner']))
WITH CHECK (public.has_role(ARRAY['owner']));
