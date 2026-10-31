-- 作成・更新の記録（d812）。前の移行で「削除を止める」定義へ張り直した 6 本を締める。
--
-- ・既存行の全件検証は VALIDATE CONSTRAINT で 1 本ずつ行う。検証そのものは表の書き込みを止めない
--   （構文解析の一瞬だけ待つ。長く待ちが残らないよう、待ちの上限を先に置く）。
-- ・制約名はスキーマを跨いで一意ではない。別スキーマに同名の制約が残っていて、対象表の外へ名前だけで
--   DROP を書くと、対象表の側が消えず "already exists" で止まる（計測用の複製で確認した）。
-- ・対象表の制約を外すのは、前の移行で古い定義が残った DB を整えるため。外した後に必ず張り直すので、
--   外したまま移行が成功することはない（前の移行を適用済みで、同名が別スキーマにだけ残っている DB では、
--   「別の場所の同名」を消す旧形では対象表の制約が消えたまま通っていた）。
-- ・DROP は 1 本ずつ流す（長い DO ブロックにまとめると、ブロックが終わるまで待ちが続く）。
BEGIN;

-- 待ちの上限はこの移行だけに効く（終われば元の値へ戻す）。
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.products VALIDATE CONSTRAINT "products_created_by_fkey";
ALTER TABLE public.products VALIDATE CONSTRAINT "products_updated_by_fkey";
ALTER TABLE public.announcements VALIDATE CONSTRAINT "announcements_updated_by_id_fkey";
ALTER TABLE public.system_parameters VALIDATE CONSTRAINT "system_parameters_updated_by_id_fkey";
ALTER TABLE public.table_pagination_settings VALIDATE CONSTRAINT "table_pagination_settings_updated_by_id_fkey";
ALTER TABLE public.announcement_attachments VALIDATE CONSTRAINT "announcement_attachments_created_by_id_fkey";

-- 品目の作成記録（d630）。別スキーマに同名が残っていれば、どこに在るかを出して止める。
-- 探す範囲は、対象表と別スキーマの同名だけ（対象表の前後の表は、同名の制約があっても流れない）。
DO $$
DECLARE
  places text;
BEGIN
  SELECT string_agg(n.nspname || '.' || t.relname, ', ' ORDER BY n.nspname, t.relname) INTO places
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.conname = 'products_created_by_fkey'
    AND (c.conrelid = 'public.products'::regclass OR n.nspname <> 'public');
  IF places IS DISTINCT FROM 'public.products' THEN
    RAISE EXCEPTION 'products_created_by_fkey が public.products 以外にも在る（%）', coalesce(places, '見つからない');
  END IF;
END $$;

ALTER TABLE public.products DROP CONSTRAINT products_created_by_fkey;
ALTER TABLE public.products ADD CONSTRAINT products_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public.products VALIDATE CONSTRAINT products_created_by_fkey;

-- 品目の更新記録（d630）。
DO $$
DECLARE
  places text;
BEGIN
  SELECT string_agg(n.nspname || '.' || t.relname, ', ' ORDER BY n.nspname, t.relname) INTO places
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.conname = 'products_updated_by_fkey'
    AND (c.conrelid = 'public.products'::regclass OR n.nspname <> 'public');
  IF places IS DISTINCT FROM 'public.products' THEN
    RAISE EXCEPTION 'products_updated_by_fkey が public.products 以外にも在る（%）', coalesce(places, '見つからない');
  END IF;
END $$;

ALTER TABLE public.products DROP CONSTRAINT products_updated_by_fkey;
ALTER TABLE public.products ADD CONSTRAINT products_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public.products VALIDATE CONSTRAINT products_updated_by_fkey;

COMMIT;
