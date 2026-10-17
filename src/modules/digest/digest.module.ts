import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectDigestService } from './project-digest.service';
import {
  ClientProject,
  ClientProjectSchema,
} from 'src/modules/client-project/schemas/client-project.schema';
import { Task, TaskSchema } from 'src/modules/task/schemas/task.schema';
import {
  ProjectUpdate,
  ProjectUpdateSchema,
} from 'src/modules/project-update/schemas/project-update.schema';
import {
  ProjectFile,
  ProjectFileSchema,
} from 'src/modules/file/schemas/project-file.schema';
import {
  Invoice,
  InvoiceSchema,
} from 'src/modules/invoice/schemas/invoice.schema';
import { DashboardModule } from 'src/modules/dashboard/dashboard.module';
import { UsersModule } from 'src/modules/users/users.module';
import { MailModule } from 'src/modules/mail/mail.module';

/** The Monday client email — see ProjectDigestService. No controller. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ClientProject.name, schema: ClientProjectSchema },
      { name: Task.name, schema: TaskSchema },
      { name: ProjectUpdate.name, schema: ProjectUpdateSchema },
      { name: ProjectFile.name, schema: ProjectFileSchema },
      { name: Invoice.name, schema: InvoiceSchema },
    ]),
    DashboardModule,
    UsersModule,
    MailModule,
  ],
  providers: [ProjectDigestService],
})
export class DigestModule {}
