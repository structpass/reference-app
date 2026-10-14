import { Injectable, Logger, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditAction } from '@prisma/client';
import { AuditService } from './audit.service';
import { SKIP_AUDIT_KEY } from '../../common/decorators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private static readonly SENSITIVE_KEYS = new Set([
    'password',
    'currentpassword',
    'newpassword',
    'passwordhash',
    'token',
    'secret',
    'authorization',
    'cookie',
    'apikey',
    'clientsecret',
    'privatekey',
  ]);

  private static readonly REDACTED = '[REDACTED]';

  /** 入れ子を辿る上限を超えた値（辿らずに伏せる） */
  private static readonly TRUNCATED = '[TRUNCATED]';

  /** 監査へ載せる値を辿る階層の上限。深い入れ子や循環参照で監査が業務を壊さないための歯止め */
  private static readonly MAX_DEPTH = 32;

  /** `api_key` / `apiKey` / `API-KEY` のような表記ゆれを同じ鍵名へ寄せる */
  private static normalizeKeyName(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * 名前に含まれる語（区切りと camelCase の境目で分ける）。
   * `api_key` のように語そのものが区切りを含む場合は、区切りを残した `apikey` も候補に残す。
   */
  private static nameTokens(name: string): string[] {
    const tokens = new Set<string>();
    for (const part of name.split(/[^A-Za-z0-9_-]+/)) {
      if (!part) continue;
      tokens.add(AuditInterceptor.normalizeKeyName(part));
      const words = part.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/);
      for (const word of words) {
        if (word) tokens.add(AuditInterceptor.normalizeKeyName(word));
      }
    }
    return [...tokens];
  }

  /**
   * 名前が機密を示すか。鍵名（`clientSecret` / `api_key` / `API-KEY`）と、
   * `system.smtp.password` のような値を指す名前の両方に使う。
   */
  private static isSensitiveKeyName(name: string): boolean {
    return AuditInterceptor.nameTokens(name).some((token) =>
      AuditInterceptor.SENSITIVE_KEYS.has(token),
    );
  }

  /** 経路のパラメータ（例: `/system-settings/:key` の `key`）から、本文の値を指す機密名を拾う */
  private static contextKeyName(params: unknown): string | undefined {
    if (!params || typeof params !== 'object') {
      return undefined;
    }
    return Object.values(params as Record<string, unknown>).find(
      (value): value is string =>
        typeof value === 'string' && AuditInterceptor.isSensitiveKeyName(value),
    );
  }

  /** object リテラルだけを辿る（Date / Buffer / クラスインスタンスの形を変えない） */
  private static isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    return prototype === Object.prototype || prototype === null;
  }

  // 設定の一括更新と設定応答は `{ key, value }` の組で来る。`value` という鍵名だけでは
  // 機密を判別できないため、兄弟の `key`（本文に無ければ経路のパラメータ）が機密を示す
  // 名前の時に値の側を伏せる（`updates[].value` が平文で残る経路を閉じる）。
  private static redactObject(
    record: Record<string, unknown>,
    depth: number,
    masksValueField: boolean,
  ): Record<string, unknown> {
    const keyField = record['key'];
    const masksValue =
      masksValueField ||
      (typeof keyField === 'string' && AuditInterceptor.isSensitiveKeyName(keyField));

    return Object.fromEntries(
      Object.entries(record).map(([key, entryValue]) => {
        if (AuditInterceptor.isSensitiveKeyName(key)) {
          return [key, AuditInterceptor.REDACTED];
        }
        if (masksValue && AuditInterceptor.normalizeKeyName(key) === 'value') {
          return [key, AuditInterceptor.REDACTED];
        }
        return [key, AuditInterceptor.redactValue(entryValue, depth)];
      }),
    );
  }

  private static redactValue(value: unknown, depth: number): unknown {
    if (depth > AuditInterceptor.MAX_DEPTH) {
      // 深すぎる値は辿らない。再帰でスタックを食い潰すと、監査が業務の応答を壊す。
      return typeof value === 'object' && value !== null ? AuditInterceptor.TRUNCATED : value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => AuditInterceptor.redactValue(item, depth + 1));
    }
    if (!AuditInterceptor.isPlainObject(value)) {
      return value;
    }
    return AuditInterceptor.redactObject(value, depth + 1, false);
  }

  private static sanitizeBody(
    body: Record<string, unknown> | null | undefined,
    contextKeyName?: string,
  ): Record<string, unknown> {
    // body-parser は Content-Type の無い（本文の無い）リクエストで req.body を undefined のままにする。
    // 監査へ載せる値が無いので空オブジェクトを返す（Object.entries(undefined) で 500 にしない）。
    if (!body) {
      return {};
    }

    // 単一キー更新（`PUT /api/v1/system-settings/:key`）は本文が `{ value }` だけで、
    // 機密の別が経路側の鍵名にしか無い。その名前を兄弟の鍵名として扱う。
    const masksValueField =
      typeof contextKeyName === 'string' && AuditInterceptor.isSensitiveKeyName(contextKeyName);

    // 配列の応答は従来どおり添字キーの object として記録する（記録の形を変えない）。
    if (Array.isArray(body)) {
      return Object.fromEntries(
        body.map((item, index) => [String(index), AuditInterceptor.redactValue(item, 1)]),
      );
    }

    return AuditInterceptor.redactObject(body, 1, masksValueField);
  }

  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skipAudit = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipAudit) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const user = request.user;

    // GET リクエストは監査対象外
    if (method === 'GET' || !user) {
      return next.handle();
    }

    const path = request.route?.path || request.url;
    const entityType = this.extractEntityType(path);

    return next.handle().pipe(
      tap((response) => {
        try {
          if (!entityType) return;

          const action = this.getAction(method);
          if (!action) return;

          const responseData = response as { success?: boolean; data?: { id?: string | number } };
          const entityId = String(request.params?.id || responseData?.data?.id || 'unknown');
          const contextKeyName = AuditInterceptor.contextKeyName(request.params);

          this.auditService.log({
            userId: user.id,
            entityType,
            entityId,
            action,
            oldValues:
              method === 'PUT' || method === 'DELETE'
                ? AuditInterceptor.sanitizeBody(request.body, contextKeyName)
                : undefined,
            newValues:
              method === 'POST' || method === 'PUT'
                ? AuditInterceptor.sanitizeBody(
                    (responseData?.data as Record<string, unknown>) ?? {},
                  )
                : undefined,
          });
        } catch (error) {
          // 監査記録の作成は業務を止めない（docs/architecture/operational-policy.md §3）
          this.logger.error(`Failed to create audit log: ${error}`);
        }
      }),
    );
  }

  private extractEntityType(path: string): string | null {
    const match = path.match(/\/api\/v1\/([^/?]+)/);
    if (match) {
      const entity = match[1];
      // 認証エンドポイントは除外
      if (entity === 'auth') return null;
      return entity.charAt(0).toUpperCase() + entity.slice(1);
    }
    return null;
  }

  private getAction(method: string): AuditAction | null {
    switch (method) {
      case 'POST':
        return AuditAction.CREATE;
      case 'PUT':
      case 'PATCH':
        return AuditAction.UPDATE;
      case 'DELETE':
        return AuditAction.DELETE;
      default:
        return null;
    }
  }
}
