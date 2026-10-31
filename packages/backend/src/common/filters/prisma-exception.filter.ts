import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './http-exception.filter';

/** 503 応答へ載せる再送目安（秒）。混雑の解消待ちなので短く、クライアントが即座に再突入しない程度。 */
const RETRY_AFTER_SECONDS = 5;

/**
 * Prisma のクエリエラーを HttpException に変換し、AllExceptionsFilter に委譲して
 * 統一レスポンス形状を保つ。サービス層の try/catch 重複を排除するための共通 filter。
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly delegate = new AllExceptionsFilter();
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped = this.toHttpException(exception);
    return this.delegate.catch(mapped ?? exception, host);
  }

  private toHttpException(e: Prisma.PrismaClientKnownRequestError): HttpException | null {
    switch (e.code) {
      case 'P2002': {
        const target = Array.isArray(e.meta?.target)
          ? (e.meta?.target as string[]).join(', ')
          : typeof e.meta?.target === 'string'
            ? (e.meta.target as string)
            : '';
        return new ConflictException(
          target ? `一意制約違反: ${target} は既に存在します` : '一意制約違反により保存できません',
        );
      }
      case 'P2003':
        return new ConflictException('関連データが存在するため削除できません');
      case 'P2025':
        return new NotFoundException('対象のレコードが見つかりません');
      case 'P2024':
      case 'P2028':
      case 'P2034':
        // 写像後は ServiceUnavailableException になり元の code / meta が消えるため、ここで残す。
        // 打ち手が分かれる3種を運用ログで区別できるようにする（ref-0084・rete からの移植）:
        //   P2034 = Serializable の再試行上限後も解けない write conflict
        //   P2024 = 接続プール待ちの超過（プール上限 / 同時実行の問題）
        //   P2028 = interactive tx の timeout 超過または maxWait（接続取得待ち）超過＝遅い tx か
        //           プール枯渇のどちらか。プール枯渇かは P2024 の併発で切り分ける（ref-0071）
        this.logger.warn(`Transient DB failure (${e.code}) -> 503`);
        // P2028 = interactive transaction の timeout 超過 / P2024 = 接続プール待ちの超過 / P2034 =
        // bounded retry 後も解けない競合。いずれも
        // 「遅い・混んでいる」という一時的な状態で、恒久障害ではなく再送で解けるため 503 + Retry-After。
        return new ServiceUnavailableException({
          code: 'SERVICE_UNAVAILABLE',
          message: '現在混み合っています。しばらくしてからもう一度お試しください',
          retryAfter: RETRY_AFTER_SECONDS,
        });
      default:
        return null;
    }
  }
}
