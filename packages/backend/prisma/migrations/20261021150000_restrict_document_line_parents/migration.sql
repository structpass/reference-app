-- 明細を持つ伝票の直接削除で実績を連鎖削除しない。
-- DRAFT 棚卸の削除は、状態確認と子→親の明示削除を同一 transaction で行う。
BEGIN;

ALTER TABLE "receiving_lines" DROP CONSTRAINT "receiving_lines_receiving_id_fkey";
ALTER TABLE "receiving_lines" ADD CONSTRAINT "receiving_lines_receiving_id_fkey"
  FOREIGN KEY ("receiving_id") REFERENCES "receivings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shipment_lines" DROP CONSTRAINT "shipment_lines_shipment_id_fkey";
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_fkey"
  FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stocktaking_items" DROP CONSTRAINT "stocktaking_items_stocktaking_id_fkey";
ALTER TABLE "stocktaking_items" ADD CONSTRAINT "stocktaking_items_stocktaking_id_fkey"
  FOREIGN KEY ("stocktaking_id") REFERENCES "stocktakings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_fkey";
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 開発DBの復旧時に失われた品目参照制約も戻す。既存の正常な制約は変更しない。
-- 孤児があればADD時に失敗させ、親側の変更も含め全体をrollbackする。
DO $$
DECLARE
  child_table text;
  fk_name text;
BEGIN
  FOREACH child_table IN ARRAY ARRAY['receiving_lines', 'shipment_lines', 'stocktaking_items', 'order_items']
  LOOP
    fk_name := child_table || '_product_id_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = fk_name AND conrelid = format('%I', child_table)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT ON UPDATE CASCADE',
        child_table, fk_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
