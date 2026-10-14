import { Test, TestingModule } from '@nestjs/testing';
import { StreamableFile } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { ExcelService } from '../../common/services/excel.service';

const mockGroupsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
  findMembers: jest.fn(),
  findAllForExport: jest.fn(),
};

const mockExcelService = {
  generate: jest.fn(),
};

describe('GroupsController', () => {
  let controller: GroupsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        { provide: GroupsService, useValue: mockGroupsService },
        { provide: ExcelService, useValue: mockExcelService },
      ],
    }).compile();

    controller = module.get<GroupsController>(GroupsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('グループ一覧を返すこと', async () => {
      const expected = { success: true, data: [], meta: { total: 0 } };
      mockGroupsService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll({ page: 1, limit: 20 } as any);

      expect(result).toEqual(expected);
      expect(mockGroupsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('グループ詳細を返すこと', async () => {
      const expected = { success: true, data: { id: 1, name: 'テストグループ' } };
      mockGroupsService.findOne.mockResolvedValue(expected);

      const result = await controller.findOne(1);

      expect(result).toEqual(expected);
      expect(mockGroupsService.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('グループを作成して返すこと（呼び出し元の role を service へ渡す）', async () => {
      const dto = { code: 'GRP-001', name: '新グループ' };
      const expected = { success: true, data: { id: 1, ...dto } };
      mockGroupsService.create.mockResolvedValue(expected);

      const result = await controller.create(dto as any, UserRole.WH_ADMIN);

      expect(result).toEqual(expected);
      expect(mockGroupsService.create).toHaveBeenCalledWith(dto, UserRole.WH_ADMIN);
    });
  });

  describe('update', () => {
    it('グループを更新して返すこと（呼び出し元の role を service へ渡す）', async () => {
      const dto = { name: '更新グループ' };
      const expected = { success: true, data: { id: 1, name: '更新グループ' } };
      mockGroupsService.update.mockResolvedValue(expected);

      const result = await controller.update(1, dto as any, UserRole.WH_ADMIN);

      expect(result).toEqual(expected);
      expect(mockGroupsService.update).toHaveBeenCalledWith(1, dto, UserRole.WH_ADMIN);
    });
  });

  describe('remove', () => {
    it('グループを削除して成功メッセージを返すこと（呼び出し元の role を service へ渡す）', async () => {
      const expected = { success: true, data: { message: 'Group deleted' } };
      mockGroupsService.remove.mockResolvedValue(expected);

      const result = await controller.remove(1, UserRole.WH_ADMIN);

      expect(result).toEqual(expected);
      expect(mockGroupsService.remove).toHaveBeenCalledWith(1, UserRole.WH_ADMIN);
    });
  });

  describe('addMember', () => {
    it('メンバーを追加して返すこと（呼び出し元の id と role を service へ渡す）', async () => {
      const expected = { success: true, data: { groupId: 1, userId: 'user-uuid' } };
      mockGroupsService.addMember.mockResolvedValue(expected);

      const result = await controller.addMember(
        1,
        { userId: 'user-uuid' } as any,
        'caller-uuid',
        UserRole.WH_ADMIN,
      );

      expect(result).toEqual(expected);
      expect(mockGroupsService.addMember).toHaveBeenCalledWith(
        1,
        'user-uuid',
        'caller-uuid',
        UserRole.WH_ADMIN,
      );
    });
  });

  describe('removeMember', () => {
    it('メンバーを削除して返すこと（呼び出し元の role を service へ渡す）', async () => {
      const expected = { success: true, data: { message: 'Member removed' } };
      mockGroupsService.removeMember.mockResolvedValue(expected);

      const result = await controller.removeMember(1, 'user-uuid', UserRole.WH_ADMIN);

      expect(result).toEqual(expected);
      expect(mockGroupsService.removeMember).toHaveBeenCalledWith(
        1,
        'user-uuid',
        UserRole.WH_ADMIN,
      );
    });
  });

  describe('findMembers', () => {
    it('グループメンバー一覧を返すこと', async () => {
      const expected = { success: true, data: [{ userId: 'user-uuid', name: 'testuser' }] };
      mockGroupsService.findMembers.mockResolvedValue(expected);

      const result = await controller.findMembers(1);

      expect(result).toEqual(expected);
      expect(mockGroupsService.findMembers).toHaveBeenCalledWith(1);
    });
  });

  describe('exportExcel', () => {
    it('ExcelファイルをStreamableFileとして返すこと', async () => {
      const groups = [
        {
          code: 'GRP-001',
          name: 'テストグループ',
          description: '説明',
          role: 'WH_USER',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel-data');
      mockGroupsService.findAllForExport.mockResolvedValue(groups);
      mockExcelService.generate.mockResolvedValue(buffer);

      const result = await controller.exportExcel({} as any);

      expect(result).toBeInstanceOf(StreamableFile);
      expect(mockGroupsService.findAllForExport).toHaveBeenCalledWith({});
      expect(mockExcelService.generate).toHaveBeenCalledWith(
        'グループ一覧',
        expect.any(Array),
        expect.any(Array),
      );
    });

    it('ロールとステータスが日本語に変換されること', async () => {
      const groups = [
        {
          code: 'GRP-001',
          name: 'テスト',
          description: null,
          role: 'SYS_ADMIN',
          status: 'INACTIVE',
          createdAt: new Date('2026-01-01'),
        },
      ];
      const buffer = Buffer.from('excel');
      mockGroupsService.findAllForExport.mockResolvedValue(groups);
      mockExcelService.generate.mockResolvedValue(buffer);

      await controller.exportExcel({} as any);

      const rows = mockExcelService.generate.mock.calls[0][2];
      expect(rows[0][2]).toBe('');
      expect(rows[0][3]).toBe('システム管理者');
      expect(rows[0][4]).toBe('無効');
    });
  });
});
