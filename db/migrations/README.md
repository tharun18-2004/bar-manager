# Supabase Migration Runbook

Run these SQL files in Supabase SQL Editor in this exact order:

1. `db/migrations/2026-02-16_add_external_order_id_to_payment_transactions.sql`
2. `db/migrations/2026-02-16_enable_rls_and_role_policies.sql`
3. `db/migrations/2026-02-25_align_sales_inventory_schema.sql`
4. `db/migrations/2026-02-25_add_table_labels_and_order_reference.sql`
5. `db/migrations/2026-02-25_add_payment_method_to_transactions.sql`
6. `db/migrations/2026-02-25_add_orders_table.sql`
7. `db/migrations/2026-02-25_normalize_orders_payment_method_uppercase.sql`
8. `db/migrations/2026-02-24_create_users_table.sql`
9. `db/migrations/2026-02-25_add_role_to_users.sql`
10. `db/migrations/2026-02-26_add_peg_inventory_fields.sql`
11. `db/migrations/2026-02-26_add_inventory_sizes_and_atomic_sales_rpc.sql`
12. `db/migrations/2026-02-26_add_running_tabs.sql`
13. `db/migrations/2026-02-26_add_month_closures.sql`
14. `db/migrations/2026-02-27_add_categories_items_and_inventory_links.sql`
15. `db/migrations/2026-02-27_add_shift_logs.sql`
16. `db/migrations/2026-02-27_add_stock_register.sql`
17. `db/migrations/2026-02-27_add_total_column_to_stock_register.sql`
18. `db/migrations/2026-02-27_add_stock_register_day_locks.sql`
19. `db/migrations/2026-02-27_add_volume_ml_to_items_and_normalize_values.sql`
20. `db/migrations/2026-02-27_add_low_stock_alert_to_inventory.sql`
21. `db/migrations/2026-02-28_simplify_roles_owner_staff.sql`
22. `db/migrations/2026-02-28_add_users_is_active.sql`
23. `db/migrations/2026-02-28_add_inventory_profit_and_expenses.sql`
24. `db/migrations/2026-02-28_add_transactions_table.sql`

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
    'inventory_sizes',
    'customers',
    'staff',
    'tables',
    'void_logs',
    'payment_transactions',
    'transactions'
  )
ORDER BY tablename;
```

## Set User Role in Supabase

Assign role in auth metadata (`staff` or `owner`):

```sql
-- Replace with real auth.users id and role
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"owner"}'::jsonb
WHERE id = '00000000-0000-0000-0000-000000000000';
```
