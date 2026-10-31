import { PartialType } from '@nestjs/swagger';
import { CreateAnnouncementDto } from './create-announcement.dto';

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto, {
  // null は入れられない値として各 validator に落とし、undefined（未指定）だけ許す。
  skipNullProperties: false,
}) {}
