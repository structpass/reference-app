-- 倉庫で絞る伝票一覧と件数（d1246）が順次走査にならないための index。
-- 一覧・件数は同じ条件（warehouse_id = ? AND deleted_at IS NULL）で引く。
CREATE INDEX "receivings_warehouse_id_idx" ON "receivings"("warehouse_id");
CREATE INDEX "shipments_warehouse_id_idx" ON "shipments"("warehouse_id");
CREATE INDEX "stocktakings_warehouse_id_idx" ON "stocktakings"("warehouse_id");
