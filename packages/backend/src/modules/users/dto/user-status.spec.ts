import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ActiveStatus } from '@prisma/client';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from './update-user.dto';
import { FindUsersDto } from './find-users.dto';

// 3 つの DTO を同じ手順で確かめる。変換は型引数で受けて、
// クラスの合併型で overload 解決が崩れないようにする。
const toInstance = (dto: new () => object, plain: object): object => plainToInstance(dto, plain);

describe('利用者の状態の入力境界', () => {
  for (const Dto of [CreateUserDto, UpdateUserDto, FindUsersDto]) {
    describe(Dto.name, () => {
      const base =
        Dto === CreateUserDto ? { name: 'status test', email: 'status@example.com' } : {};
      it.each([ActiveStatus.ACTIVE, ActiveStatus.INACTIVE, undefined])(
        '%s を受け取る',
        async (status) => {
          const errors = await validate(toInstance(Dto, { ...base, status }));
          expect(errors).toHaveLength(0);
        },
      );
      it.each([true, false, 'true', 'false', '', 'UNKNOWN', 0])('%s を拒否する', async (status) => {
        const errors = await validate(toInstance(Dto, { ...base, status }));
        expect(errors.some((error) => error.property === 'status')).toBe(true);
      });
      if (Dto !== FindUsersDto) {
        it('null で状態を壊させない', async () => {
          const errors = await validate(toInstance(Dto, { ...base, status: null }));
          expect(errors.some((error) => error.property === 'status')).toBe(true);
        });
      }
    });
  }
});
