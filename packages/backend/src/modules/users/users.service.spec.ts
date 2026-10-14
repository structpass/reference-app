import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { UsersRepository } from './repositories/users.repository';
import { makeUserEntity, makeUserWithGroupsEntity } from '@/__tests__/factories';

const mockUser = makeUserEntity({
  id: 'user-uuid-1',
  name: 'testuser',
  email: 'test@example.com',
  role: UserRole.OF_USER,
  lastLoginAt: null,
});

/** UserResponseDto shape */
const mockUserSelectPayload = makeUserEntity({
  id: 'user-uuid-1',
  name: 'testuser',
  email: 'test@example.com',
  role: UserRole.OF_USER,
  lastLoginAt: null,
});

/** UserWithGroupsResponseDto shape */
const mockUserWithGroupsPayload = makeUserWithGroupsEntity({
  id: 'user-uuid-1',
  name: 'testuser',
  email: 'test@example.com',
  role: UserRole.OF_USER,
  lastLoginAt: null,
  userGroups: [{ group: { id: 1, name: 'Warehouse A', code: 'WH-A' } }] as never,
});

const mockRepo = {
  findById: jest.fn(),
  findByIdWithGroups: jest.fn(),
  findByOidcSub: jest.fn(),
  findByEmail: jest.fn(),
  findManyPaginated: jest.fn(),
  findManyForExport: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  // v2-484: `update` は保護状態を行ロックの下で再評価する `updateGuarded` を通る。
  updateGuarded: jest.fn(),
  linkOidcSub: jest.fn(),
  delete: jest.fn(),
};

