/*
  Warnings:

  - Added the required column `updated_at` to the `field_defs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "field_defs" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "object_types_sort_order_idx" ON "object_types"("sort_order");
