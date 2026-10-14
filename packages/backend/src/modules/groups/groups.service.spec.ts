import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GroupsService } from './groups.service';
import { GroupsRepository } from './repositories/groups.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import {
  makeGroupEntity,
  makeGroupMemberEntity,
  makeGroupWithMembersEntity,
} from '@/__tests__/factories';

/** GroupResponseDto shape (Repository 側で mapper 済) */
const mockGroup = makeGroupEntity({
  id: 1,
  name: '倉庫グループA',
  code: 'GRP-001',
  description: 'テストグループ',
  role: UserRole.WH_USER,
});

/** GroupMemberResponseDto shape */
const mockUserGroup = makeGroupMemberEntity({
  id: 'ug-uuid-1',
  user: { id: 'user-1', name: 'admin', email: 'admin@test.com', role: UserRole.SYS_ADMIN },
});

/** GroupWithMembersResponseDto shape */
const mockGroupWithMembers = makeGroupWithMembersEntity({
  id: 1,
  name: '倉庫グループA',
  code: 'GRP-001',
  description: 'テストグループ',
  role: UserRole.WH_USER,
  userGroups: [{ user: mockUserGroup.user }] as never,
});

const mockRepo = {
  findManyPaginated: jest.fn(),
  findManyForExport: jest.fn(),
  findById: jest.fn(),
  findByIdWithMembers: jest.fn(),
  findByCode: jest.fn(),
  create: jest.fn(),
  updateIfPresent: jest.fn(),
  updateWithAuthorization: jest.fn(),
  writeMembershipWithAuthorization: jest.fn(),
  delete: jest.fn(),
  deleteIfUnreferenced: jest.fn(),
  findMember: jest.fn(),
  findMembers: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
  /** 固定時点の所属行が存在するか（認可付き書込みの模擬が読む）。 */
  __memberExists: false as boolean,
  /** 認可を通って書込みまで進んだか（拒否の検査に使う）。 */
  __writeAttempted: false as boolean,
  /** 認可を通って更新まで進んだか（拒否の検査に使う）。 */
  __updateAttempted: false as boolean,
};

const mockUsersRepo = {
  findById: jest.fn(),
};

/**
 * 認可付き書込みの模擬（v2-485）。
 *
 * `updateWithAuthorization` / `writeMembershipWithAuthorization` は「固定した最新行を認可
 * callback へ渡し、通った時だけ同じトランザクションで書く」契約なので、単純な
 * `mockResolvedValue` では**認可が固定行で行われたか**を検査できない。ここでは実際に
 * callback を呼び、投げれば書かずに伝播させる（実装の順序と同じ）。
 *
 * 固定行は事前読み（`findById`）が返した行から導く。逐次経路（競合なし）の期待を作る
 * 既存テストは、事前読みと固定行が同じ `role` であることが前提なので、ここを揃えないと
 * 「担当外だから 403」ではなく別の判定を見てしまう。競合そのものの検査は実 PostgreSQL の
 * 統合テスト（`test/groups-authz-race.int-spec.ts`）が担う。
 */
const lockedRowFrom = (row: unknown, id: number) => {
  const role = (row as { role?: UserRole } | null)?.role ?? UserRole.WH_USER;
  return { id, role, code: 'GRP-001', name: '倉庫グループA' };
};

const lockedUserFrom = (row: unknown, id: string) => ({
  id,
  role: (row as { role?: UserRole | null } | null)?.role ?? null,
});

