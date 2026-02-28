-- Remove the most recent month closure snapshot (admin recovery utility).
-- Use only when you need to reopen analytics visibility after an accidental close.

DELETE FROM public.month_closures
WHERE id IN (
  SELECT id
  FROM public.month_closures
  ORDER BY created_at DESC
  LIMIT 1
);

-- Refresh PostgREST schema/cache metadata.
SELECT pg_notify('pgrst', 'reload schema');
