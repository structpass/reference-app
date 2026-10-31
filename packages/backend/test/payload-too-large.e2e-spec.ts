import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

/**
 * v2-535: JSON の本文が上限を超えた送信は 413 で返り、再送で解ける失敗（500 や 503）と混ざらない。
 *
 * ここで確かめるのは「アプリの組み立てを通した時の実際の応答」である。本文解析は
 * `@nestjs/platform-express` が他のミドルウェアより先に登録し、body-parser 2.3.0 は大きさ超過を
 * **400**（`type: entity.too.large`）に包む。アプリのミドルウェア（v2-535）がその応答を 413 へ
 * 揃えていることを、上限を跨ぐ本文を実際に送って確かめる。
 *
 * 上限は NestJS の既定（100kb）。ここでは 150kb の JSON を送る。
 * 比較のために、上限内の小さな本文でも同系統の経路（本文解析に失敗する形）が 400 のまま
 * 返ることを一緒に固定し、大きさ以外の失敗を巻き込んでいないことを示す。
 */
describe('本文が大きすぎる送信の応答 (v2-535)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('上限を超える本文は 413 / PAYLOAD_TOO_LARGE で返る', async () => {
    const oversized = { payload: 'x'.repeat(150 * 1024) };

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(oversized);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: '送信されたデータが大きすぎます。内容を減らして送り直してください',
      },
    });
    // 送信した内容の断片を応答に載せない。
    expect(JSON.stringify(res.body)).not.toContain('xxxx');
  }, 30000);

  it('上限内の本文は従来の経路のまま（本文解析の失敗を大きさと取り違えない）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send({ username: 'user', password: 'x' });

    // 認証情報が違えば 401（本文は解析されて経路に入っている）。
    expect(res.status).not.toBe(413);
    expect(res.status).not.toBe(500);
  }, 30000);

  /**
   * 413 専用のフィルタを足した状態でも、管轄外の応答が決めた形のままであること（d860）。
   *
   * このフィルタは @Catch() で全例外を受けるため、管轄外を扱い損ねると 401・404・不正 JSON の
   * 400 が決めた形の JSON にならなくなる（または応答自体が返らなくなる）。413 だけを見る試験では
   * その退行を捕まえられないので、同じ組立で 4 つの応答を固定する。
   */
  describe('管轄外の応答も決めた形の JSON のまま（d860）', () => {
    const expectErrorJson = (res: request.Response, status: number, code: string) => {
      expect(res.status).toBe(status);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(code);
      expect(typeof res.body.error.message).toBe('string');
    };

    it('認証なしの 401 は UNAUTHORIZED', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me');

      expectErrorJson(res, 401, 'UNAUTHORIZED');
    }, 30000);

    it('存在しない経路の 404 は NOT_FOUND', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/no-such-endpoint');

      expectErrorJson(res, 404, 'NOT_FOUND');
    }, 30000);

    it('不正 JSON の 400 は BAD_REQUEST（送信内容を応答に載せない）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"username": SECRETLEAKPROBE');

      expectErrorJson(res, 400, 'BAD_REQUEST');
      expect(JSON.stringify(res.body)).not.toContain('SECRETLEAKPROBE');
    }, 30000);
  });
});
