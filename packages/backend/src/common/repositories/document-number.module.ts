import { Global, Module } from '@nestjs/common';
import { DocumentNumberRepository } from './document-number.repository';

@Global()
@Module({
  providers: [DocumentNumberRepository],
  exports: [DocumentNumberRepository],
})
export class DocumentNumberModule {}