/** v2-484: `updateGuarded` の成功応答（既存 spec の payload をそのまま返す）。 */
const guardedUpdated = (user = mockUserSelectPayload) =>
  mockRepo.updateGuarded.mockResolvedValue({ outcome: 'updated', user });

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: UsersRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('サービスが定義されていること', () => {
    expect(service).toBeDefined();
  });

  describe('findById', () => {
    it('Repository.findById を呼んで結果を返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);

      const result = await service.findById('user-uuid-1');

      expect(result).toEqual(mockUser);
      expect(mockRepo.findById).toHaveBeenCalledWith('user-uuid-1');
    });

    it('ユーザーが見つからない場合にnullを返すこと', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const result = await service.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('Repository.findByEmail を呼んで結果を返すこと', async () => {
      mockRepo.findByEmail.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('provisionFromOidc', () => {
    const claims = { sub: 'oidc-sub-1', email: 'sso@test.com', name: 'SSO User' };

    it('既存ユーザー（findByOidcSub ヒット）は email/name/lastLoginAt を更新すること', async () => {
      mockRepo.findByOidcSub.mockResolvedValue({ ...mockUser, id: 'existing-1' });
      mockRepo.update.mockResolvedValue(mockUserSelectPayload);

      const result = await service.provisionFromOidc(claims);

      expect(mockRepo.findByOidcSub).toHaveBeenCalledWith('oidc-sub-1');
      expect(mockRepo.update).toHaveBeenCalledWith(
        'existing-1',
        expect.objectContaining({
          email: 'sso@test.com',
          name: 'SSO User',
          lastLoginAt: expect.any(Date),
        }),
      );
      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(result).toEqual(mockUserSelectPayload);
    });

    it('新規ユーザーは pending（role=null / isActive=false）で JIT 作成すること', async () => {
      mockRepo.findByOidcSub.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockUserSelectPayload);

      const result = await service.provisionFromOidc(claims);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          oidcSub: 'oidc-sub-1',
          email: 'sso@test.com',
          name: 'SSO User',
          role: null,
          isActive: false,
          lastLoginAt: expect.any(Date),
        }),
      );
      expect(mockRepo.update).not.toHaveBeenCalled();
      expect(result).toEqual(mockUserSelectPayload);
    });

    it('空の email/name claim では既存ユーザーの値を上書きしないこと（再発防止ガード）', async () => {
      mockRepo.findByOidcSub.mockResolvedValue({ ...mockUser, id: 'existing-1' });
      mockRepo.update.mockResolvedValue(mockUserSelectPayload);

      await service.provisionFromOidc({ sub: 'oidc-sub-1', email: '', name: '' });

      const updateArg = mockRepo.update.mock.calls[0][1];
      expect(updateArg.email).toBeUndefined();
      expect(updateArg.name).toBeUndefined();
      expect(updateArg.lastLoginAt).toBeInstanceOf(Date);
    });

    it('空白のみの email/name claim でも既存ユーザーの値を上書きしないこと（trim ガード）', async () => {
      mockRepo.findByOidcSub.mockResolvedValue({ ...mockUser, id: 'existing-1' });
      mockRepo.update.mockResolvedValue(mockUserSelectPayload);

      await service.provisionFromOidc({ sub: 'oidc-sub-1', email: '   ', name: '   ' });

      const updateArg = mockRepo.update.mock.calls[0][1];
      expect(updateArg.email).toBeUndefined();
      expect(updateArg.name).toBeUndefined();
    });

    it('新規ユーザーで email が空の場合 InternalServerErrorException を投げ create しないこと', async () => {
      mockRepo.findByOidcSub.mockResolvedValue(null);

      await expect(
        service.provisionFromOidc({ sub: 'oidc-sub-1', email: '', name: 'X' }),
      ).rejects.toThrow(InternalServerErrorException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    // DB-M1（rev-quality 2026-07-31）: 初回ログイン並行で users_oidc_sub_key が競合しても冪等に完遂する
    it('create が oidc_sub の P2002 で競合した場合、再取得して lastLoginAt 更新を返すこと', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockRepo.findByOidcSub
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...mockUser, id: 'raced-1' });
      mockRepo.create.mockRejectedValue(p2002);
      mockRepo.update.mockResolvedValue(mockUserSelectPayload);

      const result = await service.provisionFromOidc(claims);

      expect(mockRepo.update).toHaveBeenCalledWith(
        'raced-1',
        expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      );
      expect(result).toEqual(mockUserSelectPayload);
    });

    it('create が email 競合の P2002（sub 再取得ミス）で ConflictException を投げること', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockRepo.findByOidcSub.mockResolvedValue(null);
      mockRepo.create.mockRejectedValue(p2002);

      await expect(service.provisionFromOidc(claims)).rejects.toThrow(ConflictException);
    });

    // ref-0066: 管理者許可制の SSO リンク（使い切りフラグ allowOidcLink）
    it('create が email 競合の P2002 で、メール一致かつ許可済みの未連携ユーザーが居る場合、sub をリンクしてフラグを消費すること', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockRepo.findByOidcSub.mockResolvedValue(null);
      mockRepo.create.mockRejectedValue(p2002);
      mockRepo.linkOidcSub.mockResolvedValue(1);
      mockRepo.findByEmail.mockResolvedValue(mockUserSelectPayload);

      const result = await service.provisionFromOidc(claims);

      expect(mockRepo.linkOidcSub).toHaveBeenCalledWith(
        'sso@test.com',
        expect.objectContaining({
          oidcSub: 'oidc-sub-1',
          allowOidcLink: false,
          email: 'sso@test.com',
          name: 'SSO User',
          lastLoginAt: expect.any(Date),
        }),
      );
      expect(result).toEqual(mockUserSelectPayload);
    });

    it('create が email 競合の P2002 で、メール一致だが許可フラグ off なら ConflictException を投げること', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockRepo.findByOidcSub.mockResolvedValue(null);
      mockRepo.create.mockRejectedValue(p2002);
      mockRepo.linkOidcSub.mockResolvedValue(0);

      await expect(service.provisionFromOidc(claims)).rejects.toThrow(ConflictException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('create が email 競合の P2002 で、メール一致だが既に SSO 連携済みなら ConflictException を投げること', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockRepo.findByOidcSub.mockResolvedValue(null);
      mockRepo.create.mockRejectedValue(p2002);
      mockRepo.linkOidcSub.mockResolvedValue(0);

      await expect(service.provisionFromOidc(claims)).rejects.toThrow(ConflictException);
      expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('create が email 競合の P2002 で、リンク競合の並行 sub が先にリンク済みなら冪等に返すこと', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockRepo.create.mockRejectedValue(p2002);
      mockRepo.linkOidcSub.mockRejectedValue(p2002);
      // 1 回目（冒頭）・2 回目（create 競合後）は未リンク、3 回目（リンク競合後）は既リンク。
      mockRepo.findByOidcSub
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue(mockUser);

      const result = await service.provisionFromOidc(claims);

      expect(mockRepo.findByOidcSub).toHaveBeenCalledWith('oidc-sub-1');
      expect(result).toEqual(mockUser);
    });
  });

  describe('findAll', () => {
    it('Repository.findManyPaginated に query を渡し結果を返すこと', async () => {
      const expected = {
        success: true,
        data: [mockUser],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      };
      mockRepo.findManyPaginated.mockResolvedValue(expected);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual(expected);
      expect(mockRepo.findManyPaginated).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });
  });

  describe('findAllForExport', () => {
    it('Repository.findManyForExport を呼んで結果配列を返すこと', async () => {
      mockRepo.findManyForExport.mockResolvedValue([mockUser]);

      const result = await service.findAllForExport({});

      expect(result).toEqual([mockUser]);
      expect(mockRepo.findManyForExport).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('ユーザー詳細を返すこと', async () => {
      mockRepo.findByIdWithGroups.mockResolvedValue(mockUserWithGroupsPayload);

      const result = await service.findOne('user-uuid-1');

      expect(result.success).toBe(true);
      expect(mockRepo.findByIdWithGroups).toHaveBeenCalledWith('user-uuid-1');
    });

    it('UserWithGroupsResponseDto の shape を持つこと', async () => {
      mockRepo.findByIdWithGroups.mockResolvedValue(mockUserWithGroupsPayload);

      const result = await service.findOne('user-uuid-1');

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockUserWithGroupsPayload.id,
          name: mockUserWithGroupsPayload.name,
          email: mockUserWithGroupsPayload.email,
          role: mockUserWithGroupsPayload.role,
          isActive: mockUserWithGroupsPayload.isActive,
          lastLoginAt: mockUserWithGroupsPayload.lastLoginAt,
          createdAt: mockUserWithGroupsPayload.createdAt,
          updatedAt: mockUserWithGroupsPayload.updatedAt,
          userGroups: [{ group: { id: 1, name: 'Warehouse A', code: 'WH-A' } }],
        }),
      );
      expect((result.data as any).passwordHash).toBeUndefined();
    });

    it('ユーザーが見つからない場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findByIdWithGroups.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = {
      name: 'newuser',
      email: 'new@test.com',
      role: UserRole.OF_USER,
    };

    it('新規ユーザーを作成して返すこと（password/username 不要）', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockUserSelectPayload);

      const result = await service.create(createDto, UserRole.WH_ADMIN);

      expect(result.success).toBe(true);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'newuser',
          email: 'new@test.com',
          role: UserRole.OF_USER,
          isActive: true,
        }),
      );
    });

    it('role 未指定時は role=null（権限待ち）で作成すること', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockUserSelectPayload);

      await service.create({ name: 'pending', email: 'pending@test.com' }, UserRole.WH_ADMIN);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: null, isActive: true }),
      );
    });

    it('UserResponseDto の shape を持つこと（passwordHash 非含有）', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockUserSelectPayload);

      const result = await service.create(createDto, UserRole.SYS_ADMIN);

      expect(result.data).toEqual(
        expect.objectContaining({
          id: mockUserSelectPayload.id,
          name: mockUserSelectPayload.name,
          email: mockUserSelectPayload.email,
          role: mockUserSelectPayload.role,
          isActive: mockUserSelectPayload.isActive,
          lastLoginAt: mockUserSelectPayload.lastLoginAt,
          createdAt: mockUserSelectPayload.createdAt,
          updatedAt: mockUserSelectPayload.updatedAt,
        }),
      );
      expect((result.data as any).passwordHash).toBeUndefined();
    });

    it('メールが重複している場合にConflictExceptionをスローすること', async () => {
      mockRepo.findByEmail.mockResolvedValue(mockUser);

      await expect(service.create(createDto, UserRole.SYS_ADMIN)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    // SEC-H1（rev-quality 2026-07-31）: SYS_ADMIN への権限昇格ガード
    it('非 SYS_ADMIN 呼び出しで role=SYS_ADMIN を指定した場合 ForbiddenException をスローすること', async () => {
      await expect(
        service.create(
          { name: 'x', email: 'x@test.com', role: UserRole.SYS_ADMIN },
          UserRole.WH_ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('SYS_ADMIN 呼び出しなら role=SYS_ADMIN の作成を許可すること', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockUserSelectPayload);

      await service.create(
        { name: 'x', email: 'x@test.com', role: UserRole.SYS_ADMIN },
        UserRole.SYS_ADMIN,
      );

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.SYS_ADMIN }),
      );
    });
  });

  describe('update', () => {
    it('ユーザー情報を更新して返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findByEmail.mockResolvedValue(null);
      guardedUpdated({ ...mockUserSelectPayload, email: 'updated@test.com' });

      const result = await service.update(
        'user-uuid-1',
        { email: 'updated@test.com' },
        UserRole.WH_ADMIN,
      );

      expect(result.success).toBe(true);
    });

    it('role 付与（承認）を反映すること', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      guardedUpdated();

      // 承認ワークフロー: 管理者（WH_ADMIN）が pending ユーザーへ非 SYS_ADMIN ロールを付与
      await service.update(
        'user-uuid-1',
        { role: UserRole.WH_ADMIN, isActive: true },
        UserRole.WH_ADMIN,
      );

      expect(mockRepo.updateGuarded).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.objectContaining({ role: UserRole.WH_ADMIN, isActive: true }),
        expect.anything(),
      );
    });

    it('存在しないユーザーを更新しようとした場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('non-existent', { email: 'x@test.com' }, UserRole.SYS_ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('メールが重複している場合にConflictExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findByEmail.mockResolvedValue({ id: 'other-uuid', email: 'taken@test.com' });

      await expect(
        service.update('user-uuid-1', { email: 'taken@test.com' }, UserRole.SYS_ADMIN),
      ).rejects.toThrow(ConflictException);
    });

    it('同じメールへの更新時に重複チェックをスキップすること', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      guardedUpdated();

      await service.update(
        'user-uuid-1',
        {
          name: 'testuser',
          email: 'test@example.com',
        },
        UserRole.WH_ADMIN,
      );

      expect(mockRepo.findByEmail).not.toHaveBeenCalled();
    });

    // ref-0066: 管理者許可制の SSO リンク（許可操作）
    it('allowOidcLink を true にすると未連携ユーザーへ反映されること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, oidcSub: null });
      guardedUpdated();

      await service.update('user-uuid-1', { allowOidcLink: true }, UserRole.SYS_ADMIN);

      expect(mockRepo.updateGuarded).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.objectContaining({ allowOidcLink: true }),
        expect.anything(),
      );
    });

    it('allowOidcLink を指定しても SSO 連携済みユーザーには ConflictException を投げること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, oidcSub: 'linked-sub' });

      await expect(
        service.update('user-uuid-1', { allowOidcLink: true }, UserRole.SYS_ADMIN),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.updateGuarded).not.toHaveBeenCalled();
    });

    // v2-426: 連携許可を SYS_ADMIN に限る（他者のアカウントへ連携できる経路を閉じる）
    it('非 SYS_ADMIN が allowOidcLink を true にすると ForbiddenException を投げること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, oidcSub: null });

      for (const role of [UserRole.WH_ADMIN, UserRole.OF_ADMIN, UserRole.WH_USER, null]) {
        await expect(service.update('user-uuid-1', { allowOidcLink: true }, role)).rejects.toThrow(
          ForbiddenException,
        );
      }
      expect(mockRepo.updateGuarded).not.toHaveBeenCalled();
    });

    it('非 SYS_ADMIN が email と allowOidcLink を同時に送っても ForbiddenException を投げること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, oidcSub: null });

      await expect(
        service.update(
          'user-uuid-1',
          { email: 'attacker@example.com', allowOidcLink: true },
          UserRole.WH_ADMIN,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.updateGuarded).not.toHaveBeenCalled();
    });

    it('非 SYS_ADMIN でも allowOidcLink=false（解除）は拒否しないこと', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, oidcSub: null });
      guardedUpdated();

      await service.update('user-uuid-1', { allowOidcLink: false }, UserRole.WH_ADMIN);

      expect(mockRepo.updateGuarded).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.objectContaining({ allowOidcLink: false }),
        expect.anything(),
      );
    });

    // v2-426: 許可済みの行のメール差し替え（連携先の付け替え）を非 SYS_ADMIN に許さない
    it('非 SYS_ADMIN は SSO 連携許可済み・未連携の行のメールを変更できないこと', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        oidcSub: null,
        allowOidcLink: true,
        email: 'victim@example.com',
      });

      await expect(
        service.update('user-uuid-1', { email: 'attacker@example.com' }, UserRole.WH_ADMIN),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.updateGuarded).not.toHaveBeenCalled();
    });

    it('SYS_ADMIN は SSO 連携許可済みの行のメールも変更できること', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        oidcSub: null,
        allowOidcLink: true,
        email: 'victim@example.com',
      });
      mockRepo.findByEmail.mockResolvedValue(null);
      guardedUpdated();

      await service.update('user-uuid-1', { email: 'fixed@example.com' }, UserRole.SYS_ADMIN);

      expect(mockRepo.updateGuarded).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.objectContaining({ email: 'fixed@example.com' }),
        expect.anything(),
      );
    });

    it('非 SYS_ADMIN でも許可フラグが立っていない行のメールは変更できること', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        oidcSub: null,
        allowOidcLink: false,
        email: 'victim@example.com',
      });
      mockRepo.findByEmail.mockResolvedValue(null);
      guardedUpdated();

      await service.update('user-uuid-1', { email: 'new@example.com' }, UserRole.WH_ADMIN);

      expect(mockRepo.updateGuarded).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.objectContaining({ email: 'new@example.com' }),
        expect.anything(),
      );
    });

    it('非 SYS_ADMIN でも SSO 連携済みの行のメールは変更できること（連携は sub で固定）', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        oidcSub: 'linked-sub',
        allowOidcLink: false,
        email: 'victim@example.com',
      });
      mockRepo.findByEmail.mockResolvedValue(null);
      guardedUpdated();

      await service.update('user-uuid-1', { email: 'new@example.com' }, UserRole.WH_ADMIN);

      expect(mockRepo.updateGuarded).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.objectContaining({ email: 'new@example.com' }),
        expect.anything(),
      );
    });

    // SEC-H1（rev-quality 2026-07-31）: SYS_ADMIN への権限昇格ガード
    it('非 SYS_ADMIN 呼び出しで role=SYS_ADMIN への変更は ForbiddenException をスローすること', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);

      await expect(
        service.update('user-uuid-1', { role: UserRole.SYS_ADMIN }, UserRole.WH_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.updateGuarded).not.toHaveBeenCalled();
    });

    it('SYS_ADMIN アカウントへの更新（name のみでも）は非 SYS_ADMIN 呼び出しで ForbiddenException をスローすること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, role: UserRole.SYS_ADMIN });

      await expect(
        service.update('user-uuid-1', { name: 'renamed' }, UserRole.OF_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(mockRepo.updateGuarded).not.toHaveBeenCalled();
    });

    it('SYS_ADMIN 呼び出しなら SYS_ADMIN アカウントの更新を許可すること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, role: UserRole.SYS_ADMIN });
      guardedUpdated();

      await service.update('user-uuid-1', { name: 'renamed' }, UserRole.SYS_ADMIN);

      expect(mockRepo.updateGuarded).toHaveBeenCalled();
    });

    // ========================================================================
    // v2-484: 事前読取の後に保護状態が変わった場合（並行操作）の写像。
    // Repository が行ロックの下で最新行と照合し、型付き結果で不在と状態変更を分ける。
    // ========================================================================
    it('v2-484: 保護状態が事前読取の後に変わっていた場合 ConflictException（409）を投げること', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        oidcSub: null,
        allowOidcLink: false,
        email: 'victim@example.com',
      });
      mockRepo.findByEmail.mockResolvedValue(null);
      // 事前読取では allowOidcLink=false だったが、書込み時に SYS_ADMIN が true を commit 済み。
      mockRepo.updateGuarded.mockResolvedValue({ outcome: 'stateChanged' });

      await expect(
        service.update('user-uuid-1', { email: 'attacker@example.com' }, UserRole.WH_ADMIN),
      ).rejects.toThrow(ConflictException);
    });

    it('v2-484: 事前読取の後に削除されていた場合 NotFoundException（404）を投げること', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.updateGuarded.mockResolvedValue({ outcome: 'missing' });

      await expect(
        service.update('user-uuid-1', { name: 'renamed' }, UserRole.WH_ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('v2-484: 保護状態（role/email/oidcSub/allowOidcLink）を期待値として Repository へ渡すこと', async () => {
      const existing = {
        ...mockUser,
        role: UserRole.OF_ADMIN,
        oidcSub: null,
        allowOidcLink: true,
        email: 'victim@example.com',
      };
      mockRepo.findById.mockResolvedValue(existing);
      guardedUpdated();

      // SYS_ADMIN の正当な更新（許可済み行のメール変更）でも期待値は同じく渡る。
      await service.update('user-uuid-1', { email: 'fixed@example.com' }, UserRole.SYS_ADMIN);

      expect(mockRepo.updateGuarded).toHaveBeenCalledWith('user-uuid-1', expect.anything(), {
        role: UserRole.OF_ADMIN,
        email: 'victim@example.com',
        oidcSub: null,
        allowOidcLink: true,
      });
    });

    it('v2-484: name / isActive の同時変更は期待値に含めないこと（無関係な同時編集で 409 にしない）', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      guardedUpdated();

      await service.update('user-uuid-1', { name: 'renamed', isActive: false }, UserRole.WH_ADMIN);

      const expectation = mockRepo.updateGuarded.mock.calls[0][2];
      expect(expectation).not.toHaveProperty('name');
      expect(expectation).not.toHaveProperty('isActive');
    });
  });

  describe('remove', () => {
    it('ユーザーを削除して成功メッセージを返すこと', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.delete.mockResolvedValue(mockUser);

      const result = await service.remove('user-uuid-1', UserRole.WH_ADMIN);

      expect(result.success).toBe(true);
      expect(result.data.message).toBe('User deleted successfully');
      expect(mockRepo.delete).toHaveBeenCalledWith('user-uuid-1');
    });

    it('存在しないユーザーを削除しようとした場合にNotFoundExceptionをスローすること', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.remove('non-existent', UserRole.SYS_ADMIN)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });

    // SEC-H1（rev-quality 2026-07-31）: SYS_ADMIN アカウント保護
    it('SYS_ADMIN アカウントの削除は非 SYS_ADMIN 呼び出しで ForbiddenException をスローすること', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, role: UserRole.SYS_ADMIN });

      await expect(service.remove('user-uuid-1', UserRole.WH_ADMIN)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRepo.delete).not.toHaveBeenCalled();
    });
  });
});
