import { PrismaExceptionFilter } from './prisma-exception.filter';
import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('PrismaExceptionFilter', () => {
  let filter: PrismaExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new PrismaExceptionFilter();
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

  it('P2002（一意制約違反, target あり）を409 CONFLICT に変換すること', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: { target: ['code'] },
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'CONFLICT',
        message: '一意制約違反: code は既に存在します',
      },
    });
  });

  it('P2002（target なし）を汎用メッセージで409 CONFLICT に変換すること', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'CONFLICT',
        message: '一意制約違反により保存できません',
      },
    });
  });

  it('P2003（外部キー制約違反）を409 CONFLICT に変換すること', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
      code: 'P2003',
      clientVersion: '5.0.0',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'CONFLICT',
        message: '関連データが存在するため削除できません',
      },
    });
  });

  it('P2025（レコード未検出）を404 NOT_FOUND に変換すること', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '5.0.0',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: '対象のレコードが見つかりません',
      },
    });
  });

  it('未対応の Prisma コードは AllExceptionsFilter の汎用処理に委譲されること', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Unknown Prisma error', {
      code: 'P2016',
      clientVersion: '5.0.0',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  it('P2024（接続プール待ち超過）を503 SERVICE_UNAVAILABLE + Retry-After に変換すること（ref-0084）', () => {
    const exception = new Prisma.PrismaClientKnownRequestError(
      'Timed out fetching a new connection',
      {
        code: 'P2024',
        clientVersion: '5.0.0',
      },
    );

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: '現在混み合っています。しばらくしてからもう一度お試しください',
      },
    });
  });

  it('P2028（interactive transaction の timeout 超過）を503 SERVICE_UNAVAILABLE + Retry-After に変換すること（ref-0084）', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Transaction was already closed', {
      code: 'P2028',
      clientVersion: '5.0.0',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: '現在混み合っています。しばらくしてからもう一度お試しください',
      },
    });
  });

  it('P2034（Serializable retry上限）を503 SERVICE_UNAVAILABLE + Retry-After に変換する', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('Write conflict', {
      code: 'P2034',
      clientVersion: '6.2.0',
    });

    filter.catch(exception, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '5');
    expect(mockResponse.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: '現在混み合っています。しばらくしてからもう一度お試しください',
      },
    });
  });

  it('P2024 / P2028 は運用ログでコード別に区別されること（基準4・ref-0084）', () => {
    // NestJS Logger は spy 化して、写像前に元の code が warn ログへ残ることを固定する。
    const warnSpy = jest.spyOn(filter['logger'], 'warn').mockImplementation(() => {});

    const p2024 = new Prisma.PrismaClientKnownRequestError('Timed out fetching a new connection', {
      code: 'P2024',
      clientVersion: '5.0.0',
    });
    filter.catch(p2024, mockHost);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('P2024'));

    warnSpy.mockClear();
    const p2028 = new Prisma.PrismaClientKnownRequestError('Transaction was already closed', {
      code: 'P2028',
      clientVersion: '5.0.0',
    });
    filter.catch(p2028, mockHost);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('P2028'));

    warnSpy.mockRestore();
  });
});
