import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ExcelService } from '../../common/services/excel.service';

const mockUsersService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  findAllForExport: jest.fn(),
};

const mockExcelService = {
  generate: jest.fn(),
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('ユーザー一覧を返すこと', async () => {
      const expected = { success: true, data: [], meta: { total: 0 } };
      mockUsersService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockUsersService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('ユーザー詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 'uuid-1', name: 'testuser' } };
      mockUsersService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne('uuid-1');

      expect(result).toEqual(expected);
      expect(mockUsersService.findOne).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('create', () => {
    it('ユーザーを作成して返すこと', async () => {
      const dto = {
        name: 'newuser',
        email: 'new@test.com',
        password: 'pass123',
        role: 'OF_USER',
      };
      const expected = { success: true, data: { id: 'uuid-new', name: 'newuser' } };
      mockUsersService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any, 'WH_ADMIN' as any);

      expect(result).toEqual(expected);
      expect(mockUsersService.create).toHaveBeenCalledWith(dto, 'WH_ADMIN');
    });
  });

  describe('update', () => {
    it('ユーザーを更新して返すこと', async () => {
      const dto = { email: 'updated@test.com' };
      const expected = { success: true, data: { id: 'uuid-1', email: 'updated@test.com' } };
      mockUsersService.update.mockResolvedValue(expected);

      const result = await controller.update('uuid-1', dto as any, 'SYS_ADMIN' as any);

      expect(result).toEqual(expected);
      expect(mockUsersService.update).toHaveBeenCalledWith('uuid-1', dto, 'SYS_ADMIN');
    });
  });

  describe('remove', () => {
    it('ユーザーを削除して成功メッセージを返すこと', async () => {
      const expected = { success: true, data: { message: 'User deleted' } };
      mockUsersService.remove.mockResolvedValue(expected);

      const result = await controller.remove('uuid-1', 'SYS_ADMIN' as any);

      expect(result).toEqual(expected);
      expect(mockUsersService.remove).toHaveBeenCalledWith('uuid-1', 'SYS_ADMIN');
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const users = [
        {
          name: 'testuser',
          email: 'test@example.com',
          role: 'WH_USER',
          isActive: true,
          lastLoginAt: new Date('2026-03-17'),
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockUsersService.findAllForExport.mockResolvedValue(users);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockUsersService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        'ユーザー一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ロールが日本語に変換されること', async () => {
      const users = [
        {
          name: 'admin',
          email: 'admin@test.com',
          role: 'SYS_ADMIN',
          isActive: false,
          lastLoginAt: null,
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockUsersService.findAllForExport.mockResolvedValue(users);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][2]).toBe('システム管理者');
      expect(rows[0][3]).toBe('無効');
      expect(rows[0][4]).toBe('-');
    });
  });
});
