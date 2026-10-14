import { Test, TestingModule } from '@nestjs/testing';
import { UserTableColumnWidth } from '@prisma/client';
import { UserTableColumnWidthsRepository } from '../repositories/user-table-column-widths.repository';
import { PrismaService } from '../../../database/prisma.service';

const entity: UserTableColumnWidth = {
  userId: 'u1',
  tableId: 'products',
  columnKey: 'name',
  width: 200,
  updatedAt: new Date('2026-05-07T00:00:00Z'),
};

const mockPrisma = {
  userTableColumnWidth: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
};

describe('UserTableColumnWidthsRepository', () => {
  let repo: UserTableColumnWidthsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserTableColumnWidthsRepository,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    repo = module.get<UserTableColumnWidthsRepository>(UserTableColumnWidthsRepository);
    jest.clearAllMocks();
  });

  describe('findManyByUserAndTable', () => {
    it('userId と tableId で findMany を呼ぶ', async () => {
      mockPrisma.userTableColumnWidth.findMany.mockResolvedValue([entity]);

      const result = await repo.findManyByUserAndTable('u1', 'products');

      expect(result).toEqual([entity]);
      expect(mockPrisma.userTableColumnWidth.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', tableId: 'products' },
      });
    });

    it('空配列を返す場合も正常', async () => {
      mockPrisma.userTableColumnWidth.findMany.mockResolvedValue([]);

      const result = await repo.findManyByUserAndTable('u1', 'warehouses');

      expect(result).toEqual([]);
    });
  });

  describe('upsert', () => {
    it('複合主キー where / update width / create 全フィールド で upsert を呼ぶ', async () => {
      mockPrisma.userTableColumnWidth.upsert.mockResolvedValue(entity);

      const result = await repo.upsert('u1', 'products', 'name', 200);

      expect(result).toEqual(entity);
      expect(mockPrisma.userTableColumnWidth.upsert).toHaveBeenCalledWith({
        where: {
          userId_tableId_columnKey: {
            userId: 'u1',
            tableId: 'products',
            columnKey: 'name',
          },
        },
        update: { width: 200 },
        create: { userId: 'u1', tableId: 'products', columnKey: 'name', width: 200 },
      });
    });

    it('width が境界値 40 でも upsert を呼ぶ', async () => {
      const minEntity = { ...entity, width: 40 };
      mockPrisma.userTableColumnWidth.upsert.mockResolvedValue(minEntity);

      const result = await repo.upsert('u1', 'products', 'name', 40);

      expect(result.width).toBe(40);
      expect(mockPrisma.userTableColumnWidth.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { width: 40 },
          create: expect.objectContaining({ width: 40 }),
        }),
      );
    });
  });
});
