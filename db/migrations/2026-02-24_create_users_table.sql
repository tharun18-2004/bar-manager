-- Create users table used by RBAC/account provisioning.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'staff',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active boolean,
  ALTER COLUMN role SET DEFAULT 'staff',
  ALTER COLUMN role SET NOT NULL;

UPDATE public.users
SET is_active = true
WHERE is_active IS NULL;

ALTER TABLE public.users
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;

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
