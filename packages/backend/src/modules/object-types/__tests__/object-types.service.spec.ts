import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ObjectTypesService } from '../object-types.service';
import { ObjectTypesRepository } from '../repositories/object-types.repository';
import { PermissionsService } from '../../permissions/permissions.service';
import { UserRole } from '@prisma/client';
import { makeObjectTypeEntity } from '@/__tests__/factories';

// プリセット5種の mock データ
const makePresets = () => [
  makeObjectTypeEntity({ id: 1, key: 'product', name: '商品', isPreset: true, sortOrder: 1 }),
  makeObjectTypeEntity({ id: 2, key: 'warehouse', name: '倉庫', isPreset: true, sortOrder: 2 }),
  makeObjectTypeEntity({ id: 3, key: 'carrier', name: '運送会社', isPreset: true, sortOrder: 3 }),
  makeObjectTypeEntity({ id: 4, key: 'supplier', name: '仕入先', isPreset: true, sortOrder: 4 }),
  makeObjectTypeEntity({
    id: 5,
    key: 'category',
    name: 'カテゴリー',
    isPreset: true,
    sortOrder: 5,
  }),
];

const mockRepo = {
  create: jest.fn(),
  updateDefinitionAtomic: jest.fn(),
  findAll: jest.fn(),
  findByKey: jest.fn(),
  findByKeyBare: jest.fn(),
  findById: jest.fn(),
  findRecords: jest.fn(),
  findRecordInObjectType: jest.fn(),
  createRecordAtomic: jest.fn(),
  updateRecordAtomic: jest.fn(),
  deleteRecordAtomic: jest.fn(),
};

const mockPermissions = {
  getEffectivePermissionMap: jest.fn(),
};

