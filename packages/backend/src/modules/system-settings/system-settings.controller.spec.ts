import { Test, TestingModule } from '@nestjs/testing';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';

const mockService = {
  getPublicConfig: jest.fn(),
  findAll: jest.fn(),
  findByKey: jest.fn(),
  updateByKey: jest.fn(),
  bulkUpdate: jest.fn(),
};

describe('SystemSettingsController', () => {
  let controller: SystemSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemSettingsController],
      providers: [{ provide: SystemSettingsService, useValue: mockService }],
    }).compile();

    controller = module.get<SystemSettingsController>(SystemSettingsController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  describe('getPublicConfig', () => {
    it('公開設定を委譲して返すこと', async () => {
      const expected = { success: true, data: { 'system.ui.theme': 'default' } };
      mockService.getPublicConfig.mockResolvedValue(expected);

      const result = await controller.getPublicConfig();

      expect(result).toEqual(expected);
      expect(mockService.getPublicConfig).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('一覧を ok envelope で返すこと', async () => {
      const expected = { success: true, data: [] };
      mockService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll();

      expect(result).toEqual(expected);
    });
  });

  describe('findByKey', () => {
    it('キー指定で設定を返すこと', async () => {
      const expected = { success: true, data: { key: 'system.ui.theme', value: 'plains' } };
      mockService.findByKey.mockResolvedValue(expected);

      const result = await controller.findByKey('system.ui.theme');

      expect(result).toEqual(expected);
      expect(mockService.findByKey).toHaveBeenCalledWith('system.ui.theme');
    });
  });

  describe('updateByKey', () => {
    it('値と userId を Service に渡すこと', async () => {
      const expected = { success: true, data: { key: 'system.ui.theme', value: 'island' } };
      mockService.updateByKey.mockResolvedValue(expected);

      const result = await controller.updateByKey(
        'system.ui.theme',
        { value: 'island' },
        'user-uuid',
      );

      expect(result).toEqual(expected);
      expect(mockService.updateByKey).toHaveBeenCalledWith(
        'system.ui.theme',
        { value: 'island' },
        'user-uuid',
      );
    });
  });

  describe('bulkUpdate', () => {
    it('updates 配列と userId を渡すこと', async () => {
      const updates = [{ key: 'system.ui.theme', value: 'plains' }];
      const expected = { success: true, data: [] };
      mockService.bulkUpdate.mockResolvedValue(expected);

      const result = await controller.bulkUpdate({ updates } as any, 'user-uuid');

      expect(result).toEqual(expected);
      expect(mockService.bulkUpdate).toHaveBeenCalledWith(updates, 'user-uuid');
    });
  });
});
