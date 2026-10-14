import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SuppliersService } from './suppliers.service';
import { SuppliersRepository } from './repositories/suppliers.repository';
import { makeSupplierEntity } from '@/__tests__/factories';

const mockSupplier = makeSupplierEntity({
  id: 1,
  code: 'SUP-001',
  name: '株式会社テスト商事',
  address: '東京都渋谷区1-1-1',
  phone: '03-1234-5678',
  contactPerson: '山田太郎',
  email: 'yamada@test.co.jp',
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

describe('SuppliersService', () => {
  let service: SuppliersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SuppliersService, { provide: SuppliersRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<SuppliersService>(SuppliersService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('Repository.findManyPaginated に LIST_CONFIG を渡し結果を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockSupplier],
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
      mockRepo.findManyForExport.mockResolvedValue([mockSupplier]);

      const result = await service.findAllForExport({});

      expect(result).toEqual([mockSupplier]);
      expect(mockRepo.findManyForExport).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('存在する仕入先を返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockSupplier);

      const result = await service.findOne(1);

      expect(result.success).toBe(true);
      expect(mockRepo.findById).toHaveBeenCalledWith(1);
    });

    it('SupplierResponseDto の shape を持つこと', async () => {
      mockRepo.findById.mockResolvedValue(mockSupplier);

      const result = await service.findOne(1);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockSupplier.id,
          code: mockSupplier.code,
          name: mockSupplier.name,
          address: mockSupplier.address,
          phone: mockSupplier.phone,
          contactPerson: mockSupplier.contactPerson,
          email: mockSupplier.email,
          status: mockSupplier.status,
          createdAt: mockSupplier.createdAt,
          updatedAt: mockSupplier.updatedAt,
        }),
      );
    });

    it('仕入先が存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = { code: 'SUP-002', name: '新仕入先株式会社' };

    it('仕入先を作成して返すこと', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockSupplier);

      const result = await service.create(createDto);

      expect(result.success).toBe(true);
      expect(mockRepo.findByCode).toHaveBeenCalledWith('SUP-002');
      expect(mockRepo.create).toHaveBeenCalledWith(createDto);
    });

    it('SupplierResponseDto の shape を持つこと', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockSupplier);

      const result = await service.create(createDto);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockSupplier.id,
          code: mockSupplier.code,
          name: mockSupplier.name,
          address: mockSupplier.address,
          phone: mockSupplier.phone,
          contactPerson: mockSupplier.contactPerson,
          email: mockSupplier.email,
          status: mockSupplier.status,
          createdAt: mockSupplier.createdAt,
          updatedAt: mockSupplier.updatedAt,
        }),
      );
    });

    it('コードが重複している場合にConflictExceptionをスローすること', async () => {
      mockRepo.findByCode.mockResolvedValue(mockSupplier);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateDto = { name: '更新仕入先株式会社' };

    it('仕入先を更新して返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockSupplier);
      mockRepo.update.mockResolvedValue({ ...mockSupplier, name: '更新仕入先株式会社' });

      const result = await service.update(1, updateDto);

      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith(1, updateDto);
    });

    it('SupplierResponseDto の shape を持つこと', async () => {
      const updatedSupplier = { ...mockSupplier, name: '更新仕入先株式会社' };
      mockRepo.findById.mockResolvedValue(mockSupplier);
      mockRepo.update.mockResolvedValue(updatedSupplier);

      const result = await service.update(1, updateDto);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: updatedSupplier.id,
          code: updatedSupplier.code,
          name: updatedSupplier.name,
          address: updatedSupplier.address,
          phone: updatedSupplier.phone,
          contactPerson: updatedSupplier.contactPerson,
          email: updatedSupplier.email,
          status: updatedSupplier.status,
          createdAt: updatedSupplier.createdAt,
          updatedAt: updatedSupplier.updatedAt,
        }),
      );
    });

    it('仕入先が存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(999, updateDto)).rejects.toThrow(NotFoundException);
    });

    it('コード変更時に重複チェックを行い重複あればConflictExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockSupplier);
      mockRepo.findByCode.mockResolvedValue({ ...mockSupplier, id: 2 });

      await expect(service.update(1, { code: 'SUP-999' })).rejects.toThrow(ConflictException);
    });

    it('同じコードへの更新時に重複チェックをスキップすること', async () => {
      mockRepo.findById.mockResolvedValue(mockSupplier);
      mockRepo.update.mockResolvedValue(mockSupplier);

      await service.update(1, { code: 'SUP-001' });

      expect(mockRepo.findByCode).not.toHaveBeenCalled();
    });

    it('コードなし更新時に重複チェックをスキップすること', async () => {
      mockRepo.findById.mockResolvedValue(mockSupplier);
      mockRepo.update.mockResolvedValue(mockSupplier);

      await service.update(1, { name: '新しい名前' });

      expect(mockRepo.findByCode).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('仕入先を削除して成功メッセージを返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockSupplier);
      mockRepo.delete.mockResolvedValue(mockSupplier);

      const result = await service.remove(1);

      expect(result).toEqual({
        success: true,
        data: { message: 'Supplier deleted successfully' },
      });
      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });

    it('仕入先が存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    it('P2003 などの Prisma エラーはそのまま再スローし、PrismaExceptionFilter に委譲すること', async () => {
      mockRepo.findById.mockResolvedValue(mockSupplier);
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
      mockRepo.findById.mockResolvedValue(mockSupplier);
      const prismaError = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      mockRepo.delete.mockRejectedValue(prismaError);

      await expect(service.remove(1)).rejects.toThrow(prismaError);
    });

    it('Prisma以外のエラーも再スローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockSupplier);
      const genericError = new Error('Unexpected database error');
      mockRepo.delete.mockRejectedValue(genericError);

      await expect(service.remove(1)).rejects.toThrow('Unexpected database error');
    });
  });
});
