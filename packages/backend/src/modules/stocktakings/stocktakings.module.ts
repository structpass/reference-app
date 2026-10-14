import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks';
import { StocktakingsController } from './stocktakings.controller';
import { StocktakingsService } from './stocktakings.service';
import { StocktakingsRepository } from './repositories/stocktakings.repository';

@Module({
  imports: [StocksModule],
  controllers: [StocktakingsController],
  providers: [StocktakingsService, StocktakingsRepository],
  exports: [StocktakingsService],
})
export class StocktakingsModule {}
