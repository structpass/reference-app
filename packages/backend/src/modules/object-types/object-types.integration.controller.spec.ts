import { Test, TestingModule } from '@nestjs/testing';
import { ObjectTypesIntegrationController } from './object-types.integration.controller';
import { ObjectTypesService } from './object-types.service';
import { ServiceTokenGuard } from '../../common/guards';

describe('ObjectTypesIntegrationController (ref-0095)', () => {
  let controller: ObjectTypesIntegrationController;

  const mockService = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ObjectTypesIntegrationController],
      providers: [{ provide: ObjectTypesService, useValue: mockService }],
    }).compile();

    controller = module.get<ObjectTypesIntegrationController>(ObjectTypesIntegrationController);
    jest.clearAllMocks();
  });

  it('コントローラーが定義されていること', () => {
    expect(controller).toBeDefined();
  });

  it('既存 findAll と同じ応答 shape を返すこと（サービスへ委譲）', async () => {
    const expected = {
      success: true,
      data: [{ id: 1, key: 'product', name: '商品', isPreset: true }],
    };
    mockService.findAll.mockResolvedValue(expected);

    const result = await controller.findAll();

    expect(result).toEqual(expected);
    expect(mockService.findAll).toHaveBeenCalled();
  });

  it('ServiceTokenGuard が適用されていること（class level @UseGuards）', () => {
    const guards = Reflect.getMetadata('__guards__', ObjectTypesIntegrationController);
    expect(guards).toContain(ServiceTokenGuard);
  });
});
