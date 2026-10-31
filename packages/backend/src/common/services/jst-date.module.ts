import { Global, Module } from '@nestjs/common';
import { JstDateService } from './jst-date.service';

/**
 * 日付を日本時間で組み立てる共通の入口（v2-534）。
 * どの機能からも使うため、Globals として1か所で提供する。
 */
@Global()
@Module({
  providers: [JstDateService],
  exports: [JstDateService],
})
export class JstDateModule {}
