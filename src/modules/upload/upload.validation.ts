import {
  BadRequestException,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { parseFileSize } from 'src/common/utils/parse-size.util';


@Injectable()
export class UploadValidationMiddleware implements NestMiddleware {
  private allowedExtensions: string[];
  private maxSize: number;

  constructor(private readonly config: ConfigService) {
    this.allowedExtensions = (this.config
      .get('FILE_ALLOWED_TYPES')
      ?.split(',') || ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'pdf'])
      .map((e) => e.trim().toLowerCase());

    //  Human-readable size: 10mb → bytes
    this.maxSize = parseFileSize(this.config.get('FILE_MAX_SIZE') || '10mb', 10 * 1024 * 1024);
  }

  use(req: Request, res: Response, next: NextFunction) {
    const file = (req as any).file;
    if (!file) return next();

    //  Check size
    if (file.size > this.maxSize) {
      throw new BadRequestException(
        `File too large. Max size is ${this.config.get('FILE_MAX_SIZE')}`,
      );
    }

    //  Check extension
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !this.allowedExtensions.includes(extension)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: ${this.allowedExtensions.join(', ')}`,
      );
    }

    next();
  }
}
