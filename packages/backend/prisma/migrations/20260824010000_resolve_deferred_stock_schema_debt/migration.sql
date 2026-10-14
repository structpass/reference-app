-- ADR 0006 / ref-0080: deferred stock schema debt.
-- The database default preserves the existing raw INSERT path in StocksRepository,
-- which intentionally omits updated_at while acquiring the stock row lock.

-- AlterTable
ALTER TABLE "stocks"
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "stocktaking_items_product_id_idx" ON "stocktaking_items"("product_id");

-- CreateIndex
CREATE INDEX "stock_adjustments_warehouse_id_product_id_created_at_idx"
ON "stock_adjustments"("warehouse_id", "product_id", "created_at");
