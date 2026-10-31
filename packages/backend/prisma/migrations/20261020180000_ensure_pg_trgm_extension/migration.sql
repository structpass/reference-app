-- 品目名・品目コードの一部一致索引（20261020190000_add_stock_product_id_index）は
-- gin_trgm_ops を使うため pg_trgm が要る。拡張は環境ごとに手で入れる運用だったため、
-- 新しい DB（開発機の作り直し・使い捨てコンテナ・新規構築）では索引の作成が
-- 『operator class "gin_trgm_ops" does not exist for access method "gin"』で必ず失敗していた。
-- 索引の移行より前に置き、どの DB でも移行だけで揃うようにする。
-- 既に拡張がある環境では何もしない（IF NOT EXISTS）。pg_trgm は trusted 拡張のため
-- データベース所有者の権限で作成できる。
CREATE EXTENSION IF NOT EXISTS pg_trgm;
