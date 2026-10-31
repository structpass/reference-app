import { PrismaClient } from '@prisma/client';

/**
 * announcements 機能を permission matrix の管理対象から外したことに伴う
 * 既存 RolePermission レコードの掃除（2026-05-11）。
 *
 * 背景: Rete のチャット機能で業務発信を代替する方針となり、announcements は
 * SYS_ADMIN 固定運用に縮退。RolePermission での権限制御を廃止した。
 *
 * 冪等: 削除対象が存在しなくても安全に再実行可能。
 *
 * 譲渡先での運用: 本スクリプトは seed.ts から自動呼び出しされる。本番 DB で
 * seed を流さない環境では以下の SQL を `pnpm prisma db execute` で直実行する。
 *
 * ```sql
 * DELETE FROM "RolePermission" WHERE "featureId" = 'announcements';
 * ```
 */
export async function cleanupAnnouncementsPermission(prisma: PrismaClient): Promise<void> {
  const result = await prisma.rolePermission.deleteMany({
    where: { featureId: 'announcements' },
  });
  if (result.count > 0) {
    console.log(`RolePermission(announcements) cleaned: ${result.count} rows deleted`);
  }
}
