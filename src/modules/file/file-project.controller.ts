import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileService } from './file.service';
import { UploadFileDto } from './dto/upload-file.dto';

/** Nested under a project: list/upload files for it. */
@Controller('portal/projects/:projectId/files')
export class FileProjectController {
  constructor(private readonly service: FileService) {}

  @Get()
  findForProject(@Param('projectId') projectId: string, @Req() req) {
    return this.service.findForProject(projectId, req.user);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
    @Req() req,
  ) {
    return this.service.upload(projectId, file, dto, req.user);
  }
}
