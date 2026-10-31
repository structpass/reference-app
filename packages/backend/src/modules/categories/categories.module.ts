import { Module } from '@nestjs/common';
import { ExcelModule } from '../../common/services';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from './repositories/categories.repository';

@Module({
  imports: [ExcelModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoriesRepository],
  // CategoriesRepository は ImportsModule（CSV 取込）が category code 解決に利用するため export。
  exports: [CategoriesService, CategoriesRepository],
})
export class CategoriesModule {}
