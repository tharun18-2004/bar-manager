# Supabase Migration Runbook

Run these SQL files in Supabase SQL Editor in this exact order:

1. `db/migrations/2026-02-16_add_external_order_id_to_payment_transactions.sql`
2. `db/migrations/2026-02-16_enable_rls_and_role_policies.sql`
3. `db/migrations/2026-02-25_align_sales_inventory_schema.sql`
4. `db/migrations/2026-02-25_add_table_labels_and_order_reference.sql`
5. `db/migrations/2026-02-25_add_payment_method_to_transactions.sql`
6. `db/migrations/2026-02-25_add_orders_table.sql`
7. `db/migrations/2026-02-25_normalize_orders_payment_method_uppercase.sql`
8. `db/migrations/2026-02-25_add_role_to_users.sql`
9. `db/migrations/2026-02-26_add_peg_inventory_fields.sql`

## Verify Migration Applied

```sql
-- Verify new payments column exists
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payment_transactions'
  AND column_name = 'external_order_id';

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'sales',
    'inventory',
    'customers',
    'staff',
    'tables',
    'void_logs',
    'payment_transactions'
  )
ORDER BY tablename;
```

## Set User Role in Supabase

Assign role in auth metadata (`staff`, `manager`, or `owner`):

```sql
-- Replace with real auth.users id and role
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"owner"}'::jsonb
WHERE id = '00000000-0000-0000-0000-000000000000';
```
