import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './repositories/categories.repository';
import { makeCategoryEntity } from '@/__tests__/factories';

const mockCategory = makeCategoryEntity({
  id: 1,
  code: 'CAT-001',
  name: '電子機器',
});

const mockRepo = {
  findManyPaginated: jest.fn(),
  findManyForExport: jest.fn(),
  findById: jest.fn(),
  findByCode: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoriesService, { provide: CategoriesRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('Repository.findManyPaginated に LIST_CONFIG を渡し結果を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockCategory],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findManyPaginated.mockResolvedValue(expected);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual(expected);
      expect(mockRepo.findManyPaginated).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        expect.objectContaining({
          searchFields: ['name', 'code'],
          allowedSortFields: ['createdAt', 'updatedAt', 'name', 'code', 'status'],
        }),
      );
    });
  });

  describe('findAllForExport', () => {
    it('Repository.findManyForExport を呼んで結果配列を返すこと', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockCategory]);

      const result = await service.findAllForExport({});

      expect(result).toEqual([mockCategory]);
      expect(mockRepo.findManyForExport).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('存在するカテゴリーを返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);

      const result = await service.findOne(1);

      expect(result.success).toBe(true);
      expect(mockRepo.findById).toHaveBeenCalledWith(1);
    });

    it('CategoryResponseDto の shape を持つこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);

      const result = await service.findOne(1);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockCategory.id,
          code: mockCategory.code,
          name: mockCategory.name,
          status: mockCategory.status,
          createdAt: mockCategory.createdAt,
          updatedAt: mockCategory.updatedAt,
        }),
      );
    });

    it('カテゴリーが存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = { code: 'CAT-002', name: '食品' };

    it('カテゴリーを作成して返すこと', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockCategory);

      const result = await service.create(createDto);

      expect(result.success).toBe(true);
      expect(mockRepo.findByCode).toHaveBeenCalledWith('CAT-002');
      expect(mockRepo.create).toHaveBeenCalledWith(createDto);
    });

    it('CategoryResponseDto の shape を持つこと', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockCategory);

      const result = await service.create(createDto);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockCategory.id,
          code: mockCategory.code,
          name: mockCategory.name,
          status: mockCategory.status,
          createdAt: mockCategory.createdAt,
          updatedAt: mockCategory.updatedAt,
        }),
      );
    });

    it('コードが重複している場合にConflictExceptionをスローすること', async () => {
      mockRepo.findByCode.mockResolvedValue(mockCategory);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateDto = { name: '更新カテゴリー' };

    it('カテゴリーを更新して返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      mockRepo.update.mockResolvedValue({ ...mockCategory, name: '更新カテゴリー' });

      const result = await service.update(1, updateDto);

      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith(1, updateDto);
    });

    it('CategoryResponseDto の shape を持つこと', async () => {
      const updatedCategory = { ...mockCategory, name: '更新カテゴリー' };
      mockRepo.findById.mockResolvedValue(mockCategory);
      mockRepo.update.mockResolvedValue(updatedCategory);

      const result = await service.update(1, updateDto);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: updatedCategory.id,
          code: updatedCategory.code,
          name: updatedCategory.name,
          status: updatedCategory.status,
          createdAt: updatedCategory.createdAt,
          updatedAt: updatedCategory.updatedAt,
        }),
      );
    });

    it('カテゴリーが存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(999, updateDto)).rejects.toThrow(NotFoundException);
    });

    it('コード変更時に重複チェックを行い重複あればConflictExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      mockRepo.findByCode.mockResolvedValue({ ...mockCategory, id: 2 });

      await expect(service.update(1, { code: 'CAT-999' })).rejects.toThrow(ConflictException);
    });

    it('同じコードへの更新時に重複チェックをスキップすること', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      mockRepo.update.mockResolvedValue(mockCategory);

      await service.update(1, { code: 'CAT-001' });

      expect(mockRepo.findByCode).not.toHaveBeenCalled();
    });

    it('コードなし更新時に重複チェックをスキップすること', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      mockRepo.update.mockResolvedValue(mockCategory);

      await service.update(1, { name: '新名前' });

      expect(mockRepo.findByCode).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('カテゴリーを削除して成功メッセージを返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      mockRepo.delete.mockResolvedValue(mockCategory);

      const result = await service.remove(1);

      expect(result).toEqual({
        success: true,
        data: { message: 'Category deleted successfully' },
      });
      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });

    it('カテゴリーが存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('P2003 などの Prisma エラーはそのまま再スローし、PrismaExceptionFilter に委譲すること', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '5.0.0',
        },
      );
      mockRepo.delete.mockRejectedValue(prismaError);

      await expect(service.remove(1)).rejects.toThrow(prismaError);
    });

    it('P2025 エラーも再スローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      mockRepo.delete.mockRejectedValue(prismaError);

      await expect(service.remove(1)).rejects.toThrow(prismaError);
    });

    it('Prisma以外のエラーも再スローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockCategory);
      const genericError = new Error('Unexpected database error');
      mockRepo.delete.mockRejectedValue(genericError);

      await expect(service.remove(1)).rejects.toThrow('Unexpected database error');
    });
  });
});
