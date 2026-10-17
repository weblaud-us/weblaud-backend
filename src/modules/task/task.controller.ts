import { Body, Controller, Delete, Param, Patch, Req } from '@nestjs/common';
import { TaskService } from './task.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ReorderTasksDto } from './dto/reorder-tasks.dto';

/** Flat, id-addressed task edits — plus reorder, which spans many tasks at once so it doesn't fit a single :id route. */
@Controller('portal/tasks')
export class TaskController {
  constructor(private readonly service: TaskService) {}

  // Must come before ':id' below, or "reorder" would be parsed as a task id.
  @Patch('reorder')
  reorder(@Body() dto: ReorderTasksDto, @Req() req) {
    return this.service.reorder(dto, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @Req() req) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.service.remove(id, req.user);
  }
}
