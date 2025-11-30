import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DatabaseModule } from './database/database.module';
import { UploadModule } from '@weblaud/upload-pro';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from './mail/mail.module';
import { ServicesModule } from './services/services.module';
import { ProjectModule } from './project/project.module';
import { CareerModule } from './career/career.module';
import { TestimonialsModule } from './testimonial/testimonial.module';
import { ContactModule } from './contact/contact.module';
import { ContactInfoModule } from './contact-info/contact-info.module';
import { AboutInfoModule } from './about/about.module';
import { TeamModule } from './team/team.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    DatabaseModule,
    UploadModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        driver: config.get('FILE_STORAGE') === 's3' ? 's3' : 'local',
        maxSize: config.get('FILE_MAX_SIZE') || '10mb',
        allowedTypes: config.get('FILE_ALLOWED_TYPES')?.split(','),
        localConfig: {
          destination: config.get('LOCAL_UPLOAD_PATH') || './uploads',
        },
        s3Config: {
          accessKeyId: config.get('AWS_ACCESS_KEY_ID') || '',
          secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY') || '',
          region: config.get('AWS_REGION') || '',
          bucket: config.get('AWS_S3_BUCKET') || '',
        },
      }),
    }),
    MailModule,
    ServicesModule,
    ProjectModule,
    CareerModule,
    TestimonialsModule,
    ContactModule,
    ContactInfoModule,
    AboutInfoModule,
    TeamModule,
  ],
})
export class DomainModule {}
