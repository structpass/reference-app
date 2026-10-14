import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks';
import { ReceivingsController } from './receivings.controller';
import { ReceivingsService } from './receivings.service';
import { ReceivingsRepository } from './repositories/receivings.repository';

@Module({
  imports: [StocksModule],
  controllers: [ReceivingsController],
  providers: [ReceivingsService, ReceivingsRepository],
  exports: [ReceivingsService],
})
export class ReceivingsModule {}
