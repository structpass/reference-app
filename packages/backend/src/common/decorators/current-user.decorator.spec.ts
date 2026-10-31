import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

describe('CurrentUser デコレーター', () => {
  it('デコレーターが定義されていること', () => {
    expect(CurrentUser).toBeDefined();
  });

  it('パラメータデコレーターとして動作すること', () => {
    class TestClass {
      testMethod(@CurrentUser() user: any) {
        return user;
      }
    }
    const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass, 'testMethod');
    expect(metadata).toBeDefined();
  });

  it('data引数付きでパラメータデコレーターとして動作すること', () => {
    class TestClass2 {
      testMethod(@CurrentUser('id') userId: string) {
        return userId;
      }
    }
    const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestClass2, 'testMethod');
    expect(metadata).toBeDefined();
  });
});
