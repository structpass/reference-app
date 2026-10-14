import { Test, TestingModule } from '@nestjs/testing';
import { UsersRepository } from './users.repository';
import { PrismaService } from '../../../database/prisma.service';
import { FindUsersDto } from '../dto/find-users.dto';
import { makeUserEntity, makeUserWithGroupsEntity } from '@/__tests__/factories';

const mockUserSelect = makeUserEntity({
  id: 'u1',
  name: 'admin',
  email: 'admin@example.com',
  lastLoginAt: null,
});

const mockUserWithGroups = makeUserWithGroupsEntity({
  id: 'u1',
  name: 'admin',
  email: 'admin@example.com',
  lastLoginAt: null,
  userGroups: [
    {
      userId: 'u1',
      groupId: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      group: { id: 1, name: 'システム管理者', code: 'admin' },
    },
    {
      userId: 'u1',
      groupId: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      group: { id: 2, name: '営業', code: 'sales' },
    },
  ] as never,
});

const mockPrisma = {
  // v2-484: updateGuarded は $transaction で行ロックと書き込みを束ねる。
  $transaction: jest.fn(),
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('UsersRepository', () => {
  let repo: UsersRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<UsersRepository>(UsersRepository);
    jest.clearAllMocks();
  });

  describe('findByEmail', () => {
    it('email で findUnique', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await repo.findByEmail('a@b.com');
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
    });
  });

  describe('findByIdWithGroups', () => {
    it('select に passwordHash が含まれない', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserWithGroups);
      await repo.findByIdWithGroups('u1');
      const call = mockPrisma.user.findUnique.mock.calls[0][0];
      expect(call.select).not.toHaveProperty('passwordHash');
      expect(call.select).toHaveProperty('userGroups');
      expect(call.select.id).toBe(true);
    });
  });

  describe('findManyPaginated', () => {
    it('userGroups 込みの DTO shape を返し passwordHash は含まない', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUserWithGroups]);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await repo.findManyPaginated({ page: 1, limit: 20 } as FindUsersDto);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('passwordHash');
      expect(result.data[0].userGroups).toEqual([
        { group: { id: 1, name: 'システム管理者', code: 'admin' } },
        { group: { id: 2, name: '営業', code: 'sales' } },
      ]);
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('search は username / email / group.name の OR', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await repo.findManyPaginated({ search: 'admin', page: 1, limit: 20 } as FindUsersDto);

      const call = mockPrisma.user.findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { name: { contains: 'admin', mode: 'insensitive' } },
        { email: { contains: 'admin', mode: 'insensitive' } },
        { userGroups: { some: { group: { name: { contains: 'admin', mode: 'insensitive' } } } } },
      ]);
    });

    it('isActive=false でフィルタが適用される', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await repo.findManyPaginated({ isActive: false, page: 1, limit: 20 } as FindUsersDto);

      const call = mockPrisma.user.findMany.mock.calls[0][0];
      expect(call.where.isActive).toBe(false);
    });
  });

  describe('findManyForExport', () => {
    it('export では userGroups なしの USER_SELECT shape', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUserSelect]);

      const result = await repo.findManyForExport({} as FindUsersDto);

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('passwordHash');
      expect(result[0]).not.toHaveProperty('userGroups');
      expect(result[0].name).toBe('admin');
    });
  });

  describe('create / update', () => {
    it('create の select に passwordHash は含まない', async () => {
      mockPrisma.user.create.mockResolvedValue(mockUserSelect);
      await repo.create({
        name: 'a',
        email: 'a@b.com',
        passwordHash: 'h',
        role: 'admin',
      } as any);
      const call = mockPrisma.user.create.mock.calls[0][0];
      expect(call.select).not.toHaveProperty('passwordHash');
    });
  });

  // v2-484: 保護状態を行ロックの下で読み直す `updateGuarded`。
  // 実際の競合（読み取り後に許可が commit される窓）は `test/users-allow-link-race.int-spec.ts`
  // が実 PostgreSQL で測る。ここは分岐の写像（missing / stateChanged / updated）を固定する。
  describe('updateGuarded (v2-484)', () => {
    const mockTx = {
      $queryRaw: jest.fn(),
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockTx));
      mockTx.$queryRaw.mockReset();
      mockTx.user.findFirst.mockReset();
      mockTx.user.update.mockReset();
    });

    it('ロックが0行なら missing を返し、書き込みを投げない', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      const result = await repo.updateGuarded('u1', { name: 'x' }, { allowOidcLink: false });

      expect(result).toEqual({ outcome: 'missing' });
      expect(mockTx.user.update).not.toHaveBeenCalled();
    });

    it('期待状態に一致しなければ stateChanged を返し、書き込みを投げない', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: 'u1' }]);
      mockTx.user.findFirst.mockResolvedValue(null);

      const result = await repo.updateGuarded('u1', { name: 'x' }, { allowOidcLink: false });

      expect(result).toEqual({ outcome: 'stateChanged' });
      expect(mockTx.user.update).not.toHaveBeenCalled();
    });

    it('一致すれば同じトランザクションで update し、updated を返す', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: 'u1' }]);
      mockTx.user.findFirst.mockResolvedValue({ id: 'u1' });
      mockTx.user.update.mockResolvedValue(mockUserSelect);

      const result = await repo.updateGuarded('u1', { name: 'x' }, { allowOidcLink: false });

      expect(result.outcome).toBe('updated');
      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { name: 'x' } }),
      );
      // 親クライアントの update ではなく、ロックと同じトランザクションで書く。
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('期待状態は id と AND で束ねて照合する（保護条件の取り違えを防ぐ）', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: 'u1' }]);
      mockTx.user.findFirst.mockResolvedValue({ id: 'u1' });
      mockTx.user.update.mockResolvedValue(mockUserSelect);

      await repo.updateGuarded(
        'u1',
        { email: 'new@example.com' },
        { role: null, email: 'victim@example.com', oidcSub: null, allowOidcLink: true },
      );

      const where = mockTx.user.findFirst.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        { id: 'u1' },
        { role: null, email: 'victim@example.com', oidcSub: null, allowOidcLink: true },
      ]);
    });

    it('空 data でも一致すれば行を返す（不在と誤認しない）', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: 'u1' }]);
      mockTx.user.findFirst.mockResolvedValue({ id: 'u1' });
      mockTx.user.update.mockResolvedValue(mockUserSelect);

      const result = await repo.updateGuarded('u1', {}, { allowOidcLink: false });

      expect(result.outcome).toBe('updated');
      expect(mockTx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: {} }));
    });
  });
});
