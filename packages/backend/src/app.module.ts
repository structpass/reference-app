import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database';
import { DocumentNumberModule, CsvModule, ExcelModule } from './common/services';
import { AuthModule } from './modules/auth';
import { ProductsModule } from './modules/products';
import { WarehousesModule } from './modules/warehouses';
import { CarriersModule } from './modules/carriers';
import { SuppliersModule } from './modules/suppliers';
import { CategoriesModule } from './modules/categories';
import { GroupsModule } from './modules/groups';
import { PermissionsModule } from './modules/permissions';
import { StocksModule } from './modules/stocks';
import { ReceivingsModule } from './modules/receivings';
import { ShipmentsModule } from './modules/shipments';
import { ShippingModule } from './modules/shipping';
import { StocktakingsModule } from './modules/stocktakings';
import { OrdersModule } from './modules/orders';
import { SystemSettingsModule } from './modules/system-settings';
import { AnnouncementsModule } from './modules/announcements';
import { ImportsModule } from './modules/imports/imports.module';
import { AuditModule } from './modules/audit';
import { UserTableColumnWidthsModule } from './modules/user-table-column-widths';
import { ListPaginationSettingsModule } from './modules/list-pagination-settings';
import { ObjectTypesModule } from './modules/object-types/object-types.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AllExceptionsFilter, PrismaExceptionFilter } from './common/filters';
import { PermissionGuard, RequireRoleGuard } from './common/guards';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AuditInterceptor } from './modules/audit';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // グローバル: 30 req / 60s で scrape / brute-force 抑制。
    // 認証・パスワード変更等の高リスク endpoint は controller 側で個別 @Throttle により更に絞る。
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 30,
      },
    ]),
    DatabaseModule,
    DocumentNumberModule,
    CsvModule,
    ExcelModule,
    AuthModule,
    ProductsModule,
    WarehousesModule,
    CarriersModule,
    SuppliersModule,
    CategoriesModule,
    GroupsModule,
    PermissionsModule,
    StocksModule,
    ReceivingsModule,
    ShipmentsModule,
    ShippingModule,
    StocktakingsModule,
    OrdersModule,
    SystemSettingsModule,
    AnnouncementsModule,
    ImportsModule,
    AuditModule,
    UserTableColumnWidthsModule,
    ListPaginationSettingsModule,
    ObjectTypesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // NestJS の Guard 実行順は global → controller → handler。
    // PermissionGuard / RequireRoleGuard は req.user を参照するため、JwtAuthGuard を必ず先に通す。
    // 認証不要 endpoint は @Public() で個別宣言する（auth/login, /health 等）。
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RequireRoleGuard,
    },
    // NestJS selects exception filters in reverse registration order. Register the
    // catch-all first so known Prisma errors reach their specific mapper.
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
