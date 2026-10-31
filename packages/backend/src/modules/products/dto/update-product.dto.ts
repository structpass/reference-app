import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto, {
  // null は入れられない値として各 validator に落とし、undefined（未指定）だけ許す。
  skipNullProperties: false,
}) {}
