import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { BookingsModule } from 'src/modules/booking/booking.module';
import { UsersModule } from 'src/modules/users/users.module';
import { DatabaseModule } from './database/database.module';
import { UploadModule } from './upload/upload.module';
import { MailModule } from './mail/mail.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [AuthModule, UsersModule, BookingsModule, DatabaseModule, UploadModule, MailModule, ServicesModule],
})
export class DomainModule {}
