-- Preserve the existing enabled/disabled state, including pending SSO users.
-- Drop the boolean default before converting the column to the existing enum.
BEGIN;
ALTER TABLE "users" ALTER COLUMN "is_active" DROP DEFAULT;
ALTER TABLE "users" RENAME COLUMN "is_active" TO "status";
ALTER TABLE "users" ALTER COLUMN "status" TYPE "ActiveStatus"
  USING (CASE WHEN "status" THEN 'ACTIVE' ELSE 'INACTIVE' END)::"ActiveStatus";
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"ActiveStatus";
COMMIT;
