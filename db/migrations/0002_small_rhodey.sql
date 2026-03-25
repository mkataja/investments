ALTER TABLE "instruments" ADD COLUMN "cash_currency" text;
UPDATE "instruments" SET "cash_currency" = 'EUR' WHERE "kind" = 'cash_account' AND "cash_currency" IS NULL;