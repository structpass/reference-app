import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('getHealth', () => {
    it('ステータスが"ok"であること', () => {
      const result = service.getHealth();
      expect(result.status).toBe('ok');
    });

    it('タイムスタンプがISO 8601形式であること', () => {
      const result = service.getHealth();
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('statusとtimestampの両方のプロパティを持つこと', () => {
      const result = service.getHealth();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
    });
  });
});
