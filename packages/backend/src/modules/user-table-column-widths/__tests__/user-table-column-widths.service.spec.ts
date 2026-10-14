import { Test, TestingModule } from '@nestjs/testing';
import { UserTableColumnWidth } from '@prisma/client';
import { UserTableColumnWidthsService } from '../user-table-column-widths.service';
import { UserTableColumnWidthsRepository } from '../repositories/user-table-column-widths.repository';

const baseEntity: UserTableColumnWidth = {
  userId: 'user-uuid-1',
  tableId: 'products',
  columnKey: 'name',
  width: 200,
  updatedAt: new Date('2026-05-07T00:00:00Z'),
};

const mockRepo = {
  findManyByUserAndTable: jest.fn(),
  upsert: jest.fn(),
};

describe('UserTableColumnWidthsService', () => {
  let service: UserTableColumnWidthsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTableColumnWidthsService,
        { provide: UserTableColumnWidthsRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<UserTableColumnWidthsService>(UserTableColumnWidthsService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('getMine', () => {
    it('repo.findManyByUserAndTable を呼んで ok shape を返すこと', async () => {
      mockRepo.findManyByUserAndTable.mockResolvedValue([baseEntity]);

      const result = await service.getMine('user-uuid-1', 'products');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      // DTO shape: userId なし、tableId / columnKey / width / updatedAt(ISO)
      expect(result.data[0]).toEqual({
        tableId: 'products',
        columnKey: 'name',
        width: 200,
        updatedAt: '2026-05-07T00:00:00.000Z',
      });
      expect(mockRepo.findManyByUserAndTable).toHaveBeenCalledWith('user-uuid-1', 'products');
    });

    it('空配列の場合も success を返すこと', async () => {
      mockRepo.findManyByUserAndTable.mockResolvedValue([]);

      const result = await service.getMine('user-uuid-1', 'products');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('upsert', () => {
    it('repo.upsert を呼んで ok(dto) shape を返すこと', async () => {
      mockRepo.upsert.mockResolvedValue(baseEntity);

      const result = await service.upsert('user-uuid-1', 'products', 'name', 200);

      expect(result.success).toBe(true);
      // upsert は DTO 本体を data に直接格納（getMine と同じ平坦 shape）
      expect(result.data).toEqual({
        tableId: 'products',
        columnKey: 'name',
        width: 200,
        updatedAt: '2026-05-07T00:00:00.000Z',
      });
      expect(mockRepo.upsert).toHaveBeenCalledWith('user-uuid-1', 'products', 'name', 200);
    });

    it('repo.upsert の引数 (userId, tableId, columnKey, width) が正しく渡されること', async () => {
      mockRepo.upsert.mockResolvedValue({ ...baseEntity, columnKey: 'price', width: 120 });

      await service.upsert('user-uuid-1', 'orders', 'price', 120);

      expect(mockRepo.upsert).toHaveBeenCalledWith('user-uuid-1', 'orders', 'price', 120);
    });
  });
});
