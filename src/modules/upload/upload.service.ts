import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalService } from './service/local.service';
import { S3Service } from './service/s3.service';
import { parseFileSize } from 'src/common/utils/parse-size.util';


@Injectable()
export class UploadService {
  constructor(
    private readonly config: ConfigService,
    private readonly s3Service: S3Service,
    private readonly localService: LocalService,
  ) {}

  private useS3() {
    return this.config.get('FILE_STORAGE') === 's3';
  }


   // Generic upload (auto-switch local ↔ S3)
async upload(file: Express.Multer.File) {
  if (!file) throw new BadRequestException('No file provided');
  
  // Add size validation here too as backup
  const maxSize = parseFileSize(this.config.get('FILE_MAX_SIZE') || '10mb');
  if (file.size > maxSize) {
    throw new BadRequestException(`File too large. Max size is ${this.config.get('FILE_MAX_SIZE')}`);
  }
  
  return this.useS3()
    ? this.s3Service.uploadFile({
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
      })
    : this.localService.uploadLocal(file);
}

  /**
   * User folder structure upload
   */
  async uploadForUser(
    userId: string,
    file: Express.Multer.File,
    type: 'general' | 'images' | 'documents' = 'general',
  ) {
    if (!file) throw new BadRequestException('No file provided');

    return this.useS3()
      ? this.s3Service.uploadToUserFolder({
          userId,
          buffer: file.buffer,
          filename: file.originalname,
          mimeType: file.mimetype,
          type,
        })
      : this.localService.uploadToUserFolder(userId, file, type);
  }

  /**
   * Delete file
   */
  async delete(keyOrPath: string) {
    return this.useS3()
      ? this.s3Service.deleteFile(keyOrPath)
      : this.localService.deleteLocal(keyOrPath);
  }

  async deleteUserFolder(userId: string, type?: string) {
  return this.useS3()
    ? this.s3Service.deleteUserFolder(userId, type)
    : this.localService.deleteUserFolder(userId, type);
}
}
