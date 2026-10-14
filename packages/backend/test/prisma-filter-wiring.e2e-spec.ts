import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { CategoriesRepository } from '../src/modules/categories/repositories/categories.repository';
import { PrismaExceptionFilter } from '../src/common/filters';
import { createE2EApp, issueToken, authCookie } from './helpers/auth.helper';

// Import the real AppModule through createE2EApp: registering filters again here would
// miss the production wiring regression. Only the pre-read is stubbed to reproduce
// a row disappearing before update; the P2025 comes from the real PostgreSQL query.
describe('AppModule Prisma filter selection (Cookie HTTP)', () => {
  let app: INestApplication;
  let repo: CategoriesRepository;
  let category: Category;
  let cookie: string;
  let filter: jest.SpyInstance;
  const missingId = -2147483647;

  beforeAll(async () => {
    // Nest binds catch during app.init(), so observe it before creating the app.
    filter = jest.spyOn(PrismaExceptionFilter.prototype, 'catch');
    app = await createE2EApp();
    repo = app.get(CategoriesRepository);
    const prisma = app.get(PrismaService);
    category = (await prisma.category.findFirstOrThrow()) as Category;
    expect(await prisma.category.findUnique({ where: { id: missingId } })).toBeNull();
    cookie = authCookie(await issueToken(app, 'admin'));
  });

  beforeEach(() => filter.mockClear());
  afterEach(() => {
    jest.spyOn(repo, 'findById').mockRestore();
    jest.spyOn(repo, 'update').mockRestore();
  });
  afterAll(async () => {
    if (app) await app.close();
    jest.restoreAllMocks();
  });

  const update = () =>
    request(app.getHttpServer())
      .put(`/api/v1/categories/${missingId}`)
      .set('Cookie', cookie)
      .send({ name: 'v2-447 missing row probe' });

  const presentAtPreRead = () =>
    jest.spyOn(repo, 'findById').mockResolvedValueOnce({ ...category, id: missingId });

  it('real Prisma P2025 selects PrismaExceptionFilter and returns 404 NOT_FOUND', async () => {
    presentAtPreRead();
    const response = await update();
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: '対象のレコードが見つかりません' },
    });
    expect(filter).toHaveBeenCalledTimes(1);
    const error = filter.mock.calls[0][0];
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(error.code).toBe('P2025');
  });

  it.each([
    ['P2002', 409, 'CONFLICT'],
    ['P2003', 409, 'CONFLICT'],
    ['P2024', 503, 'SERVICE_UNAVAILABLE'],
    ['P2028', 503, 'SERVICE_UNAVAILABLE'],
    ['P2034', 503, 'SERVICE_UNAVAILABLE'],
    ['P2999', 500, 'INTERNAL_ERROR'],
  ])('%s retains HTTP %s %s through the registered filter', async (code, status, errorCode) => {
    presentAtPreRead();
    jest.spyOn(repo, 'update').mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('HTTP filter regression probe', {
        code,
        clientVersion: 'test',
        meta: { target: ['code'] },
      }),
    );
    const response = await update();
    expect(response.status).toBe(status);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(errorCode);
    expect(filter).toHaveBeenCalledTimes(1);
    expect(response.headers['retry-after']).toBe(status === 503 ? '5' : undefined);
  });

  it('explicit service 404 keeps its message and bypasses the Prisma filter', async () => {
    const response = await update();
    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({ code: 'NOT_FOUND', message: 'Category not found' });
    expect(filter).not.toHaveBeenCalled();
  });

  it('explicit service 409 keeps its message and bypasses the Prisma filter', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/categories')
      .set('Cookie', cookie)
      .send({ code: category.code, name: 'duplicate probe' });
    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: 'CONFLICT',
      message: `Category with code ${category.code} already exists`,
    });
    expect(filter).not.toHaveBeenCalled();
  });
});
