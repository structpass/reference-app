import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let code = 'INTERNAL_ERROR';
    let details: Record<string, unknown> | undefined;
    let retryAfter: number | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        if (Array.isArray(resp.message)) {
          // class-validator 由来: 配列 message から details を組み立てる（既存挙動）
          details = { validationErrors: resp.message };
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
        } else if (
          resp.details &&
          typeof resp.details === 'object' &&
          !Array.isArray(resp.details)
        ) {
          // object payload に明示 details があれば透過する（後方互換な追加拡張）。
          // CSV 取込の行検証エラー等、呼び出し側が構造化 payload を投げるケース。
          details = resp.details as Record<string, unknown>;
        }
        // 呼び出し側が明示 code を載せていれば優先（既存の status 由来導出より前段で確定）
        if (typeof resp.code === 'string') {
          code = resp.code;
        }
        // ref-0084: 503（一時的な混雑）専用。status を条件に含めないと、将来 4xx の例外 body が
        // retryAfter を持った時に自動でヘッダへ載る退行罠になる（rete cmn-0235 と同ガード）。
        if (status === HttpStatus.SERVICE_UNAVAILABLE && typeof resp.retryAfter === 'number') {
          retryAfter = resp.retryAfter;
        }
      }

      if (status === HttpStatus.UNAUTHORIZED) code = 'UNAUTHORIZED';
      else if (status === HttpStatus.FORBIDDEN) code = 'FORBIDDEN';
      else if (status === HttpStatus.NOT_FOUND) code = 'NOT_FOUND';
      else if (status === HttpStatus.CONFLICT) code = 'CONFLICT';
      else if (status === HttpStatus.TOO_MANY_REQUESTS) code = 'TOO_MANY_REQUESTS';
      else if (status === HttpStatus.BAD_REQUEST && code !== 'VALIDATION_ERROR')
        code = 'BAD_REQUEST';
    } else {
      this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : '');
    }

    // ref-0084: 一時的な混雑（503）は再送で解けるため、再送目安を Retry-After で伝える（rete cmn-0235 相当）。
    if (retryAfter !== undefined) {
      response.setHeader('Retry-After', String(retryAfter));
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
    });
  }
}
