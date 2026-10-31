-- 品目の作成・更新の記録（d630）。
-- 利用者を消すと NULL に書き換わり、誰が作った・更新したかの記録が空になっていた。
-- 記録の作成者は消せない（参照が残っていれば削除は外部キー違反で止まる）ようにし、
-- 消したい利用者は status=INACTIVE で無効化する。
ALTER TABLE "products" DROP CONSTRAINT "products_created_by_fkey";
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" DROP CONSTRAINT "products_updated_by_fkey";
ALTER TABLE "products" ADD CONSTRAINT "products_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
