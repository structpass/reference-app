-- 予測在庫の一括集計（receiving_lines / shipment_lines への productId IN (...) + 親結合）が
-- sequential scan にならないための index（rev-quality 2026-07-31 DB-M3）。
-- 手動生成: 開発 DB が既存の migration ドリフト（20260703151540 編集済み）で migrate dev を
-- 受理しないため、Prisma の命名規約に従い手書き。本番は deploy.yml の migrate deploy で適用される。

-- CreateIndex
CREATE INDEX "receiving_lines_product_id_idx" ON "receiving_lines"("product_id");

-- CreateIndex
CREATE INDEX "shipment_lines_product_id_idx" ON "shipment_lines"("product_id");
