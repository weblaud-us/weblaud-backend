import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { UsersModule } from 'src/modules/users/users.module';
import { DatabaseModule } from './database/database.module';
import { UploadModule } from './upload/upload.module';
import { MailModule } from './mail/mail.module';
import { ServicesModule } from './services/services.module';
import { ProjectModule } from './project/project.module';
import { CareerModule } from './career/career.module';
import { TestimonialsModule } from 'src/modules/testimonial/testimonial.module';
import { ContactModule } from './contact/contact.module';
import { ContactInfoModule } from './contact-info/contact-info.module';
import { AboutInfoModule } from './about/about.module';
import { TeamModule } from './team/team.module';


@Module({
  imports: [
    AuthModule,
    UsersModule,
    DatabaseModule,
    UploadModule,
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
