import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SystemSettingsService, UI_THEME_KEY } from './system-settings.service';
import { SystemSettingsRepository } from './repositories/system-settings.repository';
import { makeSystemSettingEntity } from '@/__tests__/factories';

/** SystemSettingWithUpdaterResponseDto shape */
const mockSettingString = makeSystemSettingEntity({
  id: 'setting-uuid-1',
  key: 'company.name',
  value: '株式会社A',
  valueType: 'STRING',
  label: '会社名',
  description: null,
  category: 'company',
  sortOrder: 1,
  updatedById: 'user-1',
  updatedBy: { id: 'user-1', name: 'admin' },
});

const mockSettingNumber = makeSystemSettingEntity({
  id: 'setting-uuid-2',
  key: 'stock.threshold',
  value: '10',
  valueType: 'NUMBER',
  label: '在庫閾値',
  description: null,
  category: 'stock',
  sortOrder: 1,
  updatedById: null,
  updatedBy: null,
});

const mockSettingTheme = makeSystemSettingEntity({
  id: 'setting-uuid-3',
  key: UI_THEME_KEY,
  value: 'default',
  valueType: 'STRING',
  label: 'UI テーマ',
  description: null,
  category: 'system',
  sortOrder: 100,
  updatedById: null,
  updatedBy: null,
});

