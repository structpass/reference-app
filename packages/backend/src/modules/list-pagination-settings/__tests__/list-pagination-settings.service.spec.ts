import { Test, TestingModule } from '@nestjs/testing';
import { ListPaginationSettingsService } from '../list-pagination-settings.service';
import {
  ListPaginationSettingsRepository,
  type TablePaginationSettingWithUpdater,
} from '../repositories/list-pagination-settings.repository';

const baseEntity: TablePaginationSettingWithUpdater = {
  tableId: 'products',
  defaultPageSize: 50,
  pageSizeOptions: '10,20,50,100',
  createdAt: new Date('2026-05-09T00:00:00Z'),
  updatedAt: new Date('2026-05-09T00:00:00Z'),
  updatedById: 'admin-1',
  updatedBy: { id: 'admin-1', name: 'admin' },
};

const expectedDtoShape = {
  tableId: 'products',
  defaultPageSize: 50,
  pageSizeOptions: '10,20,50,100',
  createdAt: '2026-05-09T00:00:00.000Z',
  updatedAt: '2026-05-09T00:00:00.000Z',
  updatedById: 'admin-1',
  updatedBy: { id: 'admin-1', name: 'admin' },
};

const mockRepo = {
  findAll: jest.fn(),
  findByTableId: jest.fn(),
  patch: jest.fn(),
  bulkUpsert: jest.fn(),
};

describe('ListPaginationSettingsService', () => {
  let service: ListPaginationSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListPaginationSettingsService,
        { provide: ListPaginationSettingsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<ListPaginationSettingsService>(ListPaginationSettingsService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('repo.findAll を呼んで DTO 配列を ok shape で返すこと', async () => {
      mockRepo.findAll.mockResolvedValue([baseEntity]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(expectedDtoShape);
    });

    it('空配列の場合も success を返すこと', async () => {
      mockRepo.findAll.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('findByTableId', () => {
    it('該当ありの場合 DTO を返す', async () => {
      mockRepo.findByTableId.mockResolvedValue(baseEntity);

      const result = await service.findByTableId('products');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedDtoShape);
    });

    it('該当なしの場合 data: null', async () => {
      mockRepo.findByTableId.mockResolvedValue(null);

      const result = await service.findByTableId('products');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('update', () => {
    it('repo.patch に dto と userId を渡し DTO を返す', async () => {
      mockRepo.patch.mockResolvedValue(baseEntity);

      const result = await service.update('products', { defaultPageSize: 50 }, 'admin-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(expectedDtoShape);
      expect(mockRepo.patch).toHaveBeenCalledWith('products', { defaultPageSize: 50 }, 'admin-1');
    });
  });

  describe('bulkUpdate', () => {
    it('repo.bulkUpsert に updates と userId を渡し DTO 配列を返す', async () => {
      mockRepo.bulkUpsert.mockResolvedValue([baseEntity]);

      const result = await service.bulkUpdate(
        [{ tableId: 'products', defaultPageSize: 50, pageSizeOptions: '10,20,50,100' }],
        'admin-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(expectedDtoShape);
      expect(mockRepo.bulkUpsert).toHaveBeenCalled();
    });
  });
});
