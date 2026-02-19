-- Add support for non-UUID order references in payment logs.
ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS external_order_id TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_external_order_id
ON payment_transactions(external_order_id);
