/**
 * 公開スナップショット文脈の判定（d954）。
 *
 * 公開リポジトリには overlay（rete リポジトリの scripts/publish/targets/reference.json）が
 * `.public-snapshot` を置く。社内リポジトリには置かない。本番配備（.github/workflows/deploy.yml）は
 * 公開物へ含めないため、deploy.yml を読む検査は公開文脈では「配備を持たない」という境界だけを
 * 確かめて終わる。社内文脈では従来どおり deploy.yml の不在を赤にする（黙って skip しない）。
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml';
export const IS_PUBLICATION_SNAPSHOT = existsSync(path.join(ROOT, '.public-snapshot'));

/**
 * 公開文脈なら境界を確かめて true を返す（呼び出し側はそこで終える）。社内文脈は false。
 * 公開物に deploy.yml が入っていたら、その場で失敗させる（境界の逆流を検出する）。
 */
export function stopIfPublicationSnapshot(label) {
  if (!IS_PUBLICATION_SNAPSHOT) return false;
  if (existsSync(path.join(ROOT, DEPLOY_WORKFLOW))) {
    console.error(
      `${DEPLOY_WORKFLOW} が公開スナップショットに入っています＝公開物は本番配備を持ちません` +
        '（scripts/publish/targets/reference.json の excludeFiles を確認してください）',
    );
    process.exit(1);
  }
  console.log(
    `公開スナップショット: 本番配備（${DEPLOY_WORKFLOW}）を持たないため ${label} は対象外（境界は確認済み）`,
  );
  return true;
}
