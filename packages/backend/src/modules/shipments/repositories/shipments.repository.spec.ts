import { ShipmentsRepository } from './shipments.repository';
import { describeRepositoryTxIdentity } from '@/__tests__/helpers/repository-tx-identity';

/**
 * 出荷 repository の tx 委譲検証。出荷確定は在庫減算を伴うため、明細削除・親更新が
 * Service の runInTransaction と同一 tx に乗ること（oversell を生む偽原子性でないこと）を守る。
 */
describeRepositoryTxIdentity({
  repoName: 'ShipmentsRepository',
  RepoClass: ShipmentsRepository,
  models: { shipment: ['update'], shipmentLine: ['deleteMany'] },
  cases: [
    {
      label: 'deleteLinesInTx は tx.shipmentLine.deleteMany を使う',
      txModel: 'shipmentLine',
      txOp: 'deleteMany',
      invoke: (r, tx) => r.deleteLinesInTx(tx as never, 1 as never),
      expectedArg: { where: { shipmentId: 1 } },
    },
    {
      label: 'updateInTx は tx.shipment.update を使う',
      txModel: 'shipment',
      txOp: 'update',
      invoke: (r, tx) => r.updateInTx(tx as never, 1 as never, { status: 'CONFIRMED' } as never),
      expectedArg: expect.objectContaining({ where: { id: 1 } }),
    },
    {
      label: 'updateStatusInTx は tx.shipment.update を使う',
      txModel: 'shipment',
      txOp: 'update',
      invoke: (r, tx) => r.updateStatusInTx(tx as never, 1 as never, 'CONFIRMED' as never),
      expectedArg: expect.objectContaining({ where: { id: 1 }, data: { status: 'CONFIRMED' } }),
    },
    {
      label: 'softDeleteInTx は tx.shipment.update を使う',
      txModel: 'shipment',
      txOp: 'update',
      invoke: (r, tx) => r.softDeleteInTx(tx as never, 1 as never),
      expectedArg: expect.objectContaining({ where: { id: 1 } }),
    },
  ],
});
