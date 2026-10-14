import { PartialType } from '@nestjs/swagger';
import { CreateCarrierDto } from './create-carrier.dto';

export class UpdateCarrierDto extends PartialType(CreateCarrierDto, {
  // null は入れられない値として各 validator に落とし、undefined（未指定）だけ許す。
  skipNullProperties: false,
}) {}
