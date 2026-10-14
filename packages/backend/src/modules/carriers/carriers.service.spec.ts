import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CarriersService } from './carriers.service';
import { CarriersRepository } from './repositories/carriers.repository';
import { makeCarrierEntity } from '@/__tests__/factories';

const mockCarrier = makeCarrierEntity({
  id: 1,
  code: 'CR-001',
  name: 'テスト運送会社',
  address: null,
  phone: '03-1234-5678',
  contactPerson: null,
  email: null,
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

describe('CarriersService', () => {
  let service: CarriersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CarriersService, { provide: CarriersRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<CarriersService>(CarriersService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('Repository.findManyPaginated に LIST_CONFIG を渡し結果を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockCarrier],
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
      mockRepo.findManyForExport.mockResolvedValue([mockCarrier]);

      const result = await service.findAllForExport({});

      expect(result).toEqual([mockCarrier]);
      expect(mockRepo.findManyForExport).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('存在する場合にデータを返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCarrier);

      const result = await service.findOne(1);

      expect(result.success).toBe(true);
      expect(mockRepo.findById).toHaveBeenCalledWith(1);
    });

    it('CarrierResponseDto の shape を持つこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCarrier);

      const result = await service.findOne(1);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockCarrier.id,
          code: mockCarrier.code,
          name: mockCarrier.name,
          address: mockCarrier.address,
          phone: mockCarrier.phone,
          contactPerson: mockCarrier.contactPerson,
          email: mockCarrier.email,
          status: mockCarrier.status,
          createdAt: mockCarrier.createdAt,
          updatedAt: mockCarrier.updatedAt,
        }),
      );
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = { code: 'CR-002', name: '新運送会社', phone: '06-9876-5432' };

    it('作成して返すこと', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockCarrier);

      const result = await service.create(createDto);

      expect(result.success).toBe(true);
      expect(mockRepo.findByCode).toHaveBeenCalledWith('CR-002');
      expect(mockRepo.create).toHaveBeenCalledWith(createDto);
    });

    it('CarrierResponseDto の shape を持つこと', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockCarrier);

      const result = await service.create(createDto);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockCarrier.id,
          code: mockCarrier.code,
          name: mockCarrier.name,
          address: mockCarrier.address,
          phone: mockCarrier.phone,
          contactPerson: mockCarrier.contactPerson,
          email: mockCarrier.email,
          status: mockCarrier.status,
          createdAt: mockCarrier.createdAt,
          updatedAt: mockCarrier.updatedAt,
        }),
      );
    });

    it('コード重複時にConflictExceptionをスローすること', async () => {
      mockRepo.findByCode.mockResolvedValue(mockCarrier);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateDto = { name: '更新運送会社' };

    it('更新して返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCarrier);
      mockRepo.update.mockResolvedValue({ ...mockCarrier, name: '更新運送会社' });

      const result = await service.update(1, updateDto);

      expect(result.success).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith(1, updateDto);
    });

    it('CarrierResponseDto の shape を持つこと', async () => {
      const updatedCarrier = { ...mockCarrier, name: '更新運送会社' };
      mockRepo.findById.mockResolvedValue(mockCarrier);
      mockRepo.update.mockResolvedValue(updatedCarrier);

      const result = await service.update(1, updateDto);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: updatedCarrier.id,
          code: updatedCarrier.code,
          name: updatedCarrier.name,
          address: updatedCarrier.address,
          phone: updatedCarrier.phone,
          contactPerson: updatedCarrier.contactPerson,
          email: updatedCarrier.email,
          status: updatedCarrier.status,
          createdAt: updatedCarrier.createdAt,
          updatedAt: updatedCarrier.updatedAt,
        }),
      );
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(999, updateDto)).rejects.toThrow(NotFoundException);
    });

    it('コード変更時に重複チェックすること', async () => {
      mockRepo.findById.mockResolvedValue(mockCarrier);
      mockRepo.findByCode.mockResolvedValue({ ...mockCarrier, id: 2 });

      await expect(service.update(1, { code: 'CR-999' })).rejects.toThrow(ConflictException);
    });

    it('同じコードへの更新時に重複チェックをスキップすること', async () => {
      mockRepo.findById.mockResolvedValue(mockCarrier);
      mockRepo.update.mockResolvedValue(mockCarrier);

      await service.update(1, { code: 'CR-001' });

      expect(mockRepo.findByCode).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('削除して成功メッセージを返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockCarrier);
      mockRepo.delete.mockResolvedValue(mockCarrier);

      const result = await service.remove(1);

      expect(result).toEqual({
        success: true,
        data: { message: 'Carrier deleted successfully' },
      });
      expect(mockRepo.delete).toHaveBeenCalledWith(1);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });
});
