UPDATE "instruments"
SET "yahoo_symbol" = upper(trim("yahoo_symbol"))
WHERE "yahoo_symbol" IS NOT NULL
  AND "yahoo_symbol" <> upper(trim("yahoo_symbol"));
