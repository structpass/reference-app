import { PartialType } from '@nestjs/swagger';
import { CreateWarehouseDto } from './create-warehouse.dto';

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto, {
  // null は入れられない値として各 validator に落とし、undefined（未指定）だけ許す。
  skipNullProperties: false,
}) {}
