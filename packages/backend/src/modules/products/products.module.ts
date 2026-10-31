import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsRepository } from './repositories/products.repository';
import { ExcelService } from './excel.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository, ExcelService],
  // ProductsRepository は ImportsModule（CSV 取込）が bulkUpsertByCode を利用するため export。
  exports: [ProductsService, ProductsRepository],
})
export class ProductsModule {}
