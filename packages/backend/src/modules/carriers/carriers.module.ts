import { Module } from '@nestjs/common';
import { CarriersController } from './carriers.controller';
import { CarriersService } from './carriers.service';
import { CarriersRepository } from './repositories/carriers.repository';

@Module({
  controllers: [CarriersController],
  providers: [CarriersService, CarriersRepository],
  exports: [CarriersService],
})
export class CarriersModule {}
