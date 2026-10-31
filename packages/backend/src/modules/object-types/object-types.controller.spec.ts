import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ObjectTypesController } from './object-types.controller';
import { ObjectTypesService } from './object-types.service';
import { REQUIRE_PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

const mockObjectTypesService = {
  create: jest.fn(),
  update: jest.fn(),
  findAll: jest.fn(),
  findVisibleForUser: jest.fn(),
  findByKey: jest.fn(),
  findRecords: jest.fn(),
  findRecord: jest.fn(),
  createRecord: jest.fn(),
  updateRecord: jest.fn(),
  deleteRecord: jest.fn(),
};

describe('ObjectTypesController', () => {
  let controller: ObjectTypesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ObjectTypesController],
      providers: [{ provide: ObjectTypesService, useValue: mockObjectTypesService }],
    }).compile();

    controller = module.get<ObjectTypesController>(ObjectTypesController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('ユーザー定義の台帳と項目定義の作成をサービスへ委譲する', async () => {
      const dto = {
        key: 'supplier-score',
        name: '仕入先評価',
        fieldDefs: [{ key: 'name', label: '仕入先名', type: 'TEXT' as const }],
      };
      const expected = {
        success: true,
        data: { id: 10, ...dto, isPreset: false },
      };
      mockObjectTypesService.create.mockResolvedValue(expected);

      const result = await controller.create(dto);

      expect(result).toEqual(expected);
      expect(mockObjectTypesService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('不変keyと完全置換DTOをサービスへ委譲する', async () => {
      const dto = {
        name: '仕入先評価 改訂',
        fieldDefs: [{ key: 'name', label: '仕入先名', type: 'TEXT' as const }],
      };
      const expected = { success: true, data: { key: 'supplier-score', ...dto } };
      mockObjectTypesService.update.mockResolvedValue(expected);

      await expect(controller.update('supplier-score', dto)).resolves.toEqual(expected);
      expect(mockObjectTypesService.update).toHaveBeenCalledWith('supplier-score', dto);
    });

    it('keyが100文字超なら400でサービスを呼ばない', async () => {
      await expect(
        controller.update('k'.repeat(101), {
          name: '境界',
          fieldDefs: [{ key: 'name', label: '名称', type: 'TEXT' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockObjectTypesService.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('種別定義一覧を返すこと', async () => {
      const expected = {
        success: true,
        data: [{ id: 1, key: 'product', name: '商品', icon: null, sortOrder: 1, isPreset: true }],
      };
      mockObjectTypesService.findVisibleForUser.mockResolvedValue(expected);

      const result = await controller.findAll();

      expect(result).toEqual(expected);
      expect(mockObjectTypesService.findVisibleForUser).toHaveBeenCalledWith(null);
    });
  });

  describe('findByKey', () => {
    it('キー指定で 1 件の種別定義を返すこと', async () => {
      const expected = {
        success: true,
        data: { id: 1, key: 'product', name: '商品', icon: null, sortOrder: 1, isPreset: true },
      };
      mockObjectTypesService.findByKey.mockResolvedValue(expected);

      const result = await controller.findByKey('product');

      expect(result).toEqual(expected);
      expect(mockObjectTypesService.findByKey).toHaveBeenCalledWith('product');
    });

    it('key が 100 文字超では BadRequestException になりサービスを呼ばないこと', async () => {
      const longKey = 'k'.repeat(101);

      await expect(controller.findByKey(longKey)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockObjectTypesService.findByKey).not.toHaveBeenCalled();
    });

    it('key がちょうど 100 文字ではサービスへ委譲して 200 が返ること（境界の下限側）', async () => {
      const key100 = 'k'.repeat(100);
      const expected = {
        success: true,
        data: { id: 2, key: key100, name: '境界', icon: null, sortOrder: 2, isPreset: false },
      };
      mockObjectTypesService.findByKey.mockResolvedValue(expected);

      const result = await controller.findByKey(key100);

      expect(result).toEqual(expected);
      expect(mockObjectTypesService.findByKey).toHaveBeenCalledWith(key100);
    });

    it('存在しないキーではサービスが NotFoundException を投げ、そのまま伝播すること', async () => {
      mockObjectTypesService.findByKey.mockRejectedValue(
        new NotFoundException('ObjectType not found'),
      );

      await expect(controller.findByKey('no-such-key')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findRecords', () => {
    it('キーとページングクエリで自由定義データ一覧を返すこと（ref-0076）', async () => {
      const expected = {
        success: true,
        data: [{ id: 1, objectTypeId: 10, data: { name: 'A' } }],
        meta: { total: 1, page: 2, limit: 50, totalPages: 1 },
      };
      mockObjectTypesService.findRecords.mockResolvedValue(expected);

      const result = await controller.findRecords('project', { page: 2, limit: 50 });

      expect(result).toEqual(expected);
      expect(mockObjectTypesService.findRecords).toHaveBeenCalledWith('project', 2, 50);
    });

    it('key が 100 文字超では BadRequestException になりサービスを呼ばないこと', async () => {
      const longKey = 'k'.repeat(101);

      await expect(controller.findRecords(longKey, { page: 1 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockObjectTypesService.findRecords).not.toHaveBeenCalled();
    });
  });

  describe('findRecord', () => {
    it('キーと id で自由定義データ1件の取得をサービスへ委譲する', async () => {
      const expected = {
        success: true,
        data: { id: 51, objectTypeId: 10, data: { name: '仕入先51' } },
      };
      mockObjectTypesService.findRecord.mockResolvedValue(expected);

      const result = await controller.findRecord('supplier-score', 51);

      expect(result).toEqual(expected);
      expect(mockObjectTypesService.findRecord).toHaveBeenCalledWith('supplier-score', 51);
    });

    it('key が 100 文字超では 400 でサービスを呼ばない', async () => {
      await expect(controller.findRecord('k'.repeat(101), 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockObjectTypesService.findRecord).not.toHaveBeenCalled();
    });

    it('存在しないレコードではサービスが NotFoundException を投げ、そのまま伝播すること', async () => {
      mockObjectTypesService.findRecord.mockRejectedValue(
        new NotFoundException('CustomRecord not found'),
      );

      await expect(controller.findRecord('supplier-score', 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('createRecord', () => {
    it('キーと data で自由定義データの作成をサービスへ委譲する（ref-0098）', async () => {
      const dto = { data: { name: '仕入先01', reviewedOn: '2026-08-01' } };
      const expected = {
        success: true,
        data: { id: 1, objectTypeId: 10, data: dto.data },
      };
      mockObjectTypesService.createRecord.mockResolvedValue(expected);

      const result = await controller.createRecord('supplier-score', dto);

      expect(result).toEqual(expected);
      expect(mockObjectTypesService.createRecord).toHaveBeenCalledWith('supplier-score', dto);
    });

    it('key が 100 文字超では 400 でサービスを呼ばない', async () => {
      await expect(
        controller.createRecord('k'.repeat(101), { data: { name: 'x' } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockObjectTypesService.createRecord).not.toHaveBeenCalled();
    });
  });

  describe('updateRecord', () => {
    it('キー・id・data（完全置換）で更新をサービスへ委譲する（ref-0098）', async () => {
      const dto = { data: { name: '更新後' } };
      const expected = {
        success: true,
        data: { id: 1, objectTypeId: 10, data: dto.data },
      };
      mockObjectTypesService.updateRecord.mockResolvedValue(expected);

      const result = await controller.updateRecord('supplier-score', 1, dto);

      expect(result).toEqual(expected);
      expect(mockObjectTypesService.updateRecord).toHaveBeenCalledWith('supplier-score', 1, dto);
    });

    it('key が 100 文字超では 400 でサービスを呼ばない', async () => {
      await expect(
        controller.updateRecord('k'.repeat(101), 1, { data: { name: 'x' } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockObjectTypesService.updateRecord).not.toHaveBeenCalled();
    });
  });

  describe('deleteRecord', () => {
    it('キー・id で削除をサービスへ委譲する（ref-0098）', async () => {
      const expected = { success: true, data: { message: 'CustomRecord deleted' } };
      mockObjectTypesService.deleteRecord.mockResolvedValue(expected);

      const result = await controller.deleteRecord('supplier-score', 1);

      expect(result).toEqual(expected);
      expect(mockObjectTypesService.deleteRecord).toHaveBeenCalledWith('supplier-score', 1);
    });

    it('key が 100 文字超では 400 でサービスを呼ばない', async () => {
      await expect(controller.deleteRecord('k'.repeat(101), 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockObjectTypesService.deleteRecord).not.toHaveBeenCalled();
    });
  });

  describe('権限境界', () => {
    it('create は object-types の create 権限を要求すること', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ObjectTypesController.prototype.create,
      );
      expect(meta).toEqual({ featureId: 'object-types', action: 'create' });
    });

    it('update は object-types の update 権限を要求すること', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ObjectTypesController.prototype.update,
      );
      expect(meta).toEqual({ featureId: 'object-types', action: 'update' });
    });

    it('findAll は動的な可視台帳一覧へ委譲し、固定権限metadataを持たないこと', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ObjectTypesController.prototype.findAll,
      );
      expect(meta).toBeUndefined();
    });

    it('findByKey は ObjectType単位の view 権限を要求すること', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ObjectTypesController.prototype.findByKey,
      );
      expect(meta).toEqual({ kind: 'object-type', keyParam: 'key', action: 'view' });
    });

    it('findRecords は ObjectType単位の view 権限を要求すること（ref-0076）', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ObjectTypesController.prototype.findRecords,
      );
      expect(meta).toEqual({ kind: 'object-type', keyParam: 'key', action: 'view' });
    });

    it('findRecord は ObjectType単位の view 権限を要求すること', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ObjectTypesController.prototype.findRecord,
      );
      expect(meta).toEqual({ kind: 'object-type', keyParam: 'key', action: 'view' });
    });

    it('createRecord は ObjectType単位の create 権限を要求すること（ref-0098）', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ObjectTypesController.prototype.createRecord,
      );
      expect(meta).toEqual({ kind: 'object-type', keyParam: 'key', action: 'create' });
    });

    it('updateRecord は ObjectType単位の update 権限を要求すること（ref-0098）', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ObjectTypesController.prototype.updateRecord,
      );
      expect(meta).toEqual({ kind: 'object-type', keyParam: 'key', action: 'update' });
    });

    it('deleteRecord は ObjectType単位の delete 権限を要求すること（ref-0098）', () => {
      const meta = Reflect.getMetadata(
        REQUIRE_PERMISSION_KEY,
        ObjectTypesController.prototype.deleteRecord,
      );
      expect(meta).toEqual({ kind: 'object-type', keyParam: 'key', action: 'delete' });
    });
  });
});
