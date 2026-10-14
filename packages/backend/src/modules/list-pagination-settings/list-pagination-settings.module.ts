import { Module } from '@nestjs/common';
import { ListPaginationSettingsController } from './list-pagination-settings.controller';
import { ListPaginationSettingsService } from './list-pagination-settings.service';
import { ListPaginationSettingsRepository } from './repositories/list-pagination-settings.repository';

@Module({
  controllers: [ListPaginationSettingsController],
  providers: [ListPaginationSettingsService, ListPaginationSettingsRepository],
  exports: [ListPaginationSettingsService],
})
export class ListPaginationSettingsModule {}
