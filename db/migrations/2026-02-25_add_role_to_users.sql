-- Add role to users table for owner-only analytics access.
-- Safe to run multiple times.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text;

UPDATE public.users
SET role = 'staff'
WHERE role IS NULL OR btrim(role) = '';

ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'staff',
  ALTER COLUMN role SET NOT NULL;

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