describe('ObjectTypesService', () => {
  let service: ObjectTypesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObjectTypesService,
        { provide: ObjectTypesRepository, useValue: mockRepo },
        { provide: PermissionsService, useValue: mockPermissions },
      ],
    }).compile();

    service = module.get<ObjectTypesService>(ObjectTypesService);
    jest.clearAllMocks();
    mockPermissions.getEffectivePermissionMap.mockResolvedValue(new Map());
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('非プリセット台帳と配列順の項目定義をRepositoryへ渡して返す', async () => {
      const now = new Date('2026-08-24T00:00:00.000Z');
      const created = {
        ...makeObjectTypeEntity({
          id: 10,
          key: 'supplier-score',
          name: '仕入先評価',
          icon: 'clipboard-check',
          sortOrder: 6,
          isPreset: false,
        }),
        fieldDefs: [
          {
            id: 20,
            objectTypeId: 10,
            key: 'name',
            label: '仕入先名',
            type: 'TEXT' as const,
            required: true,
            sortOrder: 1,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 21,
            objectTypeId: 10,
            key: 'reviewedOn',
            label: '評価日',
            type: 'DATE' as const,
            required: false,
            sortOrder: 2,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };
      mockRepo.create.mockResolvedValue(created);

      const result = await service.create({
        key: 'supplier-score',
        name: '仕入先評価',
        icon: 'clipboard-check',
        sortOrder: 6,
        fieldDefs: [
          { key: 'name', label: '仕入先名', type: 'TEXT', required: true },
          { key: 'reviewedOn', label: '評価日', type: 'DATE' },
        ],
      });

      expect(mockRepo.create).toHaveBeenCalledWith({
        key: 'supplier-score',
        name: '仕入先評価',
        icon: 'clipboard-check',
        sortOrder: 6,
        fieldDefs: [
          { key: 'name', label: '仕入先名', type: 'TEXT', required: true, sortOrder: 1 },
          { key: 'reviewedOn', label: '評価日', type: 'DATE', required: false, sortOrder: 2 },
        ],
      });
      expect(result.data).toMatchObject({
        key: 'supplier-score',
        isPreset: false,
        fieldDefs: [
          expect.objectContaining({ key: 'name', sortOrder: 1 }),
          expect.objectContaining({ key: 'reviewedOn', sortOrder: 2 }),
        ],
      });
    });

    it('同じFieldDef keyが複数あれば400で拒否しRepositoryを呼ばない', async () => {
      await expect(
        service.create({
          key: 'supplier-score',
          name: '仕入先評価',
          fieldDefs: [
            { key: 'name', label: '名称', type: 'TEXT' },
            { key: 'name', label: '別名', type: 'TEXT' },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const now = new Date('2026-08-24T00:00:00.000Z');
    const current = {
      ...makeObjectTypeEntity({ id: 10, key: 'supplier-score', isPreset: false }),
      fieldDefs: [
        {
          id: 20,
          objectTypeId: 10,
          key: 'name',
          label: '仕入先名',
          type: 'TEXT' as const,
          required: true,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 21,
          objectTypeId: 10,
          key: 'rating',
          label: '評価点',
          type: 'NUMBER' as const,
          required: false,
          sortOrder: 2,
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    const dto = {
      name: '仕入先評価 改訂',
      fieldDefs: [
        { key: 'name', label: '仕入先名', type: 'TEXT' as const, required: false },
        { key: 'rating', label: '評点', type: 'NUMBER' as const, required: false },
        { key: 'memo', label: 'メモ', type: 'TEXT' as const, required: false },
      ],
    };

    it('recordなしでは全置換し、省略値をnull/0へ確定する', async () => {
      mockRepo.updateDefinitionAtomic.mockImplementation(async (_key, data, validate) => {
        validate(current, 0);
        return { ...current, ...data };
      });

      const result = await service.update('supplier-score', dto);

      expect(mockRepo.updateDefinitionAtomic).toHaveBeenCalledWith(
        'supplier-score',
        expect.objectContaining({ name: dto.name, icon: null, sortOrder: 0 }),
        expect.any(Function),
      );
      expect(result.data.key).toBe('supplier-score');
    });

    it('recordありでもlabel/reorder、required緩和、新規optionalを許可する', async () => {
      mockRepo.updateDefinitionAtomic.mockImplementation(async (_key, data, validate) => {
        validate(current, 25);
        return { ...current, ...data };
      });

      await expect(service.update('supplier-score', dto)).resolves.toMatchObject({
        success: true,
      });
    });

    it.each([
      ['field削除', dto.fieldDefs.filter((field) => field.key !== 'rating')],
      [
        'type変更',
        dto.fieldDefs.map((field) =>
          field.key === 'rating' ? { ...field, type: 'TEXT' as const } : field,
        ),
      ],
      [
        'optionalからrequired',
        dto.fieldDefs.map((field) =>
          field.key === 'rating' ? { ...field, required: true } : field,
        ),
      ],
      [
        '新規required',
        dto.fieldDefs.map((field) => (field.key === 'memo' ? { ...field, required: true } : field)),
      ],
    ])('recordありでは互換性を壊す変更を409にする: %s', async (_label, fieldDefs) => {
      mockRepo.updateDefinitionAtomic.mockImplementation(async (_key, _data, validate) => {
        validate(current, 25);
        throw new Error('write must not run');
      });

      await expect(service.update('supplier-score', { ...dto, fieldDefs })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('不存在とpresetを明示的に拒否する', async () => {
      mockRepo.updateDefinitionAtomic.mockImplementationOnce(async (_key, _data, validate) =>
        validate(null, 0),
      );
      await expect(service.update('missing', dto)).rejects.toBeInstanceOf(NotFoundException);

      mockRepo.updateDefinitionAtomic.mockImplementationOnce(async (_key, _data, validate) =>
        validate({ ...current, isPreset: true }, 0),
      );
      await expect(service.update('product', dto)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('重複field keyはtransaction開始前に400にする', async () => {
      await expect(
        service.update('supplier-score', {
          name: '重複',
          fieldDefs: [dto.fieldDefs[0], dto.fieldDefs[0]],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepo.updateDefinitionAtomic).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('プリセット行を isPreset=true で返すこと', async () => {
      const presets = makePresets();
      mockRepo.findAll.mockResolvedValue(presets);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5);
      expect(result.data.every((d) => d.isPreset === true)).toBe(true);
    });

    it('ObjectTypeResponseDto の shape を持つこと', async () => {
      const presets = makePresets();
      mockRepo.findAll.mockResolvedValue(presets);

      const result = await service.findAll();
      const first = result.data[0];

      expect(first).toEqual(
        expect.objectContaining({
          id: presets[0].id,
          key: presets[0].key,
          name: presets[0].name,
          icon: presets[0].icon,
          sortOrder: presets[0].sortOrder,
          isPreset: true,
          createdAt: presets[0].createdAt,
          updatedAt: presets[0].updatedAt,
        }),
      );
    });

    it('5種のプリセット種別が全て引けること', async () => {
      const presets = makePresets();
      mockRepo.findAll.mockResolvedValue(presets);

      const result = await service.findAll();
      const keys = result.data.map((d) => d.key);

      expect(keys).toContain('product');
      expect(keys).toContain('warehouse');
      expect(keys).toContain('carrier');
      expect(keys).toContain('supplier');
      expect(keys).toContain('category');
    });

    it('ユーザー向け一覧は静的object-types権限と動的view権限で分離すること', async () => {
      const items = [
        ...makePresets().slice(0, 2),
        makeObjectTypeEntity({ id: 10, key: 'project', isPreset: false }),
        makeObjectTypeEntity({ id: 11, key: 'secret-ledger', isPreset: false }),
      ];
      mockRepo.findAll.mockResolvedValue(items);
      mockPermissions.getEffectivePermissionMap.mockResolvedValue(
        new Map([
          ['object-types', { canView: true, canCreate: false, canUpdate: false, canDelete: false }],
          [
            'object-type:project',
            { canView: true, canCreate: true, canUpdate: false, canDelete: false },
          ],
          [
            'object-type:secret-ledger',
            { canView: false, canCreate: true, canUpdate: true, canDelete: true },
          ],
        ]),
      );

      const result = await service.findVisibleForUser(UserRole.WH_USER);

      expect(result.data.map((item) => item.key)).toEqual(['product', 'warehouse', 'project']);
      expect(mockPermissions.getEffectivePermissionMap).toHaveBeenCalledWith(UserRole.WH_USER);
    });

    it('role未割当はユーザー向け一覧を空にすること', async () => {
      mockRepo.findAll.mockResolvedValue([
        ...makePresets(),
        makeObjectTypeEntity({ key: 'project' }),
      ]);
      mockPermissions.getEffectivePermissionMap.mockResolvedValue(new Map());

      const result = await service.findVisibleForUser(null);

      expect(result.data).toEqual([]);
    });
  });

  describe('findByKey', () => {
    it('キーで ObjectType を取得できること', async () => {
      const preset = makeObjectTypeEntity({ key: 'warehouse', isPreset: true });
      mockRepo.findByKey.mockResolvedValue(preset);

      const result = await service.findByKey('warehouse');

      expect(result.success).toBe(true);
      expect(result.data.key).toBe('warehouse');
      expect(result.data.isPreset).toBe(true);
    });

    it('存在しないキーで NotFoundException をスローすること', async () => {
      mockRepo.findByKey.mockResolvedValue(null);

      await expect(service.findByKey('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('項目定義（fieldDefs）が並び順どおりに含まれて返ること（ref-0076）', async () => {
      const withDefs = {
        ...makeObjectTypeEntity({ key: 'project', isPreset: false }),
        fieldDefs: [
          {
            id: 1,
            objectTypeId: 10,
            key: 'code',
            label: 'コード',
            type: 'TEXT',
            required: true,
            sortOrder: 2,
          },
          {
            id: 2,
            objectTypeId: 10,
            key: 'name',
            label: '名前',
            type: 'TEXT',
            required: true,
            sortOrder: 1,
          },
        ],
      };
      mockRepo.findByKey.mockResolvedValue(withDefs);

      const result = await service.findByKey('project');

      expect(result.success).toBe(true);
      expect(result.data.fieldDefs).toEqual([
        expect.objectContaining({
          key: 'code',
          label: 'コード',
          type: 'TEXT',
          required: true,
          sortOrder: 2,
        }),
        expect.objectContaining({
          key: 'name',
          label: '名前',
          type: 'TEXT',
          required: true,
          sortOrder: 1,
        }),
      ]);
    });
  });

  describe('findRecords', () => {
    it('自由定義の台帳のデータ一覧をページング形で返すこと（ref-0076）', async () => {
      const type = makeObjectTypeEntity({ key: 'project', isPreset: false });
      mockRepo.findByKeyBare.mockResolvedValue(type);
      mockRepo.findRecords.mockResolvedValue({
        items: [
          {
            id: 1,
            objectTypeId: 10,
            data: { name: 'A' },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
      });

      const result = await service.findRecords('project', 1, 200);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ id: 1, objectTypeId: 10, data: { name: 'A' } });
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 200, totalPages: 1 });
      expect(mockRepo.findByKeyBare).toHaveBeenCalledWith('project');
      expect(mockRepo.findRecords).toHaveBeenCalledWith(type.id, 1, 200);
    });

    it('プリセット種別は常に空ページを返す（既存マスタの二重表示を防ぐ・ref-0076）', async () => {
      const preset = makeObjectTypeEntity({ key: 'product', isPreset: true });
      mockRepo.findByKeyBare.mockResolvedValue(preset);

      const result = await service.findRecords('product', 2, 50);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({ total: 0, page: 2, limit: 50, totalPages: 0 });
      expect(mockRepo.findRecords).not.toHaveBeenCalled();
    });

    it('存在しない台帳キーで NotFoundException をスローすること（ref-0076）', async () => {
      mockRepo.findByKeyBare.mockResolvedValue(null);

      await expect(service.findRecords('nonexistent', 1, 200)).rejects.toThrow(NotFoundException);
      expect(mockRepo.findRecords).not.toHaveBeenCalled();
    });
  });

  describe('findRecord', () => {
    const type = makeObjectTypeEntity({ id: 10, key: 'supplier-score', isPreset: false });

    it('一覧のページ窓を経由せず、台帳に属する1件を単体取得で返す', async () => {
      mockRepo.findByKeyBare.mockResolvedValue(type);
      mockRepo.findRecordInObjectType.mockResolvedValue({
        id: 51,
        objectTypeId: 10,
        data: { name: '仕入先51' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.findRecord('supplier-score', 51);

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({ id: 51, objectTypeId: 10, data: { name: '仕入先51' } });
      expect(mockRepo.findByKeyBare).toHaveBeenCalledWith('supplier-score');
      expect(mockRepo.findRecordInObjectType).toHaveBeenCalledWith(10, 51);
      expect(mockRepo.findRecords).not.toHaveBeenCalled();
    });

    it('別 ObjectType に属する id・存在しない id は 404 にする（所属境界・存在を露出しない）', async () => {
      mockRepo.findByKeyBare.mockResolvedValue(type);
      mockRepo.findRecordInObjectType.mockResolvedValue(null);

      await expect(service.findRecord('supplier-score', 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockRepo.findRecordInObjectType).toHaveBeenCalledWith(10, 999);
    });

    it('存在しない台帳キーは 404 で repository を呼ばない', async () => {
      mockRepo.findByKeyBare.mockResolvedValue(null);

      await expect(service.findRecord('nonexistent', 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.findRecordInObjectType).not.toHaveBeenCalled();
    });

    it('プリセット台帳は 404 にする（専用マスタが正本でレコードを持たない）', async () => {
      mockRepo.findByKeyBare.mockResolvedValue(
        makeObjectTypeEntity({ id: 1, key: 'product', isPreset: true }),
      );

      await expect(service.findRecord('product', 1)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockRepo.findRecordInObjectType).not.toHaveBeenCalled();
    });
  });

  describe('createRecord', () => {
    const defs = [
      { key: 'name', label: '仕入先名', type: 'TEXT' as const, required: true, sortOrder: 1 },
      { key: 'reviewedOn', label: '評価日', type: 'DATE' as const, required: false, sortOrder: 2 },
    ];
    const type = makeObjectTypeEntity({ id: 10, key: 'supplier-score', isPreset: false });

    it('非プリセット台帳に FieldDef 検証を通る data で作成し、レスポンスを返す', async () => {
      const record = {
        id: 1,
        objectTypeId: 10,
        data: { name: '仕入先01', reviewedOn: '2026-08-01' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.createRecordAtomic.mockImplementation(async (_key, _data, validate) => {
        validate(type, defs);
        return record;
      });

      const result = await service.createRecord('supplier-score', {
        data: { name: '仕入先01', reviewedOn: '2026-08-01' },
      });

      expect(mockRepo.createRecordAtomic).toHaveBeenCalledWith(
        'supplier-score',
        { name: '仕入先01', reviewedOn: '2026-08-01' },
        expect.any(Function),
      );
      expect(result.data).toMatchObject({ id: 1, objectTypeId: 10, data: { name: '仕入先01' } });
    });

    it('未知キーを 400 で拒否する（FieldDef 正本検証）', async () => {
      mockRepo.createRecordAtomic.mockImplementation(async (_key, _data, validate) => {
        validate(type, defs);
      });
      await expect(
        service.createRecord('supplier-score', { data: { name: 'x', unknown: 1 } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('必須欠落を 400 で拒否する', async () => {
      mockRepo.createRecordAtomic.mockImplementation(async (_key, _data, validate) => {
        validate(type, defs);
      });
      await expect(
        service.createRecord('supplier-score', { data: { reviewedOn: '2026-08-01' } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('型不一致を 400 で拒否する（DATE は YYYY-MM-DD のみ）', async () => {
      mockRepo.createRecordAtomic.mockImplementation(async (_key, _data, validate) => {
        validate(type, defs);
      });
      await expect(
        service.createRecord('supplier-score', { data: { name: 'x', reviewedOn: 123 } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('不存在キーは 404・プリセットは 403 で拒否する', async () => {
      mockRepo.createRecordAtomic.mockImplementationOnce(async (_key, _data, validate) =>
        validate(null, defs),
      );
      await expect(service.createRecord('missing', { data: { name: 'x' } })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      mockRepo.createRecordAtomic.mockImplementationOnce(async (_key, _data, validate) =>
        validate({ ...type, isPreset: true }, defs),
      );
      await expect(service.createRecord('product', { data: { name: 'x' } })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('updateRecord', () => {
    const defs = [
      { key: 'name', label: '仕入先名', type: 'TEXT' as const, required: true, sortOrder: 1 },
    ];
    const type = makeObjectTypeEntity({ id: 10, key: 'supplier-score', isPreset: false });

    it('data を完全置換で更新し、レスポンスを返す', async () => {
      const record = {
        id: 1,
        objectTypeId: 10,
        data: { name: '更新後' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.updateRecordAtomic.mockImplementation(async (_key, _id, _data, validate) => {
        validate(type, defs, record);
        return record;
      });

      const result = await service.updateRecord('supplier-score', 1, { data: { name: '更新後' } });

      expect(mockRepo.updateRecordAtomic).toHaveBeenCalledWith(
        'supplier-score',
        1,
        { name: '更新後' },
        expect.any(Function),
      );
      expect(result.data).toMatchObject({ id: 1, data: { name: '更新後' } });
    });

    it('存在しないレコードは 404 で拒否する', async () => {
      mockRepo.updateRecordAtomic.mockImplementation(async (_key, _id, _data, validate) =>
        validate(type, defs, null),
      );
      await expect(
        service.updateRecord('supplier-score', 999, { data: { name: 'x' } }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('別 ObjectType に属するレコードは 404 で拒否する', async () => {
      mockRepo.updateRecordAtomic.mockImplementation(async (_key, _id, _data, validate) =>
        validate(type, defs, {
          id: 1,
          objectTypeId: 99,
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
      await expect(
        service.updateRecord('supplier-score', 1, { data: { name: 'x' } }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('未知キー・型不一致を 400 で拒否する', async () => {
      mockRepo.updateRecordAtomic.mockImplementation(async (_key, _id, _data, validate) => {
        validate(type, defs, {
          id: 1,
          objectTypeId: 10,
          data: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      await expect(
        service.updateRecord('supplier-score', 1, { data: { name: 'x', unknown: 1 } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteRecord', () => {
    const type = makeObjectTypeEntity({ id: 10, key: 'supplier-score', isPreset: false });

    it('対象レコードを削除し、okMessage を返す', async () => {
      const record = {
        id: 1,
        objectTypeId: 10,
        data: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRepo.deleteRecordAtomic.mockImplementation(async (_key, _id, validate) => {
        validate(type, record);
        return record;
      });

      const result = await service.deleteRecord('supplier-score', 1);

      expect(mockRepo.deleteRecordAtomic).toHaveBeenCalledWith(
        'supplier-score',
        1,
        expect.any(Function),
      );
      expect(result).toEqual({ success: true, data: { message: 'CustomRecord deleted' } });
    });

    it('存在しないレコードは 404 で拒否する', async () => {
      mockRepo.deleteRecordAtomic.mockImplementation(async (_key, _id, validate) =>
        validate(type, null),
      );
      await expect(service.deleteRecord('supplier-score', 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('プリセットは 403 で拒否する', async () => {
      mockRepo.deleteRecordAtomic.mockImplementation(async (_key, _id, validate) =>
        validate(
          { ...type, isPreset: true },
          { id: 1, objectTypeId: 10, data: {}, createdAt: new Date(), updatedAt: new Date() },
        ),
      );
      await expect(service.deleteRecord('product', 1)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
