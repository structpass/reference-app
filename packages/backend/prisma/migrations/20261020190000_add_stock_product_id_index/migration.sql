-- 予測在庫の一覧（d651）を「stock × 品目」の組で stock の id 順に取るための索引。
-- (warehouse_id, product_id) の一意制約（lockStockForUpdate の ON CONFLICT が使う）は外さない。
-- 2 列の一意索引に id を足したもので、2 列の一意性はそのままで、id 順の読みと
-- 品目との結合を 1 本の索引で賄える。
CREATE UNIQUE INDEX "stocks_warehouse_id_product_id_id_key"
  ON "stocks"("warehouse_id", "product_id", "id");

-- 品目の絞り込み（大文字小文字を区別しない一部一致）を索引で効かせる。
-- 大文字小文字を無視した検索のため、lower() した値に索引を張り、問い合わせ側も lower() で比べる。
CREATE INDEX "products_name_lower_trgm_idx" ON "products" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX "products_code_lower_trgm_idx" ON "products" USING gin (lower("code") gin_trgm_ops);
