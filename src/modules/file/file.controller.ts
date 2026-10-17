import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Body,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileService } from './file.service';
import { UpdateFileDto } from './dto/update-file.dto';

/** Flat, id-addressed file edits, deletes, and the authenticated download stream. */
@Controller('portal/files')
export class FileController {
  constructor(private readonly service: FileService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFileDto, @Req() req) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.service.remove(id, req.user);
  }

  /**
   * Streamed server-side from day one — unlike Contract's documentUrl (fixed
   * later, see the audit's Finding 1.2), this is built this way from the
   * start: the raw storage key never reaches the browser, only this
   * access-checked endpoint's bytes do.
   */
  @Get(':id/download')
  async download(@Param('id') id: string, @Req() req, @Res() res: Response) {
    await this.service.streamFile(id, req.user, res);
  }
}
