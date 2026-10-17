import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommentController } from './comment.controller';
import { CommentProjectController } from './comment-project.controller';
import { CommentTaskController } from './comment-task.controller';
import { CommentFileController } from './comment-file.controller';
import { CommentService } from './comment.service';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { Task, TaskSchema } from 'src/modules/task/schemas/task.schema';
import {
  ProjectFile,
  ProjectFileSchema,
} from 'src/modules/file/schemas/project-file.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { UsersModule } from 'src/modules/users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Comment.name, schema: CommentSchema },
      // Schema only, not TaskModule/FileModule — this only ever does a
      // read-only lookup to resolve which project a task/file belongs to
      // and (for files) its visibility; pulling in the full modules would
      // be needless coupling for that. Mirrors InvoiceModule registering
      // Payment's schema directly for the same reason.
      { name: Task.name, schema: TaskSchema },
      { name: ProjectFile.name, schema: ProjectFileSchema },
    ]),
    ClientProjectModule,
    NotificationModule,
    // CommentService.filterReaders — only users who can read a comment get
    // notified about it.
    UsersModule,
  ],
  controllers: [
    CommentController,
    CommentProjectController,
    CommentTaskController,
    CommentFileController,
  ],
  providers: [CommentService],
  exports: [CommentService],
})
export class CommentModule {}
