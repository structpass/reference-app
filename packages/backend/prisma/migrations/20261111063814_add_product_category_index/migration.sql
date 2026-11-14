-- 商品一覧をカテゴリで絞るときの検索と件数（d1248）が順次走査にならないための index。
CREATE INDEX "products_category_id_idx" ON "products"("category_id");
