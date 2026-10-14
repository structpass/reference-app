/** DATABASE_URL に必須の接続プール指定（rete cmn-0251 からの移植・ref-0071）。 */
export const REQUIRED_DB_POOL_PARAMS = ['connection_limit', 'pool_timeout'] as const;

/**
 * 各パラメータの妥当域（ref-0071）。存在するだけでは目的を満たさないため値まで見る。
 * - connection_limit: 0 は「上限なし」ではなく異常値。単一インスタンスで 20 を超える指定は
 *   DB の max_connections を食い潰す側なので弾く（増やすなら policy の勘定を先に更新する）。
 * - pool_timeout: 0 は「無限待ち」＝ P2024 → 503 に落ちず待ち続ける状態そのもの。
 *   最長のトランザクション上限（商品一括取込の 60 秒・products.repository.ts）より長く取るため
 *   下限 65。写し元 rete の下限 15 は最長 tx が 15 秒である前提の値なので、そのまま持ち込むと
 *   取込の最中に無関係なリクエストが先に接続待ち超過で落ちる状態を許してしまう。
 */
const DB_POOL_PARAM_RANGE: Record<
  (typeof REQUIRED_DB_POOL_PARAMS)[number],
  { min: number; max: number }
> = {
  connection_limit: { min: 1, max: 20 },
  pool_timeout: { min: 65, max: 120 },
};

/**
 * DATABASE_URL に接続プールの上限指定があるかを検査する（rete cmn-0251・cmn-0347 の移植・ref-0071）。
 *
 * 上限が無いと Prisma 既定へ暗黙依存し、interactive tx（商品一括取込ほか）の同時実行が DB の
 * max_connections を食い潰す経路が残る（枯渇は OIDC callback のユーザー取得まで巻き込む＝ログイン不能）。
 * .env.example と operational-policy に書いただけでは既存の .env / compose へ伝播しないため、
 * 実際の接続文字列を見る。
 *
 * **呼び出し面（適用範囲）**:
 * - アプリ本体（main.ts）の起動時: 本番は fail-fast / dev・test は warn（開発を止めない）
 * - seed（prisma/seed.ts）: warn のみ・完走を止めない（環境構築の順序＝DB 作成 → seed → アプリ配備で
 *   プール指定なしのまま進むのを防ぐ。本番同様の起動拒否をすると順序が壊れるため警告に留める）。
 *   prisma/seed-announcements-only.ts は未使用判定済みの旧スクリプトのため対象外（ref-0071 design）
 * - migrate（prisma migrate）: CLI の別プロセスで検査の hook 点が無いため**適用範囲外**
 *
 * @returns null = OK / string = 欠けている旨のメッセージ（本番は起動を止める理由になる）
 */
export function validateDatabasePoolLimits(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null; // DATABASE_URL 自体の必須検査は main.ts の REQUIRED_ENV_VARS が担う。

  let query: URLSearchParams;
  try {
    query = new URL(databaseUrl).searchParams;
  } catch {
    // URL として読めない接続文字列は本検査の対象外（形式不正は Prisma 側が起動時に落とす）。
    return null;
  }

  const problems: string[] = [];
  for (const param of REQUIRED_DB_POOL_PARAMS) {
    const raw = query.get(param);
    if (!raw) {
      problems.push(`${param} が未指定`);
      continue;
    }
    // 「存在するだけ」では目的を満たさない（pool_timeout=0 は無限待ち＝防ぎたい状態そのもの）。
    if (!/^\d+$/.test(raw)) {
      problems.push(`${param} が整数ではない（got "${raw}"）`);
      continue;
    }
    const { min, max } = DB_POOL_PARAM_RANGE[param];
    const value = Number(raw);
    if (value < min || value > max) {
      problems.push(`${param} が想定域 ${min}〜${max} の外（got ${value}）`);
    }
  }
  if (problems.length === 0) return null;

  return (
    `DATABASE_URL の接続プール指定に問題があります（${problems.join(' / ')}）。` +
    '.env の DATABASE_URL へ ?connection_limit=5&pool_timeout=70 相当を設定してください' +
    '（上限が無い／緩すぎると同時実行が DB の max_connections を食い潰し、ログインまで巻き込みます・ref-0071）。'
  );
}
