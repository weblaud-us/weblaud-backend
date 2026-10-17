import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TaskController } from './task.controller';
import { TaskProjectController } from './task-project.controller';
import { TaskService } from './task.service';
import { Task, TaskSchema } from './schemas/task.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';
import { NotificationModule } from 'src/modules/notification/notification.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    ClientProjectModule,
    NotificationModule,
  ],
  controllers: [TaskController, TaskProjectController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
