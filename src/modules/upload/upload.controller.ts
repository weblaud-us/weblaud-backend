import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * Regular upload
   */
  @UseGuards(JwtAuthGuard)
  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.upload(file);
  }

  /**
   * Upload for user
   */
  @Post('user/:userId/:type')
  @UseInterceptors(FileInterceptor('file'))
  uploadForUser(
    @Param('userId') userId: string,
    @Param('type') type: 'general' | 'images' | 'documents',
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Validate userId format if needed
    if (!userId.match(/^[a-zA-Z0-9_-]+$/)) {
      throw new BadRequestException('Invalid user ID format');
    }

    const allowedTypes = ['general', 'images', 'documents'];
    if (!allowedTypes.includes(type)) {
      throw new BadRequestException(
        `Type must be one of: ${allowedTypes.join(', ')}`,
      );
    }

    return this.uploadService.uploadForUser(userId, file, type);
  }

  /**
   * Delete file
   */
  @UseGuards(JwtAuthGuard)
  @Delete()
  delete(@Body('key') keyOrPath: string) {
    return this.uploadService.delete(keyOrPath);
  }

@UseGuards(JwtAuthGuard)
@Delete('user/:userId')
deleteUserFolder(
  @Param('userId') userId: string,
  @Query('type') type?: 'general' | 'images' | 'documents',
) {
  if (type) {
    const allowedTypes = ['general', 'images', 'documents'];
    if (!allowedTypes.includes(type)) {
      throw new BadRequestException(`Type must be one of: ${allowedTypes.join(', ')}`);
    }
  }
  
  return this.uploadService.deleteUserFolder(userId, type);
}
}
