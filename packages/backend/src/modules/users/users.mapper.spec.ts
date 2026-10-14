import { makeUserEntity, makeUserWithGroupsEntity, BASE_DATE } from '../../__tests__/factories';
import { toUserResponse, toUserWithGroupsResponse } from './users.mapper';

describe('users.mapper', () => {
  describe('toUserResponse (base shape)', () => {
    it('USER_SELECT shape の主要フィールドを返す', () => {
      const dto = toUserResponse(makeUserEntity());
      expect(dto).toMatchObject({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'SYS_ADMIN',
        isActive: true,
      });
      expect(dto.lastLoginAt).toBeInstanceOf(Date);
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('passwordHash を含めない (規約 §1 DTO 境界)', () => {
      const entity = makeUserEntity({ passwordHash: 'should-not-leak' } as never);
      const dto = toUserResponse(entity);
      expect(dto).not.toHaveProperty('passwordHash');
    });

    it('lastLoginAt が null でも保持する (未ログインユーザー)', () => {
      const dto = toUserResponse(makeUserEntity({ lastLoginAt: null }));
      expect(dto.lastLoginAt).toBeNull();
    });
  });

  describe('toUserWithGroupsResponse (with groups shape)', () => {
    it('base のスカラーフィールドを保持し userGroups を整形する', () => {
      const dto = toUserWithGroupsResponse(makeUserWithGroupsEntity());
      expect(dto).toMatchObject({
        id: 'user-1',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'SYS_ADMIN',
        isActive: true,
      });
      expect(dto.userGroups).toEqual([
        { group: { id: 100, name: '管理者グループ', code: 'G-100' } },
      ]);
    });

    it('userGroups の余計なフィールド (userId, groupId, createdAt) を含めない', () => {
      const dto = toUserWithGroupsResponse(makeUserWithGroupsEntity());
      expect(dto.userGroups[0]).not.toHaveProperty('userId');
      expect(dto.userGroups[0]).not.toHaveProperty('groupId');
      expect(dto.userGroups[0]).not.toHaveProperty('createdAt');
    });

    it('userGroups が空配列の場合は空配列を返す', () => {
      const dto = toUserWithGroupsResponse(makeUserWithGroupsEntity({ userGroups: [] }));
      expect(dto.userGroups).toEqual([]);
    });

    it('複数 group を保持する', () => {
      const dto = toUserWithGroupsResponse(
        makeUserWithGroupsEntity({
          userGroups: [
            {
              id: 'ug-1',
              userId: 'user-1',
              groupId: 100,
              createdAt: BASE_DATE,
              group: { id: 100, name: 'A', code: 'G-100' },
            },
            {
              id: 'ug-2',
              userId: 'user-1',
              groupId: 101,
              createdAt: BASE_DATE,
              group: { id: 101, name: 'B', code: 'G-101' },
            },
          ],
        }),
      );
      expect(dto.userGroups).toHaveLength(2);
      expect(dto.userGroups[1].group.code).toBe('G-101');
    });

    it('passwordHash を含めない (規約 §1 DTO 境界)', () => {
      const entity = makeUserWithGroupsEntity({ passwordHash: 'should-not-leak' } as never);
      const dto = toUserWithGroupsResponse(entity);
      expect(dto).not.toHaveProperty('passwordHash');
    });
  });
});
