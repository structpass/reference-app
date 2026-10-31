import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { PayloadTooLargeFilter } from './payload-too-large.filter';
/**
 * v2-535: 本文が上限を超えた送信（body-parser の PayloadTooLargeError）の応答を 413 に揃える。
 *
 * 実測: このエラーは HttpException ではなく、catch-all のフィルタには当たらず 500 になっていた。
 * ここでは、実物に近い形（name / status / statusCode / type）で 413 になること、それ以外の例外は
 * 握りつぶさず外へ出すことを固定する。
 */
describe('PayloadTooLargeFilter', () => {
  let filter: PayloadTooLargeFilter;
  let res: { status: jest.Mock; json: jest.Mock };
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new PayloadTooLargeFilter();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    host = {
      switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({}) }),
    } as unknown as ArgumentsHost;
  });

  /** raw-body が投げる形（HttpException ではない）。 */
  const rawBodyError = () =>
    Object.assign(new Error('request entity too large'), {
      name: 'PayloadTooLargeError',
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
      type: 'entity.too.large',
      body: '{"secret":"should-not-leak"}',
    });

  it('大きすぎる本文のエラーを 413 と専用 code にする', () => {
    filter.catch(rawBodyError(), host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: '送信されたデータが大きすぎます。内容を減らして送り直してください',
      },
    });
  });

  it('応答本文に送信内容の断片を載せない', () => {
    filter.catch(rawBodyError(), host);

    const payload = JSON.stringify(res.json.mock.calls[0][0]);
    expect(payload).not.toContain('should-not-leak');
  });

  it('型名が違っても type で見て同じ応答にする', () => {
    const viaType = Object.assign(new Error('too large'), { type: 'entity.too.large' });

    filter.catch(viaType, host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
  });

  it('大きさ以外の素の Error も、応答を書き切る（相手をタイムアウトさせない）', () => {
    // ここで何も書かずに return すると、NestJS は応答を返さず相手が待ち続ける（d860 で実測）。
    expect(() => filter.catch(new Error('boom'), host)).not.toThrow();

    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  it('管轄外を catch-all へ渡し、決めた形（JSON）で応答を書き切る', () => {
    // body-parser は 413 も不正 JSON の 400 も同じ http-errors の型で投げるため、型では分けられない。
    // このフィルタが管轄外を外へ投げ直すと Express の既定の応答（HTML）へ抜けるので、
    // 自身で catch-all のチェーンへ渡し、catch-all と同じ整形で返す（d860）。
    // HttpException でないものは catch-all が 500 に丸める（http-exception.filter の仕様）ので、
    // ここでは「管轄外でも JSON の決めた形で応答が返る」ことを固定する。
    const unauthorized = Object.assign(new Error('Unauthorized'), {
      status: HttpStatus.UNAUTHORIZED,
      statusCode: HttpStatus.UNAUTHORIZED,
    });

    filter.catch(unauthorized, host);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: expect.any(String) }),
      }),
    );
    expect(res.status).toHaveBeenCalled();
  });

  it('管轄外の HttpException 相当（401）は、AllExceptionsFilter と同じ整形で UNAUTHORIZED を返す', () => {
    // 実 HTTP の 401・404 は Nest が HttpException にしてから投げるので、ここへは来ない
    // （http-exception.filter が先に受ける）。渡された場合は catch-all の整形に従うことを示す。
    const { HttpException } = jest.requireActual(
      '@nestjs/common',
    ) as typeof import('@nestjs/common');
    const unauthorized = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

    filter.catch(unauthorized, host);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'UNAUTHORIZED' }),
      }),
    );
  });

  it('管轄外に渡す後段は、app.module.ts の登録（catch-all → Prisma）と同じ順で並んでいる', () => {
    // このフィルタは自分の後段をコードで組み直す。app.module.ts の APP_FILTER を足したり
    // 並べ替えたりして、ここを直し忘れると静かに食い違う。登録の並びを直接読んで確かめる。
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../app.module.ts'),
      'utf8',
    ) as string;
    const order = [...source.matchAll(/APP_FILTER,\s*useClass:\s*(\w+)/g)].map((m) => m[1]);

    expect(order).toEqual([
      'AllExceptionsFilter',
      'PrismaExceptionFilter',
      'PayloadTooLargeFilter',
    ]);
  });
});
