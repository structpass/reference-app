-- AlterTable
ALTER TABLE "announcement_attachments" ADD COLUMN     "created_by_id" TEXT;

-- CreateIndex
CREATE INDEX "announcement_attachments_created_by_id_idx" ON "announcement_attachments"("created_by_id");

-- AddForeignKey
ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
