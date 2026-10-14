import { ReceivingsRepository } from './receivings.repository';
import { describeRepositoryTxIdentity } from '@/__tests__/helpers/repository-tx-identity';

/**
 * 入荷 repository の tx 委譲検証。入荷確定は在庫加算を伴うため、明細削除・親更新が
 * Service の runInTransaction と同一 tx に乗ること（lost update を生む偽原子性でないこと）を守る。
 */
describeRepositoryTxIdentity({
  repoName: 'ReceivingsRepository',
  RepoClass: ReceivingsRepository,
  models: { receiving: ['update'], receivingLine: ['deleteMany'] },
  cases: [
    {
      label: 'deleteLinesInTx は tx.receivingLine.deleteMany を使う',
      txModel: 'receivingLine',
      txOp: 'deleteMany',
      invoke: (r, tx) => r.deleteLinesInTx(tx as never, 1 as never),
      expectedArg: { where: { receivingId: 1 } },
    },
    {
      label: 'updateInTx は tx.receiving.update を使う',
      txModel: 'receiving',
      txOp: 'update',
      invoke: (r, tx) => r.updateInTx(tx as never, 1 as never, { status: 'CONFIRMED' } as never),
      expectedArg: expect.objectContaining({ where: { id: 1 } }),
    },
    {
      label: 'updateStatusInTx は tx.receiving.update を使う',
      txModel: 'receiving',
      txOp: 'update',
      invoke: (r, tx) => r.updateStatusInTx(tx as never, 1 as never, 'CONFIRMED' as never),
      expectedArg: expect.objectContaining({ where: { id: 1 }, data: { status: 'CONFIRMED' } }),
    },
    {
      label: 'softDeleteInTx は tx.receiving.update を使う',
      txModel: 'receiving',
      txOp: 'update',
      invoke: (r, tx) => r.softDeleteInTx(tx as never, 1 as never),
      expectedArg: expect.objectContaining({ where: { id: 1 } }),
    },
  ],
});
