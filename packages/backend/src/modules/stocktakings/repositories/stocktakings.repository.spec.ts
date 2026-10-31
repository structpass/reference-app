import { StocktakingsRepository } from './stocktakings.repository';
import { describeRepositoryTxIdentity } from '@/__tests__/helpers/repository-tx-identity';

/**
 * 棚卸 repository の tx 委譲検証。棚卸確定は在庫上書きを伴うため、明細削除・親更新が
 * Service の runInTransaction と同一 tx に乗ること（偽原子性でないこと）を守る。
 * 棚卸は soft delete を持たず hard delete のため softDeleteInTx ケースは無い。
 */
describeRepositoryTxIdentity({
  repoName: 'StocktakingsRepository',
  RepoClass: StocktakingsRepository,
  models: { stocktaking: ['update', 'findUnique', 'delete'], stocktakingItem: ['deleteMany'] },
  cases: [
    {
      label: 'lockByIdWithItemsInTx は tx.$queryRaw で対象行を FOR UPDATE する',
      txFunction: '$queryRaw',
      invoke: (r, tx) => r.lockByIdWithItemsInTx(tx as never, 1 as never),
      expectedArg: [expect.anything(), 1],
      expectedSqlIncludes: 'FOR UPDATE',
    },
    {
      label: 'deleteInTx は tx.stocktaking.delete を使う',
      txModel: 'stocktaking',
      txOp: 'delete',
      invoke: (r, tx) => r.deleteInTx(tx as never, 1 as never),
      expectedArg: { where: { id: 1 } },
    },
    {
      label: 'deleteItemsInTx は tx.stocktakingItem.deleteMany を使う',
      txModel: 'stocktakingItem',
      txOp: 'deleteMany',
      invoke: (r, tx) => r.deleteItemsInTx(tx as never, 1 as never),
      expectedArg: { where: { stocktakingId: 1 } },
    },
    {
      label: 'updateInTx は tx.stocktaking.update を使う',
      txModel: 'stocktaking',
      txOp: 'update',
      invoke: (r, tx) => r.updateInTx(tx as never, 1 as never, { status: 'CONFIRMED' } as never),
      expectedArg: expect.objectContaining({ where: { id: 1 } }),
    },
    {
      label: 'updateStatusInTx は tx.stocktaking.update を使う',
      txModel: 'stocktaking',
      txOp: 'update',
      invoke: (r, tx) => r.updateStatusInTx(tx as never, 1 as never, 'CONFIRMED' as never),
      expectedArg: expect.objectContaining({ where: { id: 1 }, data: { status: 'CONFIRMED' } }),
    },
  ],
});