const mockRepo = {
  findAllWithUpdater: jest.fn(),
  findAllForCache: jest.fn(),
  findByKey: jest.fn(),
  findByKeyBare: jest.fn(),
  findByKeys: jest.fn(),
  updateByKey: jest.fn(),
  bulkUpdateAtomic: jest.fn(),
};

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SystemSettingsService, { provide: SystemSettingsRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<SystemSettingsService>(SystemSettingsService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('全設定を ok envelope で返すこと', async () => {
      mockRepo.findAllWithUpdater.mockResolvedValue([mockSettingString, mockSettingNumber]);

      const result = await service.findAll();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([mockSettingString, mockSettingNumber]);
    });

    it('空配列でも data:[] で返ること', async () => {
      mockRepo.findAllWithUpdater.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result.data).toEqual([]);
    });
  });

  describe('findByKey', () => {
    it('存在するキーの場合に設定を返すこと', async () => {
      mockRepo.findByKey.mockResolvedValue(mockSettingString);

      const result = await service.findByKey('company.name');

      expect(result.success).toBe(true);
      expect(mockRepo.findByKey).toHaveBeenCalledWith('company.name');
    });

    it('SystemSettingWithUpdaterResponseDto の shape を持つこと', async () => {
      mockRepo.findByKey.mockResolvedValue(mockSettingString);

      const result = await service.findByKey('company.name');

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockSettingString.id,
          key: mockSettingString.key,
          value: mockSettingString.value,
          valueType: mockSettingString.valueType,
          label: mockSettingString.label,
          category: mockSettingString.category,
          updatedById: mockSettingString.updatedById,
          updatedBy: { id: 'user-1', name: 'admin' },
        }),
      );
    });

    it('存在しないキーの場合に NotFoundException をスローすること', async () => {
      mockRepo.findByKey.mockResolvedValue(null);

      await expect(service.findByKey('missing.key')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateByKey', () => {
    it('STRING 型の値を更新できること', async () => {
      mockRepo.findByKeyBare.mockResolvedValue(mockSettingString);
      mockRepo.updateByKey.mockResolvedValue({ ...mockSettingString, value: '株式会社B' });

      const result = await service.updateByKey('company.name', { value: '株式会社B' }, 'user-1');

      expect(result.success).toBe(true);
      expect(result.data.value).toBe('株式会社B');
      expect(mockRepo.updateByKey).toHaveBeenCalledWith('company.name', '株式会社B', 'user-1');
    });

    it('SystemSettingWithUpdaterResponseDto の shape を持つこと', async () => {
      const updated = { ...mockSettingString, value: '株式会社B' };
      mockRepo.findByKeyBare.mockResolvedValue(mockSettingString);
      mockRepo.updateByKey.mockResolvedValue(updated);

      const result = await service.updateByKey('company.name', { value: '株式会社B' }, 'user-1');

      expect(result.data).toEqual(
        expect.objectContaining({
          id: updated.id,
          key: updated.key,
          value: '株式会社B',
          updatedById: updated.updatedById,
          updatedBy: { id: 'user-1', name: 'admin' },
        }),
      );
    });

    it('NUMBER 型で非数値を渡すと BadRequestException をスローすること', async () => {
      mockRepo.findByKeyBare.mockResolvedValue(mockSettingNumber);

      await expect(
        service.updateByKey('stock.threshold', { value: 'abc' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.updateByKey).not.toHaveBeenCalled();
    });

    it('BOOLEAN 型で true/false 以外を渡すと BadRequestException をスローすること', async () => {
      mockRepo.findByKeyBare.mockResolvedValue({ ...mockSettingString, valueType: 'BOOLEAN' });

      await expect(service.updateByKey('some.bool', { value: 'yes' }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('JSON 型で不正な JSON を渡すと BadRequestException をスローすること', async () => {
      mockRepo.findByKeyBare.mockResolvedValue({ ...mockSettingString, valueType: 'JSON' });

      await expect(
        service.updateByKey('some.json', { value: '{invalid}' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('存在しないキーの場合に NotFoundException をスローすること', async () => {
      mockRepo.findByKeyBare.mockResolvedValue(null);

      await expect(service.updateByKey('missing.key', { value: 'v' }, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    // UI_THEME_KEY は ENUM_VALIDATORS に登録されており、updateByKey の通常 path と
    // 別の検証（許可値リスト・正規化）が走る。意図的に 3 階層 describe で枝を分けている。
    describe(UI_THEME_KEY, () => {
      it('許可された値（default / plains / island / mountain / swamp / forest）を更新できること', async () => {
        mockRepo.findByKeyBare.mockResolvedValue(mockSettingTheme);
        mockRepo.updateByKey.mockResolvedValue({ ...mockSettingTheme, value: 'plains' });

        const result = await service.updateByKey(UI_THEME_KEY, { value: 'plains' }, 'user-1');

        expect(result.success).toBe(true);
        expect(result.data.value).toBe('plains');
      });

      it('未定義の値を渡すと BadRequestException をスローすること', async () => {
        mockRepo.findByKeyBare.mockResolvedValue(mockSettingTheme);

        await expect(
          service.updateByKey(UI_THEME_KEY, { value: 'unknown-theme' }, 'user-1'),
        ).rejects.toThrow(BadRequestException);
        expect(mockRepo.updateByKey).not.toHaveBeenCalled();
      });

      it('空文字や大文字混在も拒否されること', async () => {
        mockRepo.findByKeyBare.mockResolvedValue(mockSettingTheme);

        await expect(
          service.updateByKey(UI_THEME_KEY, { value: 'Plains' }, 'user-1'),
        ).rejects.toThrow(BadRequestException);
        await expect(service.updateByKey(UI_THEME_KEY, { value: '' }, 'user-1')).rejects.toThrow();
      });
    });
  });

  describe('bulkUpdate', () => {
    /**
     * bulkUpdateAtomic は (updates, userId, validate) を受け取り、
     * validate(existing) を同期的に呼んで結果配列を返す形に統一されている。
     * テスト用ヘルパーで existing と results を注入する。
     */
    const setupAtomic = (existing: any[], results: any[]) => {
      mockRepo.bulkUpdateAtomic.mockImplementation(
        async (
          _updates: Array<{ key: string; value: string }>,
          _userId: string,
          validate: (existing: any[]) => void,
        ) => {
          validate(existing);
          return results;
        },
      );
    };

    it('複数設定を一括更新できること', async () => {
      setupAtomic(
        [mockSettingString, mockSettingNumber],
        [
          { ...mockSettingString, value: '株式会社C' },
          { ...mockSettingNumber, value: '20' },
        ],
      );

      const result = await service.bulkUpdate(
        [
          { key: 'company.name', value: '株式会社C' },
          { key: 'stock.threshold', value: '20' },
        ],
        'user-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockRepo.bulkUpdateAtomic).toHaveBeenCalled();
    });

    it('SystemSettingWithUpdaterResponseDto の shape を持つこと', async () => {
      const updated1 = { ...mockSettingString, value: '株式会社C' };
      const updated2 = { ...mockSettingNumber, value: '20' };
      setupAtomic([mockSettingString, mockSettingNumber], [updated1, updated2]);

      const result = await service.bulkUpdate(
        [
          { key: 'company.name', value: '株式会社C' },
          { key: 'stock.threshold', value: '20' },
        ],
        'user-1',
      );

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: updated1.id,
          key: updated1.key,
          value: '株式会社C',
          updatedBy: { id: 'user-1', name: 'admin' },
        }),
      );
      expect(result.data[1]).toEqual(
        expect.objectContaining({
          id: updated2.id,
          key: updated2.key,
          value: '20',
          updatedBy: null,
        }),
      );
    });

    it('一つでも存在しないキーがあれば NotFoundException をスローすること', async () => {
      setupAtomic([mockSettingString], []);

      await expect(
        service.bulkUpdate(
          [
            { key: 'company.name', value: '株式会社C' },
            { key: 'missing.key', value: 'v' },
          ],
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('一つでも型不正があれば BadRequestException をスローすること', async () => {
      setupAtomic([mockSettingString, mockSettingNumber], []);

      await expect(
        service.bulkUpdate(
          [
            { key: 'company.name', value: 'ok' },
            { key: 'stock.threshold', value: 'not-number' },
          ],
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('一つでもテーマキーが不正値なら BadRequestException をスローすること', async () => {
      setupAtomic([mockSettingString, mockSettingTheme], []);

      await expect(
        service.bulkUpdate(
          [
            { key: 'company.name', value: 'ok' },
            { key: UI_THEME_KEY, value: 'unknown-theme' },
          ],
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPublicConfig / getValue (cache)', () => {
    it('getPublicConfig は PUBLIC_CONFIG_KEYS ホワイトリスト内のキーのみを返すこと', async () => {
      mockRepo.findAllForCache.mockResolvedValue([
        { key: 'company.name', value: '株式会社A' },
        { key: 'stock.threshold', value: '10' },
        { key: UI_THEME_KEY, value: 'plains' },
      ]);

      const result = await service.getPublicConfig();

      // company.name / stock.threshold は非公開キーなので含まれない
      expect(result).toEqual({
        success: true,
        data: { [UI_THEME_KEY]: 'plains' },
      });
      expect(mockRepo.findAllForCache).toHaveBeenCalledTimes(1);
    });

    it('複数回呼んでも cache は一度しかロードされないこと', async () => {
      mockRepo.findAllForCache.mockResolvedValue([{ key: 'k', value: 'v' }]);

      await service.getPublicConfig();
      await service.getPublicConfig();

      expect(mockRepo.findAllForCache).toHaveBeenCalledTimes(1);
    });

    it('getValue は cache から値を取得し、未定義時は fallback を返すこと', async () => {
      mockRepo.findAllForCache.mockResolvedValue([{ key: 'known', value: '123' }]);

      expect(await service.getValue('known')).toBe('123');
      expect(await service.getValue('unknown', 'def')).toBe('def');
      expect(await service.getValue('unknown')).toBe('');
    });

    it('updateByKey 実行後は cache が invalidate されて再ロードされること', async () => {
      mockRepo.findAllForCache.mockResolvedValue([{ key: 'k', value: 'v1' }]);
      mockRepo.findByKeyBare.mockResolvedValue({ ...mockSettingString, valueType: 'STRING' });
      mockRepo.updateByKey.mockResolvedValue({ ...mockSettingString, value: 'v2' });

      await service.getPublicConfig();
      expect(mockRepo.findAllForCache).toHaveBeenCalledTimes(1);

      await service.updateByKey('company.name', { value: 'v2' }, 'user-1');

      mockRepo.findAllForCache.mockResolvedValue([{ key: 'k', value: 'v2' }]);
      await service.getPublicConfig();

      expect(mockRepo.findAllForCache).toHaveBeenCalledTimes(2);
    });
  });
});
