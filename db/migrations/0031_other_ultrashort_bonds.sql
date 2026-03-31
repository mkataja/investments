UPDATE "instrument_composite_constituents" SET "pseudo_key" = 'other_ultrashort_bonds' WHERE "pseudo_key" = 'ultrashort_bonds';
--> statement-breakpoint
ALTER TABLE "instrument_composite_constituents" DROP CONSTRAINT "instrument_composite_constituents_pseudo_key_ck";
--> statement-breakpoint
ALTER TABLE "instrument_composite_constituents" ADD CONSTRAINT "instrument_composite_constituents_pseudo_key_ck" CHECK (
  "pseudo_key" IS NULL
  OR "pseudo_key" IN (
    'other_equities',
    'other_long_government_bonds',
    'other_long_corporate_bonds',
    'other_short_government_bonds',
    'other_short_corporate_bonds',
    'other_ultrashort_bonds',
    'cash'
  )
);
