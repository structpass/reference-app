import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { AuditRepository } from './repositories/audit.repository';

const mockAuditRepository = {
  create: jest.fn(),
};

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: AuditRepository, useValue: mockAuditRepository }],
    }).compile();

    service = module.get<AuditService>(AuditService);

    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    const baseParams = {
      userId: 'user-uuid-1',
      entityType: 'Product',
      entityId: 'product-uuid-1',
      action: 'CREATE' as any,
    };

    it('監査ログを作成すること', async () => {
      mockAuditRepository.create.mockResolvedValue({ id: 'log-1' });

      await service.log(baseParams);

      expect(mockAuditRepository.create).toHaveBeenCalledWith(baseParams);
    });

    it('oldValuesとnewValuesを含む監査ログを作成すること', async () => {
      const params = {
        ...baseParams,
        action: 'UPDATE' as any,
        oldValues: { name: '旧名前' },
        newValues: { name: '新名前' },
      };
      mockAuditRepository.create.mockResolvedValue({ id: 'log-2' });

      await service.log(params);

      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ oldValues: { name: '旧名前' }, newValues: { name: '新名前' } }),
      );
    });

    it('Prismaエラー時にスローせずログを出力すること', async () => {
      mockAuditRepository.create.mockRejectedValue(new Error('DB error'));

      // エラーがスローされないことを確認（監査ログはfire-and-forget）
      await expect(service.log(baseParams)).resolves.not.toThrow();
    });

    it('DELETEアクションのログを作成できること', async () => {
      const params = {
        ...baseParams,
        action: 'DELETE' as any,
        oldValues: { name: '削除商品' },
      };
      mockAuditRepository.create.mockResolvedValue({ id: 'log-3' });

      await service.log(params);

      expect(mockAuditRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', oldValues: { name: '削除商品' } }),
      );
    });
  });
});