function implementAuthorizationAwareWrites() {
  mockRepo.updateWithAuthorization.mockImplementation(
    async (
      id: number,
      data: Record<string, unknown>,
      authorize: (group: { id: number; role: UserRole }) => void,
    ) => {
      const preRead = await mockRepo.findById(id);
      if (!preRead) return null;
      authorize(lockedRowFrom(preRead, id));
      mockRepo.__updateAttempted = true;
      return { ...mockGroup, ...data, id };
    },
  );

  mockRepo.writeMembershipWithAuthorization.mockImplementation(
    async (
      groupId: number,
      userId: string,
      mode: 'add' | 'remove',
      authorize: (current: {
        group: { id: number; role: UserRole };
        user: { id: string; role: UserRole | null };
        memberExists: boolean;
      }) => void,
      write: (tx: unknown, current: unknown) => Promise<unknown>,
    ) => {
      const groupRow = await mockRepo.findById(groupId);
      if (!groupRow) return { group: null, user: null, value: null };
      const userRow = await mockUsersRepo.findById(userId);
      if (!userRow) return { group: lockedRowFrom(groupRow, groupId), user: null, value: null };

      const group = lockedRowFrom(groupRow, groupId);
      // 固定した利用者行の `id` は「DB の行の id」であり、呼び出し元が渡した表記ではない。
      // 実装は `users` から引いた行の id を自己追加の比較に使うので、表記が違っても同じ行なら
      // 自分自身として拒否される（その検査をここでも再現する）。
      const user = lockedUserFrom(userRow, (userRow as { id: string }).id);
      // 固定時点の所属行。逐次経路のテストは `findMember` で所属の有無を作っているので、
      // 明示の指定（`__memberExists`）が無ければその事前読みに揃える（競合なしの前提）。
      const memberExists =
        mockRepo.__memberExists === true || (await mockRepo.findMember(groupId, userId)) !== null;
      const current = { group, user, memberExists };

      // 既存所属の追加 / 不在所属の削除は、実装と同じく書かずに null を返す。
      if (mode === 'add' && memberExists) return { group, user, value: null };
      if (mode === 'remove' && !memberExists) return { group, user, value: null };

      authorize(current);
      mockRepo.__writeAttempted = true;
      const value = await write({ userGroup: { create: jest.fn(), delete: jest.fn() } }, current);
      return { group, user, value: value ?? mockUserGroup };
    },
  );
}

