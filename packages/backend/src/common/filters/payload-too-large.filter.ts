import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AllExceptionsFilter } from './http-exception.filter';
import { PrismaExceptionFilter } from './prisma-exception.filter';

/**
 * JSON の本文が上限を超えた時に 413 を返す（v2-535）。
 *
 * なぜフィルタで受けるか（実測）。body-parser 2.4.0 の大きさ超過は PayloadTooLargeError
 * （status 413 / statusCode 413 / type entity.too.large）で、HttpException ではない。
 * NestJS の例外処理は「どのフィルタにも当たらなければ既定の応答処理」へ渡すため、登録済みの
 * catch-all はこれを捕まえず、AllExceptionsFilter を通って 500（INTERNAL_ERROR）になる
 * （実測: 150kb の本文を送ると 500。ログに PayloadTooLargeError: request entity too large）。
 * つまり今までは、大きすぎる本文が「サーバーの異常」として返っていた。
 *
 * このフィルタがその型だけを捕まえ、413 と専用の code（PAYLOAD_TOO_LARGE）で返す。
 * 応答本文には送信内容の一部や秘密を載せず、理由だけを一定の文言で返す。
 *
 * 登録順: NestJS はフィルタを登録の逆順で選ぶため、app.module.ts の配列で catch-all より
 * 後ろに置く（先に置くと catch-all が先に当たる）。上限（本文サイズ）自体は既定のまま。
 *
 * 管轄外の例外（d860 で直した）。以前は管轄外を外へ投げ直していた。投げ直した例外は NestJS の
 * 応答処理へ戻らず呼び出し元（Express）まで抜けるため、後段の catch-all が整形する決めた形の
 * 応答にならず、どのフィルタも応答を書かない経路が生まれる。管轄外は catch-all と Prisma の
 * フィルタへ自身で渡し、決めた JSON の形で返す。どのフィルタも応答を書かなかった時は、自分で
 * 500 を書く（応答を書かずに return すると相手がタイムアウトまで待たされる）。この安全網に
 * 落ちる例外が実際にあるかは、E2E 全体（275 件）を通して 0 件と実測した。
 */
interface PayloadTooLargeErrorLike {
  type?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
}

/**
 * 本文の大きさ超過を表すエラーか。
 *
 * - HttpException は大きさ超過として扱わない。後段の AllExceptionsFilter（責務は HttpException の
 *   整形）が status を見て 413 の code を返すため、ここで受けると二重の持ち主になる。
 * - 形を持たない例外（素の Error）は、status が無いので当たらない（全例外を飲み込まない）。
 */
function isPayloadTooLarge(exception: unknown): boolean {
  if (!exception || typeof exception !== 'object') return false;
  if (exception instanceof HttpException) return false;

  const error = exception as PayloadTooLargeErrorLike;
  return (
    error.name === 'PayloadTooLargeError' ||
    error.type === 'entity.too.large' ||
    error.status === HttpStatus.PAYLOAD_TOO_LARGE ||
    error.statusCode === HttpStatus.PAYLOAD_TOO_LARGE
  );
}

@Catch()
export class PayloadTooLargeFilter implements ExceptionFilter {
  private readonly logger = new Logger(PayloadTooLargeFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (!isPayloadTooLarge(exception)) {
      // このフィルタの意味を保ちつつ、他の例外は後段へ渡す。
      // 外へ投げ直すと、投げ直した例外は NestJS の応答処理へ戻らず呼び出し元（Express）まで
      // 抜けるため、後段のフィルタが整形せず決めた形の応答にならない。そこで自身の管轄分だけを
      // 省いた後段のフィルタ（Prisma の写像 → catch-all）へ、登録順のまま渡す。
      //
      // どのフィルタも応答を書かなかった時は、自分で 500 を書く。応答を書かずに return すると
      // 相手がタイムアウトまで待たされる。E2E 全体（275 件）を通して、ここへ落ちる例外は
      // 0 件と実測した（＝今は通らない安全網）。
      const response = host.switchToHttp().getResponse<Response>();
      const downstream: ExceptionFilter[] = [
        new AllExceptionsFilter(),
        new PrismaExceptionFilter(),
      ];

      for (let i = downstream.length - 1; i >= 0; i -= 1) {
        try {
          downstream[i].catch(exception, host);
          return;
        } catch {
          // 次のフィルタへ。
        }
      }

      this.logger.error(
        'Unhandled exception (no filter took it)',
        exception instanceof Error ? exception.stack : String(exception),
      );
      if (!response.headersSent) {
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        });
      }
      return;
    }

    const response = host.switchToHttp().getResponse<Response>();
    this.logger.warn('Request body exceeded the parser limit; responding with 413');

    response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: '送信されたデータが大きすぎます。内容を減らして送り直してください',
      },
    });
  }
}
