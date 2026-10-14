import { Test, TestingModule } from '@nestjs/testing';
import { ObjectTypesRepository } from './object-types.repository';
import { PrismaService } from '../../../database/prisma.service';

const mockPrisma = {
  objectType: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  fieldDef: {
    findMany: jest.fn(),
  },
  customRecord: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('ObjectTypesRepository', () => {
  let repo: ObjectTypesRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ObjectTypesRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<ObjectTypesRepository>(ObjectTypesRepository);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') return arg(mockPrisma);
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  describe('create', () => {
    it('ObjectTypeとFieldDefをnested writeで原子的に作成し、項目定義を表示順で返す', async () => {
      mockPrisma.objectType.create.mockResolvedValue({ id: 10, key: 'supplier-score' });
      const data = {
        key: 'supplier-score',
        name: '仕入先評価',
        icon: 'clipboard-check',
        sortOrder: 6,
        fieldDefs: [
          { key: 'name', label: '仕入先名', type: 'TEXT' as const, required: true, sortOrder: 1 },
        ],
      };

      await repo.create(data);

      expect(mockPrisma.objectType.create).toHaveBeenCalledWith({
        data: {
          key: 'supplier-score',
          name: '仕入先評価',
          icon: 'clipboard-check',
          sortOrder: 6,
          isPreset: false,
          fieldDefs: { create: data.fieldDefs },
        },
        include: { fieldDefs: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  });

  describe('updateDefinitionAtomic', () => {
    it('fresh定義とrecord countを検証してSerializable内で全置換する', async () => {
      const current = { id: 10, key: 'supplier-score', isPreset: false, fieldDefs: [] };
      mockPrisma.objectType.findUnique.mockResolvedValue(current);
      mockPrisma.customRecord.count.mockResolvedValue(25);
      mockPrisma.objectType.update.mockResolvedValue({ ...current, name: '改訂' });
      const validate = jest.fn();
      const data = {
        name: '改訂',
        icon: null,
        sortOrder: 0,
        fieldDefs: [
          { key: 'name', label: '名称', type: 'TEXT' as const, required: true, sortOrder: 1 },
        ],
      };

      await repo.updateDefinitionAtomic('supplier-score', data, validate);

      expect(validate).toHaveBeenCalledWith(current, 25);
      expect(mockPrisma.objectType.update).toHaveBeenCalledWith({
        where: { key: 'supplier-score' },
        data: {
          name: '改訂',
          icon: null,
          sortOrder: 0,
          fieldDefs: { deleteMany: {}, create: data.fieldDefs },
        },
        include: { fieldDefs: { orderBy: { sortOrder: 'asc' } } },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    it('検証失敗時は更新しない', async () => {
      mockPrisma.objectType.findUnique.mockResolvedValue(null);

      await expect(
        repo.updateDefinitionAtomic(
          'missing',
          { name: 'missing', icon: null, sortOrder: 0, fieldDefs: [] },
          () => {
            throw new Error('reject');
          },
        ),
      ).rejects.toThrow('reject');
      expect(mockPrisma.objectType.update).not.toHaveBeenCalled();
      expect(mockPrisma.customRecord.count).not.toHaveBeenCalled();
    });
  });

  describe('findByKey', () => {
    it('項目定義（fieldDefs）を sortOrder asc の並びで include する（ref-0076 criteria 1）', async () => {
      mockPrisma.objectType.findUnique.mockResolvedValue({ id: 10, key: 'project' });

      await repo.findByKey('project');

      expect(mockPrisma.objectType.findUnique).toHaveBeenCalledWith({
        where: { key: 'project' },
        include: { fieldDefs: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  });

  describe('findRecords', () => {
    it('skip/take によるページングと id asc の安定順で取得し total も数える（ref-0076 criteria 2）', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        [{ id: 1, objectTypeId: 10, data: { name: 'A' } }],
        25,
      ]);

      const result = await repo.findRecords(10, 2, 20);

      expect(mockPrisma.customRecord.findMany).toHaveBeenCalledWith({
        where: { objectTypeId: 10 },
        orderBy: { id: 'asc' },
        skip: 20,
        take: 20,
      });
      expect(mockPrisma.customRecord.count).toHaveBeenCalledWith({
        where: { objectTypeId: 10 },
      });
      expect(result).toEqual({
        items: [{ id: 1, objectTypeId: 10, data: { name: 'A' } }],
        total: 25,
      });
    });
  });

  describe('findRecordInObjectType', () => {
    it('{ id, objectTypeId } の複合スコープで1件引き、skip/take に依存しない', async () => {
      mockPrisma.customRecord.findFirst.mockResolvedValue({
        id: 51,
        objectTypeId: 10,
        data: { name: '仕入先51' },
      });

      const result = await repo.findRecordInObjectType(10, 51);

      expect(mockPrisma.customRecord.findFirst).toHaveBeenCalledWith({
        where: { id: 51, objectTypeId: 10 },
      });
      expect(result).toMatchObject({ id: 51, objectTypeId: 10 });
    });

    it('別 ObjectType に属する id・存在しない id は null になる（存在を露出しない）', async () => {
      mockPrisma.customRecord.findFirst.mockResolvedValue(null);

      await expect(repo.findRecordInObjectType(99, 51)).resolves.toBeNull();
      expect(mockPrisma.customRecord.findFirst).toHaveBeenCalledWith({
        where: { id: 51, objectTypeId: 99 },
      });
    });
  });

  describe('createRecordAtomic', () => {
    it('Serializable 内で ObjectType+FieldDef を fresh read して検証し作成する', async () => {
      const objectType = { id: 10, key: 'supplier-score', isPreset: false };
      const fieldDefs = [
        {
          id: 20,
          objectTypeId: 10,
          key: 'name',
          type: 'TEXT' as const,
          required: true,
          sortOrder: 1,
        },
      ];
      const record = { id: 1, objectTypeId: 10, data: { name: 'A' } };
      mockPrisma.objectType.findUnique.mockResolvedValue(objectType);
      mockPrisma.fieldDef.findMany.mockResolvedValue(fieldDefs);
      mockPrisma.customRecord.create.mockResolvedValue(record);
      const validate = jest.fn();

      const result = await repo.createRecordAtomic('supplier-score', { name: 'A' }, validate);

      expect(validate).toHaveBeenCalledWith(objectType, fieldDefs);
      expect(mockPrisma.customRecord.create).toHaveBeenCalledWith({
        data: { objectTypeId: 10, data: { name: 'A' } },
      });
      expect(result).toEqual(record);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    });

    it('検証失敗時は作成しない', async () => {
      mockPrisma.objectType.findUnique.mockResolvedValue(null);

      await expect(
        repo.createRecordAtomic('missing', { name: 'A' }, () => {
          throw new Error('reject');
        }),
      ).rejects.toThrow('reject');
      expect(mockPrisma.customRecord.create).not.toHaveBeenCalled();
    });
  });

  describe('updateRecordAtomic', () => {
    it('Serializable 内で検証して data を完全置換で更新する', async () => {
      const objectType = { id: 10, key: 'supplier-score', isPreset: false };
      const fieldDefs = [
        {
          id: 20,
          objectTypeId: 10,
          key: 'name',
          type: 'TEXT' as const,
          required: true,
          sortOrder: 1,
        },
      ];
      const record = { id: 1, objectTypeId: 10, data: { name: 'old' } };
      const updated = { id: 1, objectTypeId: 10, data: { name: 'new' } };
      mockPrisma.objectType.findUnique.mockResolvedValue(objectType);
      mockPrisma.fieldDef.findMany.mockResolvedValue(fieldDefs);
      mockPrisma.customRecord.findUnique.mockResolvedValue(record);
      mockPrisma.customRecord.update.mockResolvedValue(updated);
      const validate = jest.fn();

      const result = await repo.updateRecordAtomic('supplier-score', 1, { name: 'new' }, validate);

      expect(validate).toHaveBeenCalledWith(objectType, fieldDefs, record);
      expect(mockPrisma.customRecord.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { data: { name: 'new' } },
      });
      expect(result).toEqual(updated);
    });

    it('対象レコード不存在時は更新しない', async () => {
      const objectType = { id: 10, key: 'supplier-score', isPreset: false };
      mockPrisma.objectType.findUnique.mockResolvedValue(objectType);
      mockPrisma.customRecord.findUnique.mockResolvedValue(null);

      await expect(
        repo.updateRecordAtomic('supplier-score', 999, { name: 'x' }, () => {
          throw new Error('reject');
        }),
      ).rejects.toThrow('reject');
      expect(mockPrisma.customRecord.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteRecordAtomic', () => {
    it('Serializable 内で検証して削除する', async () => {
      const objectType = { id: 10, key: 'supplier-score', isPreset: false };
      const record = { id: 1, objectTypeId: 10, data: {} };
      mockPrisma.objectType.findUnique.mockResolvedValue(objectType);
      mockPrisma.customRecord.findUnique.mockResolvedValue(record);
      mockPrisma.customRecord.delete.mockResolvedValue(record);
      const validate = jest.fn();

      const result = await repo.deleteRecordAtomic('supplier-score', 1, validate);

      expect(validate).toHaveBeenCalledWith(objectType, record);
      expect(mockPrisma.customRecord.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(result).toEqual(record);
    });

    it('対象レコード不存在時は削除しない', async () => {
      const objectType = { id: 10, key: 'supplier-score', isPreset: false };
      mockPrisma.objectType.findUnique.mockResolvedValue(objectType);
      mockPrisma.customRecord.findUnique.mockResolvedValue(null);

      await expect(
        repo.deleteRecordAtomic('supplier-score', 999, () => {
          throw new Error('reject');
        }),
      ).rejects.toThrow('reject');
      expect(mockPrisma.customRecord.delete).not.toHaveBeenCalled();
    });
  });
});