describe('GroupsService', () => {
  let service: GroupsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: GroupsRepository, useValue: mockRepo },
        { provide: UsersRepository, useValue: mockUsersRepo },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
    jest.clearAllMocks();
    // `clearAllMocks` は呼び出し履歴と戻り値を消すが、テストごとに明示されない mock が
    // 前のテストの設定を引きずらないよう、所属の有無は既定（所属なし）へ戻す。
    mockRepo.findMember.mockResolvedValue(null);
    mockRepo.__memberExists = false;
    mockRepo.__writeAttempted = false;
    mockRepo.__updateAttempted = false;
    implementAuthorizationAwareWrites();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('Repository.findManyPaginated に LIST_CONFIG を渡し結果を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockGroup],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findManyPaginated.mockResolvedValue(expected);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual(expected);
      expect(mockRepo.findManyPaginated).toHaveBeenCalledWith(
        { page: 1, limit: 20 },
        expect.objectContaining({
          searchFields: ['name', 'code'],
          allowedSortFields: ['createdAt', 'updatedAt', 'name', 'code', 'status'],
          paginatedInclude: { _count: { select: { userGroups: true } } },
        }),
      );
    });
  });

  describe('findAllForExport', () => {
    it('Repository.findManyForExport を呼んで結果配列を返すこと', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockGroup]);

      const result = await service.findAllForExport({});

      expect(result).toEqual([mockGroup]);
      expect(mockRepo.findManyForExport).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('存在する場合にメンバー込みでデータを返すこと', async () => {
      mockRepo.findByIdWithMembers.mockResolvedValue(mockGroupWithMembers);

      const result = await service.findOne(1);

      expect(result.success).toBe(true);
      expect(mockRepo.findByIdWithMembers).toHaveBeenCalledWith(1);
    });

    it('GroupWithMembersResponseDto の shape を持つこと', async () => {
      mockRepo.findByIdWithMembers.mockResolvedValue(mockGroupWithMembers);

      const result = await service.findOne(1);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockGroup.id,
          code: mockGroup.code,
          name: mockGroup.name,
          role: mockGroup.role,
          status: mockGroup.status,
          createdAt: mockGroup.createdAt,
          updatedAt: mockGroup.updatedAt,
          userGroups: [{ user: mockUserGroup.user }],
        }),
      );
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithMembers.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = {
      name: '倉庫グループA',
      code: 'GRP-001',
      description: 'テストグループ',
      role: 'WH_USER' as any,
    };

    it('グループを作成すること', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockGroup);

      const result = await service.create(createDto, UserRole.WH_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.create).toHaveBeenCalledWith(createDto);
    });

    it('GroupResponseDto の shape を持つこと', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockGroup);

      const result = await service.create(createDto, UserRole.WH_ADMIN);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockGroup.id,
          code: mockGroup.code,
          name: mockGroup.name,
          role: mockGroup.role,
          status: mockGroup.status,
          createdAt: mockGroup.createdAt,
          updatedAt: mockGroup.updatedAt,
        }),
      );
    });

    it('コード重複の場合にConflictExceptionをスローすること', async () => {
      mockRepo.findByCode.mockResolvedValue(mockGroup);

      await expect(service.create(createDto, UserRole.WH_ADMIN)).rejects.toThrow(ConflictException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('SYS_ADMIN 以外は role=SYS_ADMIN のグループを作成できないこと', async () => {
      mockRepo.findByCode.mockResolvedValue(null);

      await expect(
        service.create({ ...createDto, role: UserRole.SYS_ADMIN }, UserRole.WH_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('SYS_ADMIN は role=SYS_ADMIN のグループを作成できること', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.SYS_ADMIN }),
      );

      const result = await service.create(
        { ...createDto, role: UserRole.SYS_ADMIN },
        UserRole.SYS_ADMIN,
      );

      expect(result.success).toBe(true);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // v2-425 / 独立レビュー F-4: 作成経路でも系統を偽装できないようにする。
    it('WH_ADMIN は OF 系統のグループを作成できないこと（403・作られない）', async () => {
      mockRepo.findByCode.mockResolvedValue(null);

      await expect(
        service.create({ ...createDto, role: UserRole.OF_USER }, UserRole.WH_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('OF_ADMIN は WH 系統のグループを作成できないこと（403・作られない）', async () => {
      mockRepo.findByCode.mockResolvedValue(null);

      await expect(
        service.create({ ...createDto, role: UserRole.WH_USER }, UserRole.OF_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('管理者は自分の系統のグループを作成できること（既存運用の維持）', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }));

      const result = await service.create(
        { ...createDto, role: UserRole.OF_USER },
        UserRole.OF_ADMIN,
      );

      expect(result.success).toBe(true);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('SYS_ADMIN は系統を問わず作成できること（バイパス維持）', async () => {
      mockRepo.findByCode.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }));

      const result = await service.create(
        { ...createDto, role: UserRole.OF_USER },
        UserRole.SYS_ADMIN,
      );

      expect(result.success).toBe(true);
      expect(mockRepo.create).toHaveBeenCalled();
    });

    // v2-425 / 独立レビュー F-7: 系統検査をコード重複の検査より前に置く。後に置くと、担当外の
    // 系統でも既存コードの有無が 409 で分かる。
    it('担当外の系統では、コードが既存でも 403（409 でコードの存在を漏らさない）こと', async () => {
      mockRepo.findByCode.mockResolvedValue(mockGroup);

      await expect(
        service.create({ ...createDto, role: UserRole.OF_USER }, UserRole.WH_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.findByCode).not.toHaveBeenCalled();
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('グループを更新すること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.findById.mockResolvedValue({ ...mockGroup, name: '更新名' });

      const result = await service.update(1, { name: '更新名' }, UserRole.WH_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.updateWithAuthorization).toHaveBeenCalledWith(
        1,
        { name: '更新名' },
        expect.any(Function),
      );
    });

    it('GroupResponseDto の shape を持つこと', async () => {
      const updated = { ...mockGroup, name: '更新名' };
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.findById.mockResolvedValue(updated);

      const result = await service.update(1, { name: '更新名' }, UserRole.WH_ADMIN);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: updated.id,
          code: updated.code,
          name: '更新名',
          role: updated.role,
          status: updated.status,
        }),
      );
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(999, { name: 'x' }, UserRole.WH_ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    // v2-446: 存在確認の後に別の操作が同じ行を消した場合、行ロック待ちから戻った更新は 0 行になる。
    // 逐次（存在しない id）と同じ文言の 404 に揃える（Prisma の P2025 を汎用文言へ委ねない）。
    it('確認後に消えていた（updateIfPresent が null）ら Group not found の 404 にすること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.update(1, { name: 'x' }, UserRole.WH_ADMIN)).rejects.toThrow(
        'Group not found',
      );
    });

    it('コード変更時に重複チェックすること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.findByCode.mockResolvedValue({ ...mockGroup, id: 2 });

      await expect(service.update(1, { code: 'GRP-002' }, UserRole.WH_ADMIN)).rejects.toThrow(
        ConflictException,
      );
    });

    it('同一コードの場合は重複チェックをスキップすること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.findById.mockResolvedValue(mockGroup);

      await service.update(1, { code: 'GRP-001' }, UserRole.WH_ADMIN);

      expect(mockRepo.findByCode).not.toHaveBeenCalled();
    });

    it('SYS_ADMIN 以外は role=SYS_ADMIN のグループを変更できないこと', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.SYS_ADMIN }),
      );

      await expect(service.update(1, { name: 'x' }, UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は固定行に対して Repository の中で走る（v2-485）。更新まで進まないことを見る。
      expect(mockRepo.__updateAttempted).not.toBe(true);
    });

    it('SYS_ADMIN 以外はグループの role を SYS_ADMIN へ変更できないこと', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);

      await expect(
        service.update(1, { role: UserRole.SYS_ADMIN }, UserRole.WH_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      // 認可は固定行に対して Repository の中で走る（v2-485）。更新まで進まないことを見る。
      expect(mockRepo.__updateAttempted).not.toBe(true);
    });

    it('SYS_ADMIN は role=SYS_ADMIN のグループを変更できること', async () => {
      const sysGroup = makeGroupEntity({ ...mockGroup, role: UserRole.SYS_ADMIN });
      mockRepo.findById.mockResolvedValue(sysGroup);
      mockRepo.findById.mockResolvedValue(sysGroup);

      const result = await service.update(1, { name: 'x' }, UserRole.SYS_ADMIN);

      expect(result.success).toBe(true);
    });

    // v2-425 / 独立レビュー F-1: 系統をまたぐ role の書き換えを塞ぐ。これが通ると、編成の境界の
    // 前提（Group.role）を編成の側が書き換えて、系統をまたぐ追加を作れてしまう。
    it('OF_ADMIN は OF 系統のグループを WH 系統へ書き換えられないこと（403・role は変わらない）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );

      await expect(
        service.update(1, { role: UserRole.WH_USER }, UserRole.OF_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      // 認可は固定行に対して Repository の中で走る（v2-485）。更新まで進まないことを見る。
      expect(mockRepo.__updateAttempted).not.toBe(true);
    });

    it('WH_ADMIN は WH 系統のグループを OF 系統へ書き換えられないこと（403）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_USER }),
      );

      await expect(
        service.update(1, { role: UserRole.OF_ADMIN }, UserRole.WH_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      // 認可は固定行に対して Repository の中で走る（v2-485）。更新まで進まないことを見る。
      expect(mockRepo.__updateAttempted).not.toBe(true);
    });

    it('同じ系統の中での role の書き換えはできること（編成の範囲が変わらない）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_USER }),
      );
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_ADMIN }),
      );

      const result = await service.update(1, { role: UserRole.WH_ADMIN }, UserRole.WH_ADMIN);

      expect(result.success).toBe(true);
    });

    it('role を指定しない更新は系統をまたぐ判定に掛からないこと', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER, name: 'x' }),
      );

      const result = await service.update(1, { name: 'x' }, UserRole.OF_ADMIN);

      expect(result.success).toBe(true);
    });

    it('SYS_ADMIN は系統をまたぐ role の書き換えもできること', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_USER }),
      );

      const result = await service.update(1, { role: UserRole.WH_USER }, UserRole.SYS_ADMIN);

      expect(result.success).toBe(true);
    });

    // v2-425 / 独立レビュー F-6: 編集は「そのグループを編成できる側」に閉じる。role の付け替え
    // だけを見ていると、系統をまたいで code や status を書き換えられる。
    it('WH_ADMIN は OF 系統のグループの status を書き換えられないこと（403）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );

      await expect(
        service.update(1, { status: 'INACTIVE' as never }, UserRole.WH_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      // 認可は固定行に対して Repository の中で走る（v2-485）。更新まで進まないことを見る。
      expect(mockRepo.__updateAttempted).not.toBe(true);
    });

    it('WH_ADMIN は OF 系統のグループのコードを書き換えられないこと（403）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );

      await expect(service.update(1, { code: 'OF-RENAMED' }, UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は固定行に対して Repository の中で走る（v2-485）。更新まで進まないことを見る。
      expect(mockRepo.__updateAttempted).not.toBe(true);
      expect(mockRepo.findByCode).not.toHaveBeenCalled();
    });

    it('WH_ADMIN は OF 系統のグループの名前も書き換えられないこと（403）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );

      await expect(service.update(1, { name: 'x' }, UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は固定行に対して Repository の中で走る（v2-485）。更新まで進まないことを見る。
      expect(mockRepo.__updateAttempted).not.toBe(true);
    });

    it('OF_ADMIN は OF 系統のグループの status を書き換えられること（既存運用の維持）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );

      const result = await service.update(1, { status: 'INACTIVE' as never }, UserRole.OF_ADMIN);

      expect(result.success).toBe(true);
    });

    it('SYS_ADMIN は系統を問わず編集できること（バイパス維持）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );

      const result = await service.update(1, { name: 'x' }, UserRole.SYS_ADMIN);

      expect(result.success).toBe(true);
    });
  });

  describe('remove', () => {
    it('グループを削除すること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.deleteIfUnreferenced.mockResolvedValue({ missing: false, members: 0, audiences: 0 });

      const result = await service.remove(1, UserRole.WH_ADMIN);

      expect(result).toEqual({
        success: true,
        data: { message: 'Group deleted successfully' },
      });
      expect(mockRepo.deleteIfUnreferenced).toHaveBeenCalledWith(1);
    });

    it('同時削除の後続（行が既に無い）は 404 にすること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.deleteIfUnreferenced.mockResolvedValue({
        missing: true,
        members: 0,
        audiences: 0,
      });

      await expect(service.remove(1, UserRole.WH_ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove(999, UserRole.WH_ADMIN)).rejects.toThrow(NotFoundException);
      expect(mockRepo.deleteIfUnreferenced).not.toHaveBeenCalled();
    });

    it('掲示の宛先になっているグループは削除せずConflictExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.deleteIfUnreferenced.mockResolvedValue({ missing: false, members: 0, audiences: 1 });

      await expect(service.remove(1, UserRole.WH_ADMIN)).rejects.toThrow(ConflictException);
    });

    it('所属ユーザーが残るグループは削除せずConflictExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.deleteIfUnreferenced.mockResolvedValue({ missing: false, members: 2, audiences: 0 });

      await expect(service.remove(1, UserRole.WH_ADMIN)).rejects.toThrow(ConflictException);
    });

    it('SYS_ADMIN 以外は role=SYS_ADMIN のグループを削除できないこと', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.SYS_ADMIN }),
      );

      await expect(service.remove(1, UserRole.WH_ADMIN)).rejects.toThrow(ForbiddenException);
      expect(mockRepo.deleteIfUnreferenced).not.toHaveBeenCalled();
    });

    it('SYS_ADMIN は role=SYS_ADMIN のグループを削除できること', async () => {
      const sysGroup = makeGroupEntity({ ...mockGroup, role: UserRole.SYS_ADMIN });
      mockRepo.findById.mockResolvedValue(sysGroup);
      mockRepo.deleteIfUnreferenced.mockResolvedValue({ missing: false, members: 0, audiences: 0 });

      const result = await service.remove(1, UserRole.SYS_ADMIN);

      expect(result.success).toBe(true);
    });
  });

  describe('findMembers', () => {
    it('メンバー一覧を返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.findMembers.mockResolvedValue([mockUserGroup]);

      const result = await service.findMembers(1);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
    });

    it('GroupMemberResponseDto の shape を持つこと', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.findMembers.mockResolvedValue([mockUserGroup]);

      const result = await service.findMembers(1);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: mockUserGroup.id,
          userId: mockUserGroup.userId,
          groupId: mockUserGroup.groupId,
          createdAt: mockUserGroup.createdAt,
          user: expect.objectContaining({
            id: mockUserGroup.user.id,
            name: mockUserGroup.user.name,
            email: mockUserGroup.user.email,
            role: mockUserGroup.user.role,
          }),
        }),
      );
    });

    it('グループが存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.findMembers(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('addMember', () => {
    it('メンバーを追加すること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(null);

      const result = await service.addMember(1, 'user-1', 'caller-1', UserRole.WH_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.writeMembershipWithAuthorization).toHaveBeenCalledWith(
        1,
        'user-1',
        'add',
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('GroupMemberResponseDto の shape を持つこと', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(null);

      const result = await service.addMember(1, 'user-1', 'caller-1', UserRole.WH_ADMIN);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockUserGroup.id,
          userId: mockUserGroup.userId,
          groupId: mockUserGroup.groupId,
          user: expect.objectContaining({
            id: mockUserGroup.user.id,
            name: mockUserGroup.user.name,
            role: mockUserGroup.user.role,
          }),
        }),
      );
    });

    it('グループが存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.addMember(999, 'user-1', 'caller-1', UserRole.WH_ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('ユーザーが存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue(null);

      await expect(
        service.addMember(1, 'invalid-user', 'caller-1', UserRole.WH_ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('既にメンバーの場合にConflictExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(mockUserGroup);

      await expect(service.addMember(1, 'user-1', 'caller-1', UserRole.WH_ADMIN)).rejects.toThrow(
        ConflictException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('自分自身の追加は SYS_ADMIN 以外で Forbidden になること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'caller-1', role: UserRole.WH_ADMIN });
      mockRepo.findMember.mockResolvedValue(null);

      await expect(service.addMember(1, 'caller-1', 'caller-1', UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('リポジトリが表記を吸収して同じ行を返しても、自分自身の追加として拒否すること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'caller-1', role: UserRole.WH_ADMIN });
      mockRepo.findMember.mockResolvedValue(null);

      await expect(service.addMember(1, 'CALLER-1', 'caller-1', UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('呼び出し元を特定できない場合は Forbidden になること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });

      await expect(service.addMember(1, 'user-1', '', UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('SYS_ADMIN 以外は SYS_ADMIN ロールのユーザーを追加できないこと', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'admin-1', role: UserRole.SYS_ADMIN });

      await expect(service.addMember(1, 'admin-1', 'caller-1', UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('SYS_ADMIN 以外は role=SYS_ADMIN のグループへ追加できないこと', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.SYS_ADMIN }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });

      await expect(service.addMember(1, 'user-1', 'caller-1', UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('SYS_ADMIN は自分自身も SYS_ADMIN 領域も追加できること', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.SYS_ADMIN }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'admin-1', role: UserRole.SYS_ADMIN });
      mockRepo.findMember.mockResolvedValue(null);

      const result = await service.addMember(1, 'admin-1', 'admin-1', UserRole.SYS_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.writeMembershipWithAuthorization).toHaveBeenCalledWith(
        1,
        'admin-1',
        'add',
        expect.any(Function),
        expect.any(Function),
      );
    });

    // v2-425: 編成の範囲（系統ごとの管理者）。管理を委ねられていないグループへの追加を塞ぐ。
    it('OF_ADMIN は WH 系統のグループへ第三者を追加できないこと（403・所属は増えない）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_ADMIN }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(null);

      await expect(service.addMember(1, 'user-1', 'caller-1', UserRole.OF_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('WH_ADMIN は OF 系統のグループへ追加できないこと（403・相互追加の遮断）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_ADMIN }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.OF_ADMIN });
      mockRepo.findMember.mockResolvedValue(null);

      await expect(service.addMember(1, 'user-1', 'caller-1', UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('WH_ADMIN は WH 系統のグループへ第三者を追加できること（既存運用の維持）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_USER }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(null);

      const result = await service.addMember(1, 'user-1', 'caller-1', UserRole.WH_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.writeMembershipWithAuthorization).toHaveBeenCalledWith(
        1,
        'user-1',
        'add',
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('OF_ADMIN は OF 系統のグループへ第三者を追加できること（既存運用の維持）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_USER }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.OF_USER });
      mockRepo.findMember.mockResolvedValue(null);

      const result = await service.addMember(1, 'user-1', 'caller-1', UserRole.OF_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.writeMembershipWithAuthorization).toHaveBeenCalledWith(
        1,
        'user-1',
        'add',
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('一般ユーザーは系統が一致していても追加できないこと（編成は管理者の役割）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_USER }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(null);

      await expect(service.addMember(1, 'user-1', 'caller-1', UserRole.WH_USER)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('編成できない理由に、そのグループを編成する側と依頼先が入ること', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_USER }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(null);

      await expect(service.addMember(1, 'user-1', 'caller-1', UserRole.OF_ADMIN)).rejects.toThrow(
        /倉庫担当の管理者.*システム管理者/,
      );
    });
  });

  describe('removeMember', () => {
    it('メンバーを削除すること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(mockUserGroup);
      mockRepo.__memberExists = true;

      const result = await service.removeMember(1, 'user-1', UserRole.WH_ADMIN);

      expect(result).toEqual({
        success: true,
        data: { message: 'Member removed successfully' },
      });
      expect(mockRepo.writeMembershipWithAuthorization).toHaveBeenCalledWith(
        1,
        'user-1',
        'remove',
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('メンバーが存在しない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.findMember.mockResolvedValue(null);

      await expect(service.removeMember(1, 'invalid-user', UserRole.WH_ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('グループが存在しない場合もNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);
      mockRepo.findMember.mockResolvedValue(mockUserGroup);

      await expect(service.removeMember(999, 'user-1', UserRole.WH_ADMIN)).rejects.toThrow(
        NotFoundException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('SYS_ADMIN 以外は SYS_ADMIN ユーザーを削除できないこと', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'admin-1', role: UserRole.SYS_ADMIN });
      mockRepo.findMember.mockResolvedValue(mockUserGroup);

      await expect(service.removeMember(1, 'admin-1', UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('自分自身の削除は禁止しないこと', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockUsersRepo.findById.mockResolvedValue({ id: 'caller-1', role: UserRole.WH_ADMIN });
      mockRepo.findMember.mockResolvedValue(mockUserGroup);
      mockRepo.__memberExists = true;

      const result = await service.removeMember(1, 'caller-1', UserRole.WH_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.writeMembershipWithAuthorization).toHaveBeenCalledWith(
        1,
        'caller-1',
        'remove',
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('所属はあるがユーザー行が引けない場合は削除しないこと（fail-closed）', async () => {
      mockRepo.findById.mockResolvedValue(mockGroup);
      mockRepo.findMember.mockResolvedValue(mockUserGroup);
      mockUsersRepo.findById.mockResolvedValue(null);

      await expect(service.removeMember(1, 'user-1', UserRole.WH_ADMIN)).rejects.toThrow(
        NotFoundException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    // v2-425: 外す側も足す側と同じ範囲に閉じる（足せる者が外せる者でもある）。
    it('OF_ADMIN は WH 系統のグループから削除できないこと（403・所属は残る）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_ADMIN }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(mockUserGroup);

      await expect(service.removeMember(1, 'user-1', UserRole.OF_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      // 認可は Repository の呼び出しの中で固定行に対して走る（v2-485）。呼ばれないことではなく、
      // 書込みまで進まないことを見る（拒否なら callback が投げて rollback する）。
      expect(mockRepo.__writeAttempted).not.toBe(true);
    });

    it('系統が一致する管理者は削除できること（既存運用の維持）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.WH_USER }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.WH_USER });
      mockRepo.findMember.mockResolvedValue(mockUserGroup);
      mockRepo.__memberExists = true;

      const result = await service.removeMember(1, 'user-1', UserRole.WH_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.writeMembershipWithAuthorization).toHaveBeenCalledWith(
        1,
        'user-1',
        'remove',
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('SYS_ADMIN は系統を問わず削除できること（全機能バイパスの維持）', async () => {
      mockRepo.findById.mockResolvedValue(
        makeGroupEntity({ ...mockGroup, role: UserRole.OF_ADMIN }),
      );
      mockUsersRepo.findById.mockResolvedValue({ id: 'user-1', role: UserRole.OF_USER });
      mockRepo.findMember.mockResolvedValue(mockUserGroup);
      mockRepo.__memberExists = true;

      const result = await service.removeMember(1, 'user-1', UserRole.SYS_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.writeMembershipWithAuthorization).toHaveBeenCalledWith(
        1,
        'user-1',
        'remove',
        expect.any(Function),
        expect.any(Function),
      );
    });
  });
});
