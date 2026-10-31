import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import {
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  INestApplication,
  Param,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let auditService: AuditService;
  let reflector: Reflector;

  beforeEach(() => {
    auditService = { log: jest.fn() } as unknown as AuditService;
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    interceptor = new AuditInterceptor(auditService, reflector);
  });

  const createMockContext = (
    method: string,
    url: string,
    user?: { id: string },
    params?: Record<string, string>,
    body?: Record<string, unknown> | null,
    bodyOmitted = false,
  ): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url,
          user,
          params: params || {},
          route: { path: url },
          // body-parser は Content-Type の無い（本文の無い）リクエストで req.body を undefined のままにする
          body: bodyOmitted ? undefined : (body ?? { name: 'test' }),
        }),
      }),
    }) as unknown as ExecutionContext;

  const createMockHandler = (response: unknown): CallHandler => ({
    handle: () => of(response),
  });

  it('GETリクエストは監査対象外であること', (done) => {
    const context = createMockContext('GET', '/api/v1/products', { id: 'user-1' });
    const handler = createMockHandler({ success: true });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('認証なしのリクエストは監査対象外であること', (done) => {
    const context = createMockContext('POST', '/api/v1/products');
    const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('POSTリクエストでCREATEアクションが記録されること', (done) => {
    const context = createMockContext('POST', '/api/v1/products', { id: 'user-1' });
    const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          entityType: 'Products',
          action: 'CREATE',
        }),
      );
      done();
    });
  });

  it('ハイフンを含むエンドポイント名を監査対象として完全に記録すること', (done) => {
    const context = createMockContext('POST', '/api/v1/object-types', { id: 'user-1' });
    const handler = createMockHandler({ success: true, data: { id: 'type-1' } });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Object-types',
          entityId: 'type-1',
          action: 'CREATE',
        }),
      );
      done();
    });
  });

  it('PUTリクエストでUPDATEアクションが記録されること', (done) => {
    const context = createMockContext(
      'PUT',
      '/api/v1/products',
      { id: 'user-1' },
      { id: 'prod-1' },
    );
    const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'UPDATE',
        }),
      );
      done();
    });
  });

  it('DELETEリクエストでDELETEアクションが記録されること', (done) => {
    const context = createMockContext(
      'DELETE',
      '/api/v1/products',
      { id: 'user-1' },
      { id: 'prod-1' },
    );
    const handler = createMockHandler({ success: true });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'DELETE',
        }),
      );
      done();
    });
  });

  it('本文の無いDELETEでも落ちず、DELETEアクションが記録されること', (done) => {
    const context = createMockContext(
      'DELETE',
      '/api/v1/object-types/supplier-score/records/7',
      { id: 'user-1' },
      { id: '7' },
      undefined,
      true,
    );
    const handler = createMockHandler({ success: true });

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            entityType: 'Object-types',
            entityId: '7',
            action: 'DELETE',
            oldValues: {},
          }),
        );
        done();
      },
      error: (error: unknown) => done(error),
    });
  });

  it('authエンドポイントは監査対象外であること', (done) => {
    const context = createMockContext('POST', '/api/v1/auth/login', { id: 'user-1' });
    const handler = createMockHandler({ success: true });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditService.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('@SkipAudit() が付いたエンドポイントは監査対象外であること', (done) => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValueOnce(true);
    const context = createMockContext('PUT', '/api/v1/user-table-column-widths/me/products', {
      id: 'user-1',
    });
    const handler = createMockHandler({ success: true });

    interceptor.intercept(context, handler).subscribe(() => {
      expect(auditService.log).not.toHaveBeenCalled();
      done();
    });
  });

  describe('sanitizeBody（機密情報サニタイズ）', () => {
    it('PUTリクエストでpasswordフィールドが[REDACTED]に置換されること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/users',
        { id: 'user-1' },
        { id: 'user-2' },
        { name: 'Test User', password: 'secret123', email: 'test@example.com' },
      );
      const handler = createMockHandler({ success: true, data: { id: 'user-2' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            oldValues: expect.objectContaining({
              name: 'Test User',
              password: '[REDACTED]',
              email: 'test@example.com',
            }),
          }),
        );
        done();
      });
    });

    it('currentPassword, newPassword, passwordHash, token, secretがすべてサニタイズされること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/users',
        { id: 'user-1' },
        { id: '1' },
        {
          currentPassword: 'old',
          newPassword: 'new',
          passwordHash: 'hash',
          token: 'jwt',
          secret: 'key',
          name: 'keep-this',
        },
      );
      const handler = createMockHandler({ success: true, data: { id: '1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        const logCall = (auditService.log as jest.Mock).mock.calls[0][0];
        expect(logCall.oldValues).toEqual({
          currentPassword: '[REDACTED]',
          newPassword: '[REDACTED]',
          passwordHash: '[REDACTED]',
          token: '[REDACTED]',
          secret: '[REDACTED]',
          name: 'keep-this',
        });
        done();
      });
    });

    it('非機密フィールドはサニタイズされないこと', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/products',
        { id: 'user-1' },
        { id: 'prod-1' },
        { name: 'Widget', price: 100, description: 'A widget' },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        const logCall = (auditService.log as jest.Mock).mock.calls[0][0];
        expect(logCall.oldValues).toEqual({
          name: 'Widget',
          price: 100,
          description: 'A widget',
        });
        done();
      });
    });
  });

  describe('sanitizeBody（入れ子と鍵名の網羅）', () => {
    const loggedOldValues = (): Record<string, unknown> =>
      (auditService.log as jest.Mock).mock.calls[0][0].oldValues as Record<string, unknown>;
    const loggedNewValues = (): Record<string, unknown> =>
      (auditService.log as jest.Mock).mock.calls[0][0].newValues as Record<string, unknown>;

    it('入れ子の object でも機密を示す鍵名の値が伏せ字になること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/products',
        { id: 'user-1' },
        { id: 'prod-1' },
        {
          name: 'Widget',
          integration: { apiKey: 'sk-live-1', endpoint: 'https://example.test' },
        },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({
          name: 'Widget',
          integration: { apiKey: '[REDACTED]', endpoint: 'https://example.test' },
        });
        done();
      });
    });

    it('入れ子の array の要素でも伏せ字になること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/products',
        { id: 'user-1' },
        { id: 'prod-1' },
        {
          rows: [
            { token: 't-1', name: 'row-1' },
            { token: 't-2', name: 'row-2' },
          ],
        },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({
          rows: [
            { token: '[REDACTED]', name: 'row-1' },
            { token: '[REDACTED]', name: 'row-2' },
          ],
        });
        done();
      });
    });

    it('object > array > object の深い入れ子でも伏せ字になること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/products',
        { id: 'user-1' },
        { id: 'prod-1' },
        { payload: { items: [{ meta: { clientSecret: 'cs-1', label: 'keep' } }] } },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({
          payload: { items: [{ meta: { clientSecret: '[REDACTED]', label: 'keep' } }] },
        });
        done();
      });
    });

    it('authorization / cookie / apiKey / clientSecret が伏せ字になること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/users',
        { id: 'user-1' },
        { id: 'user-2' },
        {
          authorization: 'Bearer abc',
          cookie: 'sp_access_token=abc',
          apiKey: 'sk-1',
          clientSecret: 'cs-1',
          api_key: 'sk-2',
          'client-secret': 'cs-2',
          name: 'keep-this',
        },
      );
      const handler = createMockHandler({ success: true, data: { id: 'user-2' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({
          authorization: '[REDACTED]',
          cookie: '[REDACTED]',
          apiKey: '[REDACTED]',
          clientSecret: '[REDACTED]',
          api_key: '[REDACTED]',
          'client-secret': '[REDACTED]',
          name: 'keep-this',
        });
        done();
      });
    });

    it('設定の一括更新の要求で、機密を示す設定キーの値だけが伏せ字になること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/system-settings',
        { id: 'user-1' },
        {},
        {
          updates: [
            { key: 'integration.service.token', value: 'shared-token' },
            { key: 'system.smtp.password', value: 'p@ssw0rd' },
            { key: 'system.ui.theme', value: 'default' },
          ],
        },
      );
      const handler = createMockHandler({ success: true, data: [] });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({
          updates: [
            { key: 'integration.service.token', value: '[REDACTED]' },
            { key: 'system.smtp.password', value: '[REDACTED]' },
            { key: 'system.ui.theme', value: 'default' },
          ],
        });
        done();
      });
    });

    it('設定の一括更新の応答でも機密値だけが伏せ字になり、添字キーの object の形が保たれること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/system-settings',
        { id: 'user-1' },
        {},
        { updates: [{ key: 'system.ui.theme', value: 'default' }] },
      );
      const handler = createMockHandler({
        success: true,
        data: [
          { id: '1', key: 'system.smtp.password', value: 'p@ssw0rd', label: 'SMTP パスワード' },
          { id: '2', key: 'system.ui.theme', value: 'default', label: 'UI テーマ' },
        ],
      });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedNewValues()).toEqual({
          '0': {
            id: '1',
            key: 'system.smtp.password',
            value: '[REDACTED]',
            label: 'SMTP パスワード',
          },
          '1': { id: '2', key: 'system.ui.theme', value: 'default', label: 'UI テーマ' },
        });
        done();
      });
    });

    it('入れ子の機密でない値は消えないこと', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/products',
        { id: 'user-1' },
        { id: 'prod-1' },
        {
          codes: ['a', 'b'],
          nested: { password: 'x', note: 'keep' },
          count: 3,
        },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({
          codes: ['a', 'b'],
          nested: { password: '[REDACTED]', note: 'keep' },
          count: 3,
        });
        done();
      });
    });

    it('Date などの非 plain object の値は形を変えずに残ること', (done) => {
      const createdAt = new Date('2026-10-01T00:00:00.000Z');
      const context = createMockContext(
        'POST',
        '/api/v1/products',
        { id: 'user-1' },
        {},
        { name: 'Widget' },
      );
      const handler = createMockHandler({
        success: true,
        data: { id: 'prod-1', createdAt, passwordHash: 'hash' },
      });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedNewValues()).toEqual({
          id: 'prod-1',
          createdAt,
          passwordHash: '[REDACTED]',
        });
        expect(loggedNewValues().createdAt).toBeInstanceOf(Date);
        done();
      });
    });
  });

  describe('sanitizeBody（鍵名のゆれ・経路の鍵名・深い入れ子）', () => {
    const loggedOldValues = (): Record<string, unknown> =>
      (auditService.log as jest.Mock).mock.calls[0][0].oldValues as Record<string, unknown>;
    const loggedNewValues = (): Record<string, unknown> =>
      (auditService.log as jest.Mock).mock.calls[0][0].newValues as Record<string, unknown>;

    /** `{ child: { child: ... { secret } } }` を depth 段作る */
    const buildDeep = (depth: number): unknown => {
      let value: unknown = { secret: 'leaf', name: 'deep' };
      for (let i = 0; i < depth; i += 1) {
        value = { child: value };
      }
      return value;
    };

    it('区切り・連結のゆれ（api_key / api-key / accessToken / smtpPassword / privateKey）でも伏せ字になること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/products',
        { id: 'user-1' },
        { id: 'prod-1' },
        {
          nested: {
            api_key: 'k1',
            'api-key': 'k2',
            accessToken: 't1',
            smtpPassword: 'p1',
            privateKey: 'pk1',
            name: 'keep',
          },
        },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({
          nested: {
            api_key: '[REDACTED]',
            'api-key': '[REDACTED]',
            accessToken: '[REDACTED]',
            smtpPassword: '[REDACTED]',
            privateKey: '[REDACTED]',
            name: 'keep',
          },
        });
        done();
      });
    });

    it('直下の鍵名も大文字・区切りのゆれ（API-KEY / system_PASSWORD）を伏せ字にすること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/products',
        { id: 'user-1' },
        { id: 'prod-1' },
        { 'API-KEY': 'k1', system_PASSWORD: 'p1', note: 'keep' },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({
          'API-KEY': '[REDACTED]',
          system_PASSWORD: '[REDACTED]',
          note: 'keep',
        });
        done();
      });
    });

    it('値の名前（兄弟 key）のゆれでも設定値を伏せ字にし、機密でない設定値は残すこと', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/system-settings',
        { id: 'user-1' },
        {},
        {
          updates: [
            { key: 'integration.api_key', value: 'k1' },
            { key: 'system.smtpPassword', value: 'p1' },
            { key: 'security.jwtSecret', value: 's1' },
            { key: 'system.passwordPolicy.summary', value: 'policy text' },
            { key: 'system.ui.theme', value: 'dark' },
          ],
        },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({
          updates: [
            { key: 'integration.api_key', value: '[REDACTED]' },
            { key: 'system.smtpPassword', value: '[REDACTED]' },
            { key: 'security.jwtSecret', value: '[REDACTED]' },
            { key: 'system.passwordPolicy.summary', value: '[REDACTED]' },
            { key: 'system.ui.theme', value: 'dark' },
          ],
        });
        done();
      });
    });

    it('経路（パス）にだけ機密の鍵名がある更新でも、本文の値が伏せ字になること', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/system-settings/:key',
        { id: 'user-1' },
        { key: 'system.smtp.password' },
        { value: 'p@ssw0rd' },
      );
      const handler = createMockHandler({
        success: true,
        data: { key: 'system.smtp.password', value: 'p@ssw0rd' },
      });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({ value: '[REDACTED]' });
        expect(loggedNewValues()).toEqual({
          key: 'system.smtp.password',
          value: '[REDACTED]',
        });
        done();
      });
    });

    it('経路の鍵名が機密でなければ、本文の値は消えないこと', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/system-settings/:key',
        { id: 'user-1' },
        { key: 'system.ui.theme' },
        { value: 'dark' },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(loggedOldValues()).toEqual({ value: 'dark' });
        done();
      });
    });

    it('深い入れ子でも例外にならず、上限を超えた階層は辿らずに印を残すこと', (done) => {
      const context = createMockContext(
        'PUT',
        '/api/v1/products',
        { id: 'user-1' },
        { id: 'prod-1' },
        { deep: buildDeep(20000) },
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(auditService.log).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(loggedOldValues())).toContain('[TRUNCATED]');
        done();
      });
    });

    it('循環参照のある値でも例外にならないこと', (done) => {
      const cyclic: Record<string, unknown> = { name: 'loop' };
      cyclic['self'] = cyclic;
      const context = createMockContext(
        'PUT',
        '/api/v1/products',
        { id: 'user-1' },
        { id: 'prod-1' },
        cyclic,
      );
      const handler = createMockHandler({ success: true, data: { id: 'prod-1' } });

      interceptor.intercept(context, handler).subscribe(() => {
        expect(auditService.log).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(loggedOldValues())).toContain('[TRUNCATED]');
        done();
      });
    });
  });

  describe('本文の無い DELETE（AllExceptionsFilter を通した実 HTTP 経路）', () => {
    // 500 はインターセプタの TypeError が filter で変換されて出ていた。interceptor の単体だけでなく
    // 実際の HTTP 経路（body-parser → インターセプタ → 例外 filter）で 200 になることを固定する。
    @Controller('object-types')
    class TestObjectTypesController {
      @Delete(':key/records/:id')
      deleteRecord(@Param('key') key: string, @Param('id') id: string) {
        return { success: true, data: { id: Number(id), key } };
      }
    }

    const httpAuditService = { log: jest.fn() } as unknown as AuditService;
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [TestObjectTypesController],
        providers: [
          { provide: AuditService, useValue: httpAuditService },
          { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
          { provide: APP_FILTER, useClass: AllExceptionsFilter },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.setGlobalPrefix('api/v1');
      // 認証済みセッションを再現する（インターセプタは request.user が無いと監査しない）
      app.use((req: { user?: { id: string } }, _res: unknown, next: () => void) => {
        req.user = { id: 'user-1' };
        next();
      });
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      (httpAuditService.log as jest.Mock).mockClear();
    });

    it('本文もContent-Typeも送らないDELETEが200を返し、監査ログが1件記録されること', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/v1/object-types/supplier-score/records/7')
        .expect(200);

      expect(response.body).toEqual({ success: true, data: { id: 7, key: 'supplier-score' } });
      expect(httpAuditService.log).toHaveBeenCalledTimes(1);
      expect(httpAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          entityType: 'Object-types',
          entityId: '7',
          action: 'DELETE',
          oldValues: {},
        }),
      );
    });

    it('深い入れ子の本文を付けても 200 を返し、監査記録が作られること', async () => {
      // 辿る階層に上限が無いと、インターセプタの RangeError が filter に変換されて
      // 「削除は実行されたが 500・監査記録なし」になっていた。
      const deepJson = `${'['.repeat(3000)}${']'.repeat(3000)}`;

      await request(app.getHttpServer())
        .delete('/api/v1/object-types/supplier-score/records/7')
        .set('Content-Type', 'application/json')
        .send(deepJson)
        .expect(200);

      expect(httpAuditService.log).toHaveBeenCalledTimes(1);
    });
  });
});
