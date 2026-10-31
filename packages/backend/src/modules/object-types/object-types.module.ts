import { Module } from '@nestjs/common';
import { ObjectTypesController } from './object-types.controller';
import { ObjectTypesIntegrationController } from './object-types.integration.controller';
import { ObjectTypesService } from './object-types.service';
import { ObjectTypesRepository } from './repositories/object-types.repository';
import { PermissionsModule } from '../permissions';

@Module({
  imports: [PermissionsModule],
  controllers: [ObjectTypesController, ObjectTypesIntegrationController],
  providers: [ObjectTypesService, ObjectTypesRepository],
  exports: [ObjectTypesService],
})
export class ObjectTypesModule {}
