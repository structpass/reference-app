import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';
import { ShipmentsRepository } from './repositories/shipments.repository';

@Module({
  imports: [StocksModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService, ShipmentsRepository],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
