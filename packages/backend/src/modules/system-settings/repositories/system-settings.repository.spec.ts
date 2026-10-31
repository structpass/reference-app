import { Test, TestingModule } from '@nestjs/testing';
import { SystemSettingsRepository } from './system-settings.repository';
import { PrismaService } from '../../../database/prisma.service';

// PrismaService を mock し、bulkUpdateAtomic が「同一 transaction 内で
// 読み取り → 検証 → 書き込み」を完結させることを検証する（ref-0064）。
// 既存流儀（stocks.repository.spec.ts）に合わせ Prisma 呼び出しは jest.fn()。
const mockPrisma = {
  systemSetting: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

// interactive transaction の mock: 渡されたコールバックを mockTx で即時実行する。
const mockTx = {
  systemSetting: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

describe('SystemSettingsRepository', () => {
  let repo: SystemSettingsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SystemSettingsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<SystemSettingsRepository>(SystemSettingsRepository);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => unknown) =>
      cb(mockTx),
    );
  });

  describe('bulkUpdateAtomic (一括更新の原子性)', () => {
    const updates = [
      { key: 'company_name', value: '新社名' },
      { key: 'currency', value: 'JPY' },
    ];
    const userId = 'user-1';
    const noopValidate = jest.fn();

    it('読み取り・検証・書き込みを同一 transaction 内で完結させること', async () => {
      mockTx.systemSetting.findMany.mockResolvedValue([{ key: 'company_name' }]);
      mockTx.systemSetting.update.mockResolvedValue(null);
      mockPrisma.$transaction.mockClear();

      await repo.bulkUpdateAtomic(updates, userId, noopValidate);

      // interactive transaction（コールバック形式）で呼ばれていること
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(typeof mockPrisma.$transaction.mock.calls[0][0]).toBe('function');

      // tx 内での読み取りは updates のキー集合で絞られること
      expect(mockTx.systemSetting.findMany).toHaveBeenCalledWith({
        where: { key: { in: ['company_name', 'currency'] } },
      });

      // 各 update は tx 経由（mockTx）で value と updatedBy を渡すこと
      expect(mockTx.systemSetting.update).toHaveBeenCalledTimes(2);
      expect(mockTx.systemSetting.update).toHaveBeenCalledWith({
        where: { key: 'company_name' },
        data: { value: '新社名', updatedBy: { connect: { id: userId } } },
        include: expect.any(Object),
      });
      expect(mockTx.systemSetting.update).toHaveBeenCalledWith({
        where: { key: 'currency' },
        data: { value: 'JPY', updatedBy: { connect: { id: userId } } },
        include: expect.any(Object),
      });
    });

    it('validate には tx 内で読み取った fresh な結果が渡ること', async () => {
      const fresh = [{ key: 'company_name' }, { key: 'currency' }];
      mockTx.systemSetting.findMany.mockResolvedValue(fresh);
      mockTx.systemSetting.update.mockResolvedValue(null);
      const validate = jest.fn();

      await repo.bulkUpdateAtomic(updates, userId, validate);

      expect(validate).toHaveBeenCalledWith(fresh);
    });

    it('validate がスローしたら書き込みは 1 件も実行されないこと（transaction 中断）', async () => {
      mockTx.systemSetting.findMany.mockResolvedValue([{ key: 'company_name' }]);
      const validate = jest.fn().mockImplementation(() => {
        throw new Error('key not found');
      });

      await expect(repo.bulkUpdateAtomic(updates, userId, validate)).rejects.toThrow(
        'key not found',
      );

      expect(mockTx.systemSetting.update).not.toHaveBeenCalled();
    });

    it('更新結果を更新順の配列で返すこと', async () => {
      mockTx.systemSetting.findMany.mockResolvedValue([{ key: 'company_name' }]);
      mockTx.systemSetting.update
        .mockResolvedValueOnce({ key: 'company_name' })
        .mockResolvedValueOnce({
          key: 'currency',
        });

      const result = await repo.bulkUpdateAtomic(updates, userId, noopValidate);

      expect(result).toEqual([{ key: 'company_name' }, { key: 'currency' }]);
    });
  });

  describe('updateByKey', () => {
    it('value と updatedBy を connect で渡すこと', async () => {
      mockPrisma.systemSetting.update.mockResolvedValue(null);

      await repo.updateByKey('company_name', '新社名', 'user-1');

      expect(mockPrisma.systemSetting.update).toHaveBeenCalledWith({
        where: { key: 'company_name' },
        data: {
          value: '新社名',
          updatedBy: { connect: { id: 'user-1' } },
        },
        include: expect.any(Object),
      });
    });
  });
});
