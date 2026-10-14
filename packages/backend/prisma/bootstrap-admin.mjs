#!/usr/bin/env node
/**
 * 本番専用の初期管理者（SYS_ADMIN）bootstrap（ref-0086）。
 *
 * - plain Node + @prisma/client のみ（ts-node / devDependencies 非依存＝pnpm install --prod 後の本番イメージで実行可能）
 * - 冪等: 再実行・毎デプロイ実行で結果が変わらない（既存ユーザーの email / name は上書きしない）
 * - 両順序対応: SSO 初回ログイン（承認待ち JIT）の前後どちらでも、最終状態が SYS_ADMIN + isActive=true になる
 *
 * 使い方:
 *   BOOTSTRAP_ADMIN_SUB=<rete Account.id> \
 *   BOOTSTRAP_ADMIN_EMAIL=<admin@example.com> \
 *   BOOTSTRAP_ADMIN_NAME=<表示名・省略時 email 流用> \
 *   node prisma/bootstrap-admin.mjs
 *
 * BOOTSTRAP_ADMIN_SUB 未設定時は明示メッセージで skip 終了（開発・既存本番のデプロイを壊さない）。
 * BOOTSTRAP_ADMIN_SUB は rete 側 Account.id と同一値である必要がある（operational-policy.md）。
 */
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

/**
 * email のログ用マスク（PII 対策）。stdout / エラーメッセージは deploy.yml 経由で GitHub Actions
 * ログに残るため、実 email をそのまま出さない（security-reviewer LOW・ref-0086）。
 */
function maskEmail(email) {
  return typeof email === 'string' ? email.replace(/^(.).*?(@.*)$/, '$1***$2') : String(email);
}

/**
 * 既存ユーザーを SYS_ADMIN・有効へ昇格する（email / name は触らない＝SSO claim 由来の値を汚さない・
 * ref-0086 criteria 2）。SUB の打ち間違いで無関係ユーザーを静かに昇格させないため、env の email と
 * 実ユーザーの email が食い違う時はマスク付きの警告を添える（security-reviewer MEDIUM。拒否には
 * しない＝SSO claim で email が正しく更新された正常系でも env 側と乖離しうるため）。
 */
async function promoteExisting(prisma, existing, email) {
  const mismatch =
    existing.email !== email
      ? `（警告: 実ユーザーの email は ${maskEmail(existing.email)} で BOOTSTRAP_ADMIN_EMAIL と不一致です。SUB の指し先を確認してください）`
      : '';
  if (existing.role === 'SYS_ADMIN' && existing.isActive) {
    return `[bootstrap-admin] ${maskEmail(existing.email)} は既に SYS_ADMIN・有効です（変更なし）${mismatch}`;
  }
  await prisma.user.update({
    where: { id: existing.id },
    data: { role: 'SYS_ADMIN', isActive: true },
  });
  return `[bootstrap-admin] ${maskEmail(existing.email)} を SYS_ADMIN・有効へ昇格しました${mismatch}`;
}

/**
 * 管理者 bootstrap のコア処理（テスト可能な純粋関数）。
 * prisma を注入することで、実 DB を触らずに昇格 / 作成 / 冪等 / skip を検証できる
 * （src/__tests__/bootstrap-admin.harness.mjs が注入テストとして消費する）。
 *
 * @returns {Promise<string>} 結果メッセージ
 */
export async function bootstrapAdmin({ prisma, sub, email, name }) {
  if (!sub) {
    return '[bootstrap-admin] BOOTSTRAP_ADMIN_SUB 未設定のためスキップします（dev / 既存本番）';
  }
  if (!email) {
    throw new Error(
      '[bootstrap-admin] BOOTSTRAP_ADMIN_EMAIL が未設定です。BOOTSTRAP_ADMIN_SUB を指定する時は必須です。',
    );
  }

  const existing = await prisma.user.findUnique({ where: { oidcSub: sub } });
  if (existing) {
    // 既存（SSO JIT で承認待ち = role null / isActive false の可能性）は昇格のみ。
    return promoteExisting(prisma, existing, email);
  }

  // 未作成：事前作成（email 一意衝突は P2002 を捕捉して明示エラー）。
  // 省略時は email を流用。?? でなく || にする＝compose の ${BOOTSTRAP_ADMIN_NAME:-} は未設定を
  // 空文字で渡すため、'' も「省略」として扱わないと表示名が空のユーザーができる。
  const displayName = name || email;
  try {
    await prisma.user.create({
      data: { oidcSub: sub, email, name: displayName, role: 'SYS_ADMIN', isActive: true },
    });
    return `[bootstrap-admin] ${maskEmail(email)} を SYS_ADMIN・有効で作成しました`;
  } catch (e) {
    if (e && typeof e === 'object' && e?.code === 'P2002') {
      // TOCTOU: findUnique 不在 → create の間に SSO 初回ログイン JIT が同 sub で作成すると、
      // oidcSub 一意制約の P2002 がここへ落ちる（database-reviewer MEDIUM）。まず sub で再取得し、
      // 居れば昇格経路へフォールバック（JIT 側 users.service の P2002 リカバリと同型）。
      // 居ない時だけ本当に email 衝突＝運用者の判断が要るケースとして明示エラーにする。
      const raced = await prisma.user.findUnique({ where: { oidcSub: sub } });
      if (raced) {
        return promoteExisting(prisma, raced, email);
      }
      throw new Error(
        `[bootstrap-admin] email=${maskEmail(email)} が既存ユーザーと衝突しています（P2002）。` +
          '別の email を BOOTSTRAP_ADMIN_EMAIL に指定してください。',
      );
    }
    throw e;
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const message = await bootstrapAdmin({
      prisma,
      sub: process.env.BOOTSTRAP_ADMIN_SUB,
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      name: process.env.BOOTSTRAP_ADMIN_NAME,
    });
    console.log(message);
  } finally {
    await prisma.$disconnect();
  }
}

// 直接実行された時のみ main を走らせる（import された時はテストが bootstrapAdmin を使う）。
// pathToFileURL による URL 同士の厳密比較＝Windows のパス区切りも空白の %20 も正規化される
// （basename 末尾一致だと「同名の別ファイル」でも真になる・code-reviewer MEDIUM）。
const invokedUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedUrl && import.meta.url === invokedUrl) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
