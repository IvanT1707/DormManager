BEGIN;

ALTER TABLE transactions
  DROP COLUMN IF EXISTS stripe_payment_intent_id;

COMMIT;
