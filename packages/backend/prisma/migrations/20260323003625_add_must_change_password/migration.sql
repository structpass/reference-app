-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true;

-- Set existing users to false (do not force password change on existing accounts)
UPDATE "users" SET "must_change_password" = false;
