-- field_defs.updated_at の DB 既定値を外す（d978）。
--
-- 20260703151540 で updated_at を DEFAULT CURRENT_TIMESTAMP を付けて足した。schema.prisma は
-- @updatedAt（DB の既定を持たず、Prisma が書き換えのたびに現在時刻を入れる）として書いている。
-- 既定が残っていると、Prisma 以外の経路で行を更新した時に updated_at が古いまま残る。
-- 定義（schema）と実体（DB）を揃えるため、既定だけを外す。データは変えない。
--
-- 戻し方: ALTER TABLE public.field_defs ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.field_defs ALTER COLUMN "updated_at" DROP DEFAULT;

COMMIT;
