import { Test, TestingModule } from '@nestjs/testing';
import {
  ListPaginationSettingsRepository,
  type TablePaginationSettingWithUpdater,
} from '../repositories/list-pagination-settings.repository';
import { PrismaService } from '../../../database/prisma.service';

const entity: TablePaginationSettingWithUpdater = {
  tableId: 'products',
  defaultPageSize: 50,
  pageSizeOptions: '10,20,50,100',
  createdAt: new Date('2026-05-09T00:00:00Z'),
  updatedAt: new Date('2026-05-09T00:00:00Z'),
  updatedById: 'admin-1',
  updatedBy: { id: 'admin-1', name: 'admin' },
};

const mockPrisma = {
  tablePaginationSetting: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('ListPaginationSettingsRepository', () => {
  let repo: ListPaginationSettingsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListPaginationSettingsRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repo = module.get<ListPaginationSettingsRepository>(ListPaginationSettingsRepository);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('include: updatedBy 付きで全件を tableId asc で返す', async () => {
      mockPrisma.tablePaginationSetting.findMany.mockResolvedValue([entity]);

      const result = await repo.findAll();

      expect(result).toEqual([entity]);
      expect(mockPrisma.tablePaginationSetting.findMany).toHaveBeenCalledWith({
        include: { updatedBy: { select: { id: true, name: true } } },
        orderBy: { tableId: 'asc' },
      });
    });
  });

  describe('findByTableId', () => {
    it('tableId 単一指定で findUnique を呼ぶ', async () => {
      mockPrisma.tablePaginationSetting.findUnique.mockResolvedValue(entity);

      const result = await repo.findByTableId('products');

      expect(result).toEqual(entity);
      expect(mockPrisma.tablePaginationSetting.findUnique).toHaveBeenCalledWith({
        where: { tableId: 'products' },
        include: { updatedBy: { select: { id: true, name: true } } },
      });
    });

    it('未設定の tableId は null を返す', async () => {
      mockPrisma.tablePaginationSetting.findUnique.mockResolvedValue(null);

      const result = await repo.findByTableId('warehouses');

      expect(result).toBeNull();
    });
  });

  describe('upsert', () => {
    it('create / update どちらにも updatedById を含める', async () => {
      mockPrisma.tablePaginationSetting.upsert.mockResolvedValue(entity);

      const result = await repo.upsert('products', 50, '10,20,50,100', 'admin-1');

      expect(result).toEqual(entity);
      expect(mockPrisma.tablePaginationSetting.upsert).toHaveBeenCalledWith({
        where: { tableId: 'products' },
        create: {
          tableId: 'products',
          defaultPageSize: 50,
          pageSizeOptions: '10,20,50,100',
          updatedById: 'admin-1',
        },
        update: {
          defaultPageSize: 50,
          pageSizeOptions: '10,20,50,100',
          updatedById: 'admin-1',
        },
        include: { updatedBy: { select: { id: true, name: true } } },
      });
    });
  });

  describe('patch', () => {
    it('部分更新で update を呼ぶ', async () => {
      mockPrisma.tablePaginationSetting.update.mockResolvedValue(entity);

      const result = await repo.patch('products', { defaultPageSize: 50 }, 'admin-1');

      expect(result).toEqual(entity);
      expect(mockPrisma.tablePaginationSetting.update).toHaveBeenCalledWith({
        where: { tableId: 'products' },
        data: { defaultPageSize: 50, updatedById: 'admin-1' },
        include: { updatedBy: { select: { id: true, name: true } } },
      });
    });
  });

  describe('bulkUpsert', () => {
    it('items を $transaction で並列 upsert する', async () => {
      mockPrisma.$transaction.mockResolvedValue([entity, { ...entity, tableId: 'orders' }]);

      const result = await repo.bulkUpsert(
        [
          { tableId: 'products', defaultPageSize: 50, pageSizeOptions: '10,20,50,100' },
          { tableId: 'orders', defaultPageSize: 100, pageSizeOptions: '50,100,200' },
        ],
        'admin-1',
      );

      expect(result).toHaveLength(2);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });
});
