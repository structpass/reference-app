/**
 * Repository の tx-aware メソッド（`*InTx`）が、渡された TransactionClient 経由で
 * モデル操作を呼び、非 tx の `this.prisma` を一切叩かないことを検証する共通 spec。
 *
 * 「Service が runInTransaction で束ねたのに repository が this.prisma を呼ぶ」＝
 * 偽の原子性（CODE-H1: 在庫整合の退行）を検出する。orders は個別 spec で同等検証済、
 * receivings / shipments / stocktakings は本ヘルパで宣言的に横展開する。
 *
 * 検証ロジックを 1 箇所に集約し、モジュール間の逐語コピペを避ける
 * （architecture-invariants §3）。各モジュールの spec は model / op / 引数だけを
 * 宣言する薄い config に留める。
 *
 * 展開されるテスト数 = config.cases.length + 1（末尾の runInTransaction 委譲ケース）。
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Type } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

// 現状の対象 3 モジュール（receivings / shipments / stocktakings）の *InTx が使う op に限定。
// stocks のように upsert / create を tx で使うモジュールを将来このヘルパに乗せる場合は拡張する。
type PrismaOp = 'update' | 'deleteMany' | 'delete' | 'findFirst' | 'findUnique';

/** tx-aware メソッド 1 件の検証ケース。 */
export interface TxIdentityCase {
  /** it() のラベル。 */
  label: string;
  /** tx 上で呼ばれるべき model キー（例: 'shipment'）。txFunction を使う場合は不要。 */
  txModel?: string;
  /** tx 上で呼ばれるべき op（txModel 使用時に必須）。 */
  txOp?: PrismaOp;
  /** tx 上で呼ばれるべきトップレベル関数（例: '$queryRaw'）。txModel/txOp の代替。 */
  txFunction?: string;
  /** repo メソッドを (repo, tx) で起動する。 */
  invoke: (
    repo: Record<string, (...args: never[]) => unknown>,
    tx: unknown,
  ) => Promise<unknown> | unknown;
  /** tx op に渡る引数の matcher（`toHaveBeenCalledWith` に展開する）。 */
  expectedArg: unknown | unknown[];
  /** txFunction（$queryRaw 等）使用時、第1引数（テンプレート文字列配列）に含まれるべき SQL 断片。 */
  expectedSqlIncludes?: string;
}

export interface TxIdentityConfig<R> {
  repoName: string;
  RepoClass: Type<R>;
  /** mock を生やす model と op（prisma 側・tx 側 両方に同じ shape を作る）。 */
  models: Record<string, PrismaOp[]>;
  cases: TxIdentityCase[];
}

export function describeRepositoryTxIdentity<R>(config: TxIdentityConfig<R>): void {
  describe(`${config.repoName} — tx 委譲の同一性 (CODE-H1)`, () => {
    let repo: R;
    let mockPrisma: Record<string, Record<string, jest.Mock>> & {
      $transaction: jest.Mock;
      $queryRaw: jest.Mock;
    };
    let mockTx: Record<string, Record<string, jest.Mock>> & { $queryRaw: jest.Mock };

    const asArgs = (v: unknown | unknown[]): unknown[] => (Array.isArray(v) ? v : [v]);

    const buildModelMocks = (): Record<string, Record<string, jest.Mock>> => {
      const obj: Record<string, Record<string, jest.Mock>> = {};
      for (const [model, ops] of Object.entries(config.models)) {
        obj[model] = {};
        // 既定で解決させる（lock 後の findFirst など、ケースの対象 op 以外の呼び出しを許容）。
        for (const op of ops) obj[model][op] = jest.fn().mockResolvedValue({});
      }
      return obj;
    };

    beforeEach(async () => {
      mockPrisma = Object.assign(buildModelMocks(), {
        $transaction: jest.fn(),
        $queryRaw: jest.fn(),
      });
      mockTx = Object.assign(buildModelMocks(), { $queryRaw: jest.fn() });
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [config.RepoClass, { provide: PrismaService, useValue: mockPrisma }],
      }).compile();
      repo = moduleRef.get<R>(config.RepoClass);
    });

    for (const c of config.cases) {
      it(c.label, async () => {
        if (c.txFunction) {
          await c.invoke(repo as never, mockTx);
          expect(mockTx[c.txFunction]).toHaveBeenCalledWith(...asArgs(c.expectedArg));
          // 非 tx の prisma 側は呼ばれない（ロックが tx 外に漏れていないこと）
          expect(mockPrisma[c.txFunction]).not.toHaveBeenCalled();
          // $queryRaw はタグ付きテンプレート（第1引数=文字列配列）。SQL 断片まで検査し、
          // 「呼び出しはあるが FOR UPDATE が消えた」退行を unit で捕まえる。
          if (c.expectedSqlIncludes) {
            // jest.Mock を index 経由で引くと mock の型が落ちて `calls` を読めない
            // （@types/jest 29.5.14 / TS2551）。読みたい形へ構造を絞って cast する。
            const spy = mockTx[c.txFunction] as unknown as { mock: { calls: unknown[][] } };
            const strings = spy.mock.calls[0]?.[0];
            const sql = Array.isArray(strings) ? strings.join(' ? ') : String(strings);
            expect(sql).toContain(c.expectedSqlIncludes);
          }
          return;
        }
        mockTx[c.txModel!][c.txOp!].mockResolvedValue({});
        await c.invoke(repo as never, mockTx);
        expect(mockTx[c.txModel!][c.txOp!]).toHaveBeenCalledWith(...asArgs(c.expectedArg));
        // 非 tx の prisma 側は呼ばれない（更新が tx 外に漏れていないこと）
        expect(mockPrisma[c.txModel!][c.txOp!]).not.toHaveBeenCalled();
      });
    }

    it('runInTransaction が prisma.$transaction に委譲し、同一 tx を callback に渡す', async () => {
      mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockTx));
      let received: unknown;
      await (
        repo as unknown as { runInTransaction: (fn: (tx: unknown) => unknown) => Promise<unknown> }
      ).runInTransaction(async (tx: unknown) => {
        received = tx;
        return {};
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(received).toBe(mockTx);
    });
  });
}
