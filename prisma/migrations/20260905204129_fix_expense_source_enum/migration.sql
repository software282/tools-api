-- Postgres has no ALTER TYPE ... DROP VALUE, so removing an enum value means
-- recreating the type. Safe here: MANUAL was never actually written by any
-- code path (checked against the live data before running this).
ALTER TYPE "ExpenseSource" RENAME TO "ExpenseSource_old";
CREATE TYPE "ExpenseSource" AS ENUM ('RECEIPT', 'ESTIMATED');
ALTER TABLE "ExpenseEntry" ALTER COLUMN "source" TYPE "ExpenseSource" USING ("source"::text::"ExpenseSource");
DROP TYPE "ExpenseSource_old";
