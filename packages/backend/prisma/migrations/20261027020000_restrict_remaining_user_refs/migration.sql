-- 作成・更新の記録（d810）。
-- 品目（d630）と同じ扱いに揃える。掲示の作成者・更新者、システム設定と一覧のページサイズ設定の
-- 最終更新者、告知の添付者の欄が users を参照しており、利用者を消すと NULL に書き換わって
-- 誰が書いた・触ったかの記録が空になっていた。参照が残っていれば外部キー違反で利用者の削除を止め、
-- 消したい利用者は status=INACTIVE で無効化する。
--
-- announcements.created_by_id は必須参照のため、本リポジトリの移行から作った DB では既に RESTRICT
-- （Prisma 既定）になっている。ただし構築の途中で手を入れた DB では SET NULL のこともある
-- （2026-10-27 の開発DBで実測）。手順に依らず同じ定義へ揃うよう、5 本とも同じ形で張り直す。
BEGIN;

-- 制約名はスキーマを跨いで一意ではない。名前だけで `DROP CONSTRAINT` を書くと、別スキーマに
-- 同名の制約がある時に "ambiguous" で止まる（開発DBには検証用のスキーマが生えている）。
-- 対象 5 本を表・欄・制約名で明示し、各表のスキーマを引き当ててから、そのスキーマ付きで
-- 落として張り直す。5 本はどれも在るはずなので、引けない時は黙って飛ばさず止める
-- （静かに通ると、その欄だけ SET NULL のまま残る）。
DO $$
DECLARE
  targets text[][] := ARRAY[
    ['announcements', 'created_by_id', 'announcements_created_by_id_fkey'],
    ['announcements', 'updated_by_id', 'announcements_updated_by_id_fkey'],
    ['announcement_attachments', 'created_by_id', 'announcement_attachments_created_by_id_fkey'],
    ['system_parameters', 'updated_by_id', 'system_parameters_updated_by_id_fkey'],
    ['table_pagination_settings', 'updated_by_id', 'table_pagination_settings_updated_by_id_fkey']
  ];
  i int;
  target_table text;
  target_column text;
  fk_name text;
  target_schema text;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    target_table := targets[i][1];
    target_column := targets[i][2];
    fk_name := targets[i][3];
    SELECT n.nspname INTO target_schema
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.conname = fk_name AND c.contype = 'f' AND t.relname = target_table
    ORDER BY (n.nspname = 'public') DESC, n.nspname
    LIMIT 1;
    IF target_schema IS NULL THEN
      RAISE EXCEPTION '外部キー % が見つからない（対象表か制約の前提が変わっている）', fk_name;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', target_schema, target_table, fk_name);
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.users(id) ON DELETE RESTRICT ON UPDATE CASCADE',
      target_schema, target_table, fk_name, target_column, target_schema
    );
  END LOOP;
END $$;

COMMIT;
