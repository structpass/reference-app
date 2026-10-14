-- SSO 一本化（Step4）: identity SoT を rete(IdP) に移管。
-- reference の LocalAuth 関連列（username / password_hash / must_change_password）を撤去し、
-- OIDC sub リンクキー（oidc_sub）と表示名（name）を追加。role は pending(承認待ち) 表現のため nullable 化。

-- DropIndex
DROP INDEX "users_username_key";

-- AlterTable
-- 旧データには username だけが存在し name が無いため、先に nullable で追加して表示名を埋め戻す。
-- その後に NOT NULL 化することで、既存ユーザーを削除せず SSO 移行できる。
ALTER TABLE "users" DROP COLUMN "must_change_password",
DROP COLUMN "password_hash",
ADD COLUMN     "name" TEXT,
ADD COLUMN     "oidc_sub" TEXT,
ALTER COLUMN "role" DROP NOT NULL,
ALTER COLUMN "role" DROP DEFAULT;

UPDATE "users"
SET "name" = COALESCE(NULLIF("username", ''), NULLIF("email", ''), "id")
WHERE "name" IS NULL;

ALTER TABLE "users" DROP COLUMN "username",
ALTER COLUMN "name" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_oidc_sub_key" ON "users"("oidc_sub");
