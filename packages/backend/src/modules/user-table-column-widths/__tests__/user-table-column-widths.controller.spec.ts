import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UserTableColumnWidthsController } from '../user-table-column-widths.controller';
import { UserTableColumnWidthsService } from '../user-table-column-widths.service';
import { UpsertColumnWidthDto } from '../dto';

const mockService = {
  getMine: jest.fn(),
  upsert: jest.fn(),
};

describe('UserTableColumnWidthsController', () => {
  let controller: UserTableColumnWidthsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserTableColumnWidthsController],
      providers: [{ provide: UserTableColumnWidthsService, useValue: mockService }],
    }).compile();

    controller = module.get<UserTableColumnWidthsController>(UserTableColumnWidthsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('getMine', () => {
    it('UserTableColumnWidthResponseDto shape の配列を返すこと', async () => {
      const expected = {
        success: true,
        data: [
          {
            tableId: 'products',
            columnKey: 'name',
            width: 200,
            updatedAt: '2026-05-07T00:00:00.000Z',
          },
        ],
      };
      mockService.getMine.mockResolvedValue(expected);

      const result = await controller.getMine('user-uuid-1', 'products');

      expect(result.success).toBe(true);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          tableId: expect.any(String),
          columnKey: expect.any(String),
          width: expect.any(Number),
          updatedAt: expect.any(String),
        }),
      );
      expect(mockService.getMine).toHaveBeenCalledWith('user-uuid-1', 'products');
    });

    it('未知の tableId は BadRequestException を投げること', async () => {
      await expect(controller.getMine('user-uuid-1', 'unknown-table')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockService.getMine).not.toHaveBeenCalled();
    });
  });

  describe('upsert', () => {
    it('正常系: repo.upsert 結果を返すこと', async () => {
      const expected = {
        success: true,
        data: {
          tableId: 'products',
          columnKey: 'name',
          width: 200,
          updatedAt: '2026-05-07T00:00:00.000Z',
        },
      };
      mockService.upsert.mockResolvedValue(expected);

      const dto: UpsertColumnWidthDto = { width: 200 };
      const result = await controller.upsert('user-uuid-1', 'products', 'name', dto);

      expect(result).toEqual(expected);
      expect(mockService.upsert).toHaveBeenCalledWith('user-uuid-1', 'products', 'name', 200);
    });

    it('未知の tableId は BadRequestException を投げること', async () => {
      const dto: UpsertColumnWidthDto = { width: 200 };

      await expect(controller.upsert('user-uuid-1', 'unknown-table', 'name', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockService.upsert).not.toHaveBeenCalled();
    });

    it('空文字 columnKey は BadRequestException を投げること', async () => {
      const dto: UpsertColumnWidthDto = { width: 200 };

      await expect(controller.upsert('user-uuid-1', 'products', '', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockService.upsert).not.toHaveBeenCalled();
    });

    it('65文字以上の columnKey は BadRequestException を投げること', async () => {
      const dto: UpsertColumnWidthDto = { width: 200 };
      const longKey = 'a'.repeat(65);

      await expect(controller.upsert('user-uuid-1', 'products', longKey, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockService.upsert).not.toHaveBeenCalled();
    });

    it.each(['__proto__', 'constructor', 'name with space', 'name<script>', '日本語'])(
      '不正文字を含む columnKey "%s" は BadRequestException を投げること',
      async (badKey) => {
        const dto: UpsertColumnWidthDto = { width: 200 };
        await expect(controller.upsert('user-uuid-1', 'products', badKey, dto)).rejects.toThrow(
          BadRequestException,
        );
        expect(mockService.upsert).not.toHaveBeenCalled();
      },
    );

    it.each(['name', 'order_no', 'col-1', 'a.b', 'ns:key'])(
      '許可文字のみの columnKey "%s" は通る',
      async (goodKey) => {
        const dto: UpsertColumnWidthDto = { width: 200 };
        mockService.upsert.mockResolvedValue({ success: true, data: {} });
        await expect(
          controller.upsert('user-uuid-1', 'products', goodKey, dto),
        ).resolves.toBeDefined();
        expect(mockService.upsert).toHaveBeenCalled();
      },
    );
  });
});
