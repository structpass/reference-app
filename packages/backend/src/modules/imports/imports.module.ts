import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { CategoriesModule } from '../categories/categories.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ProductImporter } from './importers/product.importer';

/**
 * CSV ファイル取込モジュール。
 * `ProductsModule` / `CategoriesModule` を import し、それぞれの Repository
 * （`ProductsRepository` / `CategoriesRepository`）を importer から利用する。
 * `CsvService` は CsvModule が @Global で提供するため明示 import 不要。
 */
@Module({
  imports: [ProductsModule, CategoriesModule],
  controllers: [ImportsController],
  providers: [ImportsService, ProductImporter],
})
export class ImportsModule {}
