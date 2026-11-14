-- 作成・更新の記録（d812・retrospect 2026-10-31 の DB 点検）。
--
-- 20261028020000 で 6 本を ON UPDATE NO ACTION へ張り直したが、掲示の作成者
-- （announcements_created_by_id_fkey）だけは対象から漏れ、ON UPDATE CASCADE のままだった。
-- schema.prisma は同じ移行で 7 本すべてを Restrict として書き出していたため、定義と実体が
-- 1 本ずれて残っていた（schema.prisma 側はこの移行に合わせて onUpdate: NoAction を明示する）。
--
-- これで利用者の ID を書き換える経路は 7 本すべてで断たれる。改名そのものは
-- users_id_unchanged トリガ（20261028020000）が止めるので、ここは定義の揃えが目的。
--
-- 張り直しは前の移行と同じく、別スキーマの同名に振り回されないよう対象表を明示する。
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.announcements DROP CONSTRAINT "announcements_created_by_id_fkey";
ALTER TABLE public.announcements ADD CONSTRAINT "announcements_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public.announcements VALIDATE CONSTRAINT "announcements_created_by_id_fkey";

COMMIT;
