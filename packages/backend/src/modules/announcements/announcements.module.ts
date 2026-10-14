import { Module } from '@nestjs/common';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsRepository } from './repositories/announcements.repository';
import { AnnouncementStorageService } from './storage/announcement-storage.service';

@Module({
  imports: [SystemSettingsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AnnouncementsRepository, AnnouncementStorageService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
