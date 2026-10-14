import {
  makeGroupEntity,
  makeGroupMemberEntity,
  makeGroupWithMembersEntity,
  BASE_DATE,
} from '../../__tests__/factories';
import {
  toGroupResponse,
  toGroupMemberResponse,
  toGroupWithMembersResponse,
} from './groups.mapper';

describe('groups.mapper', () => {
  describe('toGroupResponse (base shape)', () => {
    it('GroupPayload の主要フィールドを返す', () => {
      const dto = toGroupResponse(makeGroupEntity());
      expect(dto).toMatchObject({
        id: 1,
        code: 'G-001',
        name: '管理者グループ',
        description: '全権限を持つグループ',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      expect(dto.createdAt).toBeInstanceOf(Date);
      expect(dto.updatedAt).toBeInstanceOf(Date);
    });

    it('description が null でも保持する', () => {
      const dto = toGroupResponse(makeGroupEntity({ description: null }));
      expect(dto.description).toBeNull();
    });
  });

  describe('toGroupMemberResponse (member shape)', () => {
    it('Member の主要フィールドと user 関係を返す', () => {
      const dto = toGroupMemberResponse(makeGroupMemberEntity());
      expect(dto).toMatchObject({
        id: 'ug-1',
        userId: 'user-1',
        groupId: 1,
        user: {
          id: 'user-1',
          name: 'alice',
          email: 'alice@example.com',
          role: 'ADMIN',
        },
      });
    });

    it('user の余計なフィールド (passwordHash 等) を含めない (規約 §1 DTO 境界)', () => {
      const entity = makeGroupMemberEntity({
        user: {
          id: 'user-1',
          name: 'alice',
          email: 'alice@example.com',
          role: 'ADMIN',
          passwordHash: 'should-not-leak',
        } as never,
      });
      const dto = toGroupMemberResponse(entity);
      expect(dto.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('toGroupWithMembersResponse (with members shape)', () => {
    it('base のスカラーフィールドを保持し userGroups を { user } shape で整形する', () => {
      const dto = toGroupWithMembersResponse(makeGroupWithMembersEntity());
      expect(dto).toMatchObject({
        id: 1,
        code: 'G-001',
        name: '管理者グループ',
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      expect(dto.userGroups).toEqual([
        {
          user: {
            id: 'user-1',
            name: 'alice',
            email: 'alice@example.com',
            role: 'ADMIN',
          },
        },
      ]);
    });

    it('userGroups の余計なフィールド (id, userId, groupId, createdAt) を含めない', () => {
      const dto = toGroupWithMembersResponse(makeGroupWithMembersEntity());
      expect(dto.userGroups[0]).not.toHaveProperty('id');
      expect(dto.userGroups[0]).not.toHaveProperty('userId');
      expect(dto.userGroups[0]).not.toHaveProperty('groupId');
      expect(dto.userGroups[0]).not.toHaveProperty('createdAt');
    });

    it('userGroups が空配列の場合は空配列を返す', () => {
      const dto = toGroupWithMembersResponse(makeGroupWithMembersEntity({ userGroups: [] }));
      expect(dto.userGroups).toEqual([]);
    });

    it('複数 member を保持する', () => {
      const dto = toGroupWithMembersResponse(
        makeGroupWithMembersEntity({
          userGroups: [
            {
              id: 'ug-1',
              userId: 'user-1',
              groupId: 1,
              createdAt: BASE_DATE,
              user: {
                id: 'user-1',
                name: 'alice',
                email: 'a@e.com',
                role: 'ADMIN' as never,
              },
            },
            {
              id: 'ug-2',
              userId: 'user-2',
              groupId: 1,
              createdAt: BASE_DATE,
              user: {
                id: 'user-2',
                name: 'bob',
                email: 'b@e.com',
                role: 'STAFF' as never,
              },
            },
          ],
        }),
      );
      expect(dto.userGroups).toHaveLength(2);
      expect(dto.userGroups[1].user.name).toBe('bob');
    });
  });
});
