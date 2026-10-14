import { AllExceptionsFilter } from './http-exception.filter';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  });

  it('HttpExceptionを正しく処理すること', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Not Found',
      },
    });
  });

  it('バリデーションエラーを正しく処理すること', () => {
    const exception = new HttpException(
      { message: ['name must be a string'], statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { validationErrors: ['name must be a string'] },
      },
    });
  });

  it('401エラーのコードがUNAUTHORIZEDであること', () => {
    const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
      },
    });
  });

  it('403エラーのコードがFORBIDDENであること', () => {
    const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Forbidden',
      },
    });
  });

  it('409エラーのコードがCONFLICTであること', () => {
    const exception = new HttpException('Conflict', HttpStatus.CONFLICT);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(409);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'Conflict',
      },
    });
  });

  it('429エラーのコードがTOO_MANY_REQUESTSであること', () => {
    const exception = new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(429);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too Many Requests',
      },
    });
  });

  it('ThrottlerException（実インスタンス）も 429 / TOO_MANY_REQUESTS に正規化すること', () => {
    // HttpException 経由の単純 429 だけでなく、@nestjs/throttler が実際に投げる
    // ThrottlerException（getResponse() の shape が version 依存）でも code が崩れないことを固定する。
    const exception = new ThrottlerException();
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(429);
    const payload = mockResponse.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('予期しないエラーを500で処理すること', () => {
    const exception = new Error('Unexpected error');
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  it('object payload の明示 code/message/details を透過すること（CSV取込検証エラー）', () => {
    const exception = new HttpException(
      {
        code: 'VALIDATION_ERROR',
        message: 'CSV取込の検証に失敗しました',
        details: {
          rows: [{ row: 3, column: '価格', message: '数値として解釈できません' }],
        },
        statusCode: 400,
      },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'CSV取込の検証に失敗しました',
        details: {
          rows: [{ row: 3, column: '価格', message: '数値として解釈できません' }],
        },
      },
    });
  });

  it('object payload に details があっても code が無ければ HTTP status から導出すること', () => {
    const exception = new HttpException(
      { message: '不正なリクエスト', details: { foo: 'bar' } },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);

    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: '不正なリクエスト',
        details: { foo: 'bar' },
      },
    });
  });

  it('文字列以外のレスポンスでmessageプロパティがない場合', () => {
    const exception = new HttpException({ statusCode: 400 }, HttpStatus.BAD_REQUEST);
    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'An unexpected error occurred',
      },
    });
  });

  it('503 例外 body の retryAfter を Retry-After ヘッダへ写像すること（ref-0084）', () => {
    const exception = new HttpException(
      {
        code: 'SERVICE_UNAVAILABLE',
        message: '現在混み合っています。しばらくしてからもう一度お試しください',
        retryAfter: 5,
        statusCode: 503,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    filter.catch(exception, mockHost);

    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(mockResponse.status).toHaveBeenCalledWith(503);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: '現在混み合っています。しばらくしてからもう一度お試しください',
      },
    });
  });

  it('503 以外（4xx 等）の例外 body に retryAfter があってもヘッダ化しないこと（ref-0084・rete cmn-0235 のガード）', () => {
    const exception = new HttpException(
      { message: 'Bad Request', retryAfter: 3, statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);

    expect(mockResponse.setHeader).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(400);
  });
});
