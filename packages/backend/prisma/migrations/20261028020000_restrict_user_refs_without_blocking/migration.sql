-- 作成・更新の記録（d812）。
-- 参照が残っている利用者の削除は止める（d630・d810 の意図を保つ）。止め方を「行の全件検証」と
-- 「表全体の書き込みの停止」から「新しく入る行の検証」と「取り合いの短い文」に変え、本番でデータが増えても
-- 止める時間が読める形にする。
--
-- ・外部キーは NOT VALID で張る（既存行はその場で検証しない）。以後の INSERT / UPDATE は行ごとに検証され、
--   利用者の削除は参照があれば止まる。この 2 つは「止める」に要る力そのもので、検証の有無に左右されない。
-- ・旧定義（ON UPDATE CASCADE）は、参照が空の利用者なら ID の改名が参照側を素通りさせていた。参照が空なら
--   改名が通る経路は残さない（消したい利用者は status=INACTIVE で無効化する、が d630 の決めた扱い）。
--   そこで ON UPDATE NO ACTION にし、users の ID を変える操作そのものを移行の後に断つ。
-- ・表全体を止めないのは、短い文を 1 本ずつ流す（表があれば即座に取れる種類のロックを使い切る）。
-- ・参照列に索引が無いと、利用者を消すたびに参照先の表を全件走査することになるため、索引も張る。
--
-- 表ごとの作業は短い DO ブロックに分け、ロックの名前（表・制約）と作業を一緒に書く。
-- 全件検証（VALIDATE）と、別スキーマに同名の制約が残っている DB の後始末は、この移行の後に別の移行で行う。
--
-- 対象 6 本は必ず在る前提で扱う。表や制約が見つからない時に読み飛ばすと、当たっていないのに成功したと
-- 印を付けて、以後の参照の止めが効かないまま流れる（開発 DB の未完了行のように、途中で手を入れた DB は
-- この形になりやすい）。前提のほうを関門で固定する（scripts/check-migration-preconditions.mjs）。
BEGIN;

-- この移行が取れないロックを待ち続けないようにする（止める時間に上限を置く）。ロックが取れなければ巻き戻り、
-- 触る前の状態に戻る。
SET LOCAL lock_timeout = '5s';

-- 参照側の外部キーを「削除を止める」定義へ張り直す関数。毎回作り直すので、前の版が残っていても差し替わる。
-- 前提が崩れた DB（対象の制約が無い）では、DROP が失敗して移行ごと巻き戻る（黙って飛ばさない）。
--
-- 待ちが入る操作（DROP・ADD）は、失敗を捕まえる BEGIN…EXCEPTION の中に置かないこと。PL/pgSQL は
-- ブロックに入ると小さな入口（サブトランザクション）を置き、その中での 1 回目の DDL 以降、
-- 以降の DDL が「1 つの文の中で 2 つ目の DDL」になる。ADD はこの経路でだけ失敗する（計測用の複製で実測）。
-- 片方だけ進むことは、エラーで移行ごと巻き戻ることで防いでいるので、捕まえずに止めてよい。
CREATE OR REPLACE FUNCTION public.user_ref_to_restrict(p_table regclass, p_constraint text, p_column text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', p_table, p_constraint);
  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID',
    p_table, p_constraint, p_column
  );
END
$fn$;

-- 品目の作成記録・更新記録（d630）。
DO $$
BEGIN
  PERFORM public.user_ref_to_restrict('public.products'::regclass, 'products_created_by_fkey', 'created_by');
END $$;

DO $$
BEGIN
  PERFORM public.user_ref_to_restrict('public.products'::regclass, 'products_updated_by_fkey', 'updated_by');
END $$;

-- 掲示の更新者・システム設定と一覧のページサイズ設定の最終更新者・告知の添付者（d810）。
DO $$
BEGIN
  PERFORM public.user_ref_to_restrict('public.announcements'::regclass, 'announcements_updated_by_id_fkey', 'updated_by_id');
END $$;

DO $$
BEGIN
  PERFORM public.user_ref_to_restrict('public.system_parameters'::regclass, 'system_parameters_updated_by_id_fkey', 'updated_by_id');
END $$;

DO $$
BEGIN
  PERFORM public.user_ref_to_restrict('public.table_pagination_settings'::regclass, 'table_pagination_settings_updated_by_id_fkey', 'updated_by_id');
END $$;

DO $$
BEGIN
  PERFORM public.user_ref_to_restrict('public.announcement_attachments'::regclass, 'announcement_attachments_created_by_id_fkey', 'created_by_id');
END $$;

-- 利用者の ID を変える操作そのものを断つ（消したい利用者は status=INACTIVE で無効化する、の 1 本道にする）。
-- 改名を許す経路は、参照が空の利用者に対して残っていた（d630 の決めと食い違う）。改名したければ、
-- この移行の後に明示的に外して流し直す。
CREATE OR REPLACE FUNCTION public.prevent_user_id_change()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION '利用者の ID は変えない（消したい利用者は status=INACTIVE で無効化する）';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS "users_id_unchanged" ON "users";
CREATE TRIGGER "users_id_unchanged"
  BEFORE UPDATE OF "id" ON "users"
  FOR EACH ROW EXECUTE FUNCTION public.prevent_user_id_change();

-- 新しい利用者は ID を必ず渡す（アプリの作成の経路）。渡し忘れを、黙って通る既定値で埋めない。
-- 既定の値を変えるこの操作は表のロックを一瞬だけ取る（待ちの上限はこの移行の先頭で置いてある）。
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;

-- 利用者の削除を止める時の参照側の検索を索引で済ませる。
CREATE INDEX IF NOT EXISTS "products_created_by_idx" ON "products"("created_by");
CREATE INDEX IF NOT EXISTS "products_updated_by_idx" ON "products"("updated_by");
CREATE INDEX IF NOT EXISTS "announcements_updated_by_id_idx" ON "announcements"("updated_by_id");
CREATE INDEX IF NOT EXISTS "system_parameters_updated_by_id_idx" ON "system_parameters"("updated_by_id");
CREATE INDEX IF NOT EXISTS "table_pagination_settings_updated_by_id_idx" ON "table_pagination_settings"("updated_by_id");

COMMIT;
