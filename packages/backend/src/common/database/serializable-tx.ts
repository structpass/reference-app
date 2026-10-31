import { Logger } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';

export const SERIALIZABLE_MAX_ATTEMPTS = 3;

const logger = new Logger('runInSerializableTransaction');

/**
 * Serializable transaction を実行し、正常な競合 abort (P2034) だけを少数回再試行する。
 * callback は試行ごとに先頭から実行されるため、read/validate/write を同じ fresh snapshot で扱える。
 */
export async function runInSerializableTransaction<T>(
  prisma: Pick<PrismaClient, '$transaction'>,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = SERIALIZABLE_MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034' &&
        attempt < maxAttempts
      ) {
        logger.warn(
          `Serializable transaction conflict (P2034); retrying ${attempt + 1}/${maxAttempts}`,
        );
        continue;
      }
      throw error;
    }
  }
}
