-- DropIndex
DROP INDEX IF EXISTS "announcement_roles_group_id_idx";

-- CreateIndex (composite for groups→announcements visibility query)
CREATE INDEX "announcement_roles_group_id_announcement_id_idx" ON "announcement_roles"("group_id", "announcement_id");
