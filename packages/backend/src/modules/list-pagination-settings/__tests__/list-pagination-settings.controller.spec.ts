import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ListPaginationSettingsController } from '../list-pagination-settings.controller';
import { ListPaginationSettingsService } from '../list-pagination-settings.service';

const mockService = {
  findAll: jest.fn(),
  findByTableId: jest.fn(),
  update: jest.fn(),
  bulkUpdate: jest.fn(),
};

describe('ListPaginationSettingsController', () => {
  let controller: ListPaginationSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ListPaginationSettingsController],
      providers: [{ provide: ListPaginationSettingsService, useValue: mockService }],
    }).compile();

    controller = module.get<ListPaginationSettingsController>(ListPaginationSettingsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('service.findAll の結果をそのまま返すこと', async () => {
      const expected = {
        success: true,
        data: [
          {
            tableId: 'products',
            defaultPageSize: 50,
            pageSizeOptions: '10,20,50,100',
            createdAt: '2026-05-09T00:00:00.000Z',
            updatedAt: '2026-05-09T00:00:00.000Z',
            updatedById: null,
            updatedBy: null,
          },
        ],
      };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll();

      expect(result).toEqual(expected);
      expect(mockService.findAll).toHaveBeenCalled();
    });
  });

  describe('findByTableId', () => {
    it('正常系: service.findByTableId 結果を返す', async () => {
      const expected = { success: true, data: null };
      mockService.findByTableId.mockResolvedValue(expected);

      const result = await controller.findByTableId('products');

      expect(result).toEqual(expected);
      expect(mockService.findByTableId).toHaveBeenCalledWith('products');
    });

    it('未知の tableId は BadRequestException を投げる', async () => {
      await expect(controller.findByTableId('unknown')).rejects.toThrow(BadRequestException);
      expect(mockService.findByTableId).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('正常系: service.update に dto と userId を渡す', async () => {
      const expected = { success: true, data: {} };
      mockService.update.mockResolvedValue(expected);

      const result = await controller.update('products', { defaultPageSize: 50 }, 'admin-1');

      expect(result).toEqual(expected);
      expect(mockService.update).toHaveBeenCalledWith(
        'products',
        { defaultPageSize: 50 },
        'admin-1',
      );
    });

    it('未知の tableId は BadRequestException を投げる', async () => {
      await expect(
        controller.update('unknown', { defaultPageSize: 50 }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockService.update).not.toHaveBeenCalled();
    });
  });

  describe('bulkUpdate', () => {
    it('service.bulkUpdate に updates と userId を渡す', async () => {
      const expected = { success: true, data: [] };
      mockService.bulkUpdate.mockResolvedValue(expected);

      const dto = {
        updates: [{ tableId: 'products', defaultPageSize: 50, pageSizeOptions: '10,20,50,100' }],
      };
      const result = await controller.bulkUpdate(dto, 'admin-1');

      expect(result).toEqual(expected);
      expect(mockService.bulkUpdate).toHaveBeenCalledWith(dto.updates, 'admin-1');
    });
  });
});
