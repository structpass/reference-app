import { Prisma } from '@prisma/client';
import { runInSerializableTransaction, SERIALIZABLE_MAX_ATTEMPTS } from './serializable-tx';

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(code, {
    code,
    clientVersion: '6.2.0',
  });
}

describe('runInSerializableTransaction', () => {
  it('Serializable で callback を実行する', async () => {
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: object) => Promise<string>, options: object) => {
        expect(options).toEqual({
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        return fn({ attempt: 1 });
      }),
    };

    await expect(runInSerializableTransaction(prisma as never, async () => 'ok')).resolves.toBe(
      'ok',
    );
  });

  it('P2034 は callback を先頭から再実行し、途中で成功すれば返す', async () => {
    const reads: number[] = [];
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (fn: (tx: { attempt: number }) => Promise<string>) => {
          await fn({ attempt: 1 });
          throw prismaError('P2034');
        })
        .mockImplementationOnce(async (fn: (tx: { attempt: number }) => Promise<string>) =>
          fn({ attempt: 2 }),
        ),
    };

    const result = await runInSerializableTransaction(prisma as never, async (tx) => {
      reads.push((tx as unknown as { attempt: number }).attempt);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(reads).toEqual([1, 2]);
  });

  it('P2034 が最大試行数まで続けば最後の例外を投げる', async () => {
    const last = prismaError('P2034');
    const prisma = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(prismaError('P2034'))
        .mockRejectedValueOnce(prismaError('P2034'))
        .mockRejectedValueOnce(last),
    };

    await expect(runInSerializableTransaction(prisma as never, async () => 'ok')).rejects.toBe(
      last,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(SERIALIZABLE_MAX_ATTEMPTS);
  });

  it('P2034 以外は再試行しない', async () => {
    const error = prismaError('P2028');
    const prisma = { $transaction: jest.fn().mockRejectedValue(error) };

    await expect(runInSerializableTransaction(prisma as never, async () => 'ok')).rejects.toBe(
      error,
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
