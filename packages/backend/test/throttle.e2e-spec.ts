import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { applyTrustProxy } from '../src/main';

/**
 * レート制限の trust proxy 出し分け境界（ref-0062）。
 *
 * 通常の e2e は createE2EApp（noopThrottlerStorage でスロットル無効）を使うが、
 * 本 spec はスロットルの実挙動を検証するため throttle 有効の app を別に作る。
 * 有効/無効の出し分けは main.ts の applyTrustProxy をそのまま呼ぶ
 * （env ゲート自体（'true' / '1' / 'TRUE' / 未設定）のテストは main.spec.ts が担う）。
 */

/** スロットル実挙動用 app（TRUST_PROXY=true 相当時のみ trust proxy hops=1 を設定）。 */
async function createThrottleApp(trustProxy: boolean): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  applyTrustProxy(app, trustProxy ? 'true' : undefined);
  await app.init();
  return app;
}

const LIMIT = 30; // app.module.ts の default throttle（30 req / 60s）と一致させる

describe('レート制限の trust proxy 出し分け（ref-0062）', () => {
  describe('TRUST_PROXY 未設定（直結前提・既定 off）', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createThrottleApp(false);
    });

    afterAll(async () => {
      await app.close();
    });

    it('偽 XFF では回避できない: 30 回超過後、ヘッダ値を変えても 429 のまま（接続元 IP 基準の同一バケット）', async () => {
      for (let i = 0; i < LIMIT; i++) {
        await request(app.getHttpServer())
          .get('/api/v1/health')
          .set('X-Forwarded-For', '1.2.3.4')
          .expect(200);
      }
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', '1.2.3.4')
        .expect(429);
      // ヘッダ値を変えても XFF は信頼されない（接続元 IP 基準）ため同一バケットで 429
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', '9.9.9.9')
        .expect(429);
    });
  });

  describe('TRUST_PROXY 有効（Caddy 1 段配下）', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createThrottleApp(true);
    });

    afterAll(async () => {
      await app.close();
    });

    it('XFF が異なれば独立バケット: A で 429 到達後も B は 200（共有バケット解消）', async () => {
      for (let i = 0; i < LIMIT; i++) {
        await request(app.getHttpServer())
          .get('/api/v1/health')
          .set('X-Forwarded-For', '1.2.3.4')
          .expect(200);
      }
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', '1.2.3.4')
        .expect(429);
      // 別クライアント（XFF 5.6.7.8）は独立バケットで 200
      await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', '5.6.7.8')
        .expect(200);
    });
  });
});
