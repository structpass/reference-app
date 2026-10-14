import { Test, TestingModule } from '@nestjs/testing';
import { AnnouncementsRepository } from './announcements.repository';
import { PrismaService } from '../../../database/prisma.service';

// PrismaService を mock し、条件組み立て（認可スコープ）と通知先グループの
// 作成/差し替えが「渡す引数の形」で仕様どおりであることを検証する（ref-0064）。
// 既存流儀（stocks.repository.spec.ts）に合わせ Prisma 呼び出しは jest.fn()。
const mockPrisma = {
  announcement: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  announcementRole: {
    deleteMany: jest.fn(),
  },
  announcementAttachment: {
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  userGroup: {
    findMany: jest.fn(),
  },
  group: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// interactive transaction の mock: 渡されたコールバックを mockTx で即時実行する。
// tx 内の Prisma 呼び出しが mockPrisma と別オブジェクトで見えるよう分離する。
const mockTx = {
  announcement: {
    update: jest.fn(),
  },
  announcementRole: {
    deleteMany: jest.fn(),
  },
};

const now = new Date('2026-08-02T00:00:00+09:00');
const baseData = {
  title: 'お知らせ',
  bodyMarkdown: '本文',
  isNew: false,
  isImportant: false,
  notifiedAt: now,
  sortOrder: 1,
  createdById: 'user-1',
};

describe('AnnouncementsRepository', () => {
  let repo: AnnouncementsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnnouncementsRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repo = module.get<AnnouncementsRepository>(AnnouncementsRepository);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => unknown) =>
      cb(mockTx),
    );
  });

  describe('findManyVisibleToGroups (認可スコープ)', () => {
    it('グループ無しの利用者は全体公開（roles 無し）のみ可視の条件で引くこと', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([]);

      await repo.findManyVisibleToGroups([]);

      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith({
        where: { roles: { none: {} } },
        select: expect.any(Object),
        orderBy: expect.any(Array),
      });
    });

    it('グループ持ちは全体公開＋自グループ宛ての OR 条件で引くこと', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([]);

      await repo.findManyVisibleToGroups([1, 2]);

      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ roles: { none: {} } }, { roles: { some: { groupId: { in: [1, 2] } } } }],
        },
        select: expect.any(Object),
        orderBy: expect.any(Array),
      });
    });

    it('一覧用 select は title/bodyMarkdown/フラグ類のみ（本文以外の関係テーブルを含まない）こと', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([]);

      await repo.findManyVisibleToGroups([]);

      const { select } = mockPrisma.announcement.findMany.mock.calls[0][0];
      expect(select).toEqual({
        id: true,
        title: true,
        bodyMarkdown: true,
        isNew: true,
        isImportant: true,
        notifiedAt: true,
        sortOrder: true,
      });
    });
  });

  describe('findExistingGroupIds (宛先グループの存在確認)', () => {
    // v2-429: 存在しない宛先 id を FK 違反（500）にせず、書き込む前に 400 で拒否するための土台。
    it('in 条件で引き、実在する id だけを返すこと', async () => {
      mockPrisma.group.findMany.mockResolvedValue([{ id: 3 }, { id: 4 }]);

      await expect(repo.findExistingGroupIds([3, 4, 999999])).resolves.toEqual([3, 4]);

      expect(mockPrisma.group.findMany).toHaveBeenCalledWith({
        where: { id: { in: [3, 4, 999999] } },
        select: { id: true },
      });
    });

    it('空配列ではクエリを発行しないこと（全員可視の作成で余計なクエリを出さない）', async () => {
      await expect(repo.findExistingGroupIds([])).resolves.toEqual([]);

      expect(mockPrisma.group.findMany).not.toHaveBeenCalled();
    });

    // v2-429 の独立レビュー指摘: int4 の範囲外をそのまま渡すと存在確認のクエリ自体が
    // Prisma の変換エラーで落ちて 500 になる（実測: 2147483648 / 1e21）。
    it('int4 の範囲外の id はクエリへ渡さず、実在しないものとして返すこと', async () => {
      mockPrisma.group.findMany.mockResolvedValue([{ id: 3 }]);

      await expect(repo.findExistingGroupIds([3, 2147483648, -2147483649, 1e21])).resolves.toEqual([
        3,
      ]);

      expect(mockPrisma.group.findMany).toHaveBeenCalledWith({
        where: { id: { in: [3] } },
        select: { id: true },
      });
    });

    it('範囲内の id が1つも無ければクエリを発行しないこと', async () => {
      await expect(repo.findExistingGroupIds([2147483648, 1e21])).resolves.toEqual([]);

      expect(mockPrisma.group.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create (通知先グループの作成)', () => {
    it('roleGroupIds を roles.create の形で展開して作成すること', async () => {
      mockPrisma.announcement.create.mockResolvedValue(null);

      await repo.create(baseData, [3, 4]);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith({
        data: {
          ...baseData,
          roles: { create: [{ groupId: 3 }, { groupId: 4 }] },
        },
        include: expect.any(Object),
      });
    });

    it('roleGroupIds が空の時は roles.create を空で渡すこと', async () => {
      mockPrisma.announcement.create.mockResolvedValue(null);

      await repo.create(baseData, []);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith({
        data: {
          ...baseData,
          roles: { create: [] },
        },
        include: expect.any(Object),
      });
    });
  });

  describe('update (通知先グループの差し替え)', () => {
    it('roleGroupIds 未指定は据え置き＝roles に触れず transaction も張らないこと', async () => {
      mockPrisma.announcement.update.mockResolvedValue(null);

      await repo.update(10, { title: '更新後', updatedById: 'user-1' });

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { title: '更新後', updatedById: 'user-1' },
        include: expect.any(Object),
      });
    });

    it('roleGroupIds 指定時は同一 transaction 内で既存 roles を全削除してから作成し直すこと', async () => {
      // 差し替えの実行順序は意味的負荷を持つ（逆順だと update が作った新 roles を
      // deleteMany が消して「全解除」に変わる）。既存 stocks spec の callOrder 前例に
      // 倣い、deleteMany → update の順序を構造的に検証する。
      const callOrder: string[] = [];
      mockTx.announcementRole.deleteMany.mockImplementation(async () => {
        callOrder.push('deleteMany');
        return { count: 0 };
      });
      mockTx.announcement.update.mockImplementation(async () => {
        callOrder.push('update');
        return null;
      });

      await repo.update(10, { title: '更新後', updatedById: 'user-1' }, [3, 4]);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['deleteMany', 'update']);
      expect(mockTx.announcementRole.deleteMany).toHaveBeenCalledWith({
        where: { announcementId: 10 },
      });
      expect(mockTx.announcement.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          title: '更新後',
          updatedById: 'user-1',
          roles: { create: [{ groupId: 3 }, { groupId: 4 }] },
        },
        include: expect.any(Object),
      });
    });

    it('roleGroupIds が空の指定は roles を create せず全解除（roles を渡さない）こと', async () => {
      mockTx.announcementRole.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.announcement.update.mockResolvedValue(null);

      await repo.update(10, { title: '更新後', updatedById: 'user-1' }, []);

      expect(mockTx.announcementRole.deleteMany).toHaveBeenCalledWith({
        where: { announcementId: 10 },
      });
      const { data } = mockTx.announcement.update.mock.calls[0][0];
      expect(data.title).toBe('更新後');
      // 空配列の指定は「roles を create しない」を明示（roles: undefined）＝全解除
      expect(data.roles).toBeUndefined();
    });
  });
});
