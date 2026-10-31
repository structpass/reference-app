import { PartialType } from '@nestjs/swagger';
import { CreateSupplierDto } from './create-supplier.dto';

export class UpdateSupplierDto extends PartialType(CreateSupplierDto, {
  // null は入れられない値として各 validator に落とし、undefined（未指定）だけ許す。
  skipNullProperties: false,
}) {}
