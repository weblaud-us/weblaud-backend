import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TimeEntryController } from './time-entry.controller';
import { TimeEntryProjectController } from './time-entry-project.controller';
import { TimeEntryService } from './time-entry.service';
import { TimeEntry, TimeEntrySchema } from './schemas/time-entry.schema';
import {
  ClientProject,
  ClientProjectSchema,
} from 'src/modules/client-project/schemas/client-project.schema';
import { User, UserSchema } from 'src/modules/users/schemas/user.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';
import { InvoiceModule } from 'src/modules/invoice/invoice.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TimeEntry.name, schema: TimeEntrySchema },
      // Schema only, not their full modules — same reasoning as
      // CommentModule's Task/ProjectFile registration: a read-only lookup
      // (project's org/budget.currency, a user's costRate/billRate) doesn't
      // need the whole module's providers/controllers.
      { name: ClientProject.name, schema: ClientProjectSchema },
      { name: User.name, schema: UserSchema },
    ]),
    ClientProjectModule,
    InvoiceModule,
  ],
  controllers: [TimeEntryController, TimeEntryProjectController],
  providers: [TimeEntryService],
  exports: [TimeEntryService],
})
export class TimeEntryModule {}
