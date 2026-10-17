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
import { SeedModule } from './seed/seed.module';
import { InsightModule } from './insights/insight.module';
import { CalculatorConfigModule } from './calculator-config/calculator-config.module';
import { EstimatesModule } from './estimates/estimates.module';
import { AuditsModule } from './audits/audits.module';
import { FaqModule } from './faq/faq.module';
import { OrganizationModule } from './organization/organization.module';
import { ClientProjectModule } from './client-project/client-project.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { CounterModule } from './counter/counter.module';
import { NotificationModule } from './notification/notification.module';
import { ProjectUpdateModule } from './project-update/project-update.module';
import { UpdateRequestModule } from './update-request/update-request.module';
import { ContractModule } from './contract/contract.module';
import { ChangeRequestModule } from './change-request/change-request.module';
import { ApprovalModule } from './approval/approval.module';
import { InvoiceModule } from './invoice/invoice.module';
import { PaymentModule } from './payment/payment.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { FeatureModule } from './feature/feature.module';
import { TaskModule } from './task/task.module';
import { FileModule } from './file/file.module';
import { CommentModule } from './comment/comment.module';
import { TimeEntryModule } from './time-entry/time-entry.module';
import { DigestModule } from './digest/digest.module';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    DatabaseModule,
    SeedModule,
    UploadModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const fileStorage = config.get('FILE_STORAGE');
        const driver =
          fileStorage === 's3' || fileStorage === 'cloudinary'
            ? fileStorage
            : 'local';

        return {
          driver,
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
          cloudinaryConfig: {
            cloudName: config.get('CLOUDINARY_CLOUD_NAME') || '',
            apiKey: config.get('CLOUDINARY_API_KEY') || '',
            apiSecret: config.get('CLOUDINARY_API_SECRET') || '',
          },
        };
      },
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
    InsightModule,
    CalculatorConfigModule,
    EstimatesModule,
    AuditsModule,
    FaqModule,
    OrganizationModule,
    ClientProjectModule,
    AuditLogModule,
    CounterModule,
    NotificationModule,
    ProjectUpdateModule,
    UpdateRequestModule,
    ContractModule,
    ChangeRequestModule,
    ApprovalModule,
    InvoiceModule,
    PaymentModule,
    AnalyticsModule,
    DashboardModule,
    FeatureModule,
    TaskModule,
    FileModule,
    CommentModule,
    TimeEntryModule,
    DigestModule,
    MonitoringModule,
  ],
})
export class DomainModule {}
