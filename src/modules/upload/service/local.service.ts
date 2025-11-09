import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LocalService {
  constructor(private readonly config: ConfigService) {}

  private resolvePath(...segments: string[]) {
    const base = this.config.get('LOCAL_UPLOAD_PATH') || './uploads';
    return path.join(base, ...segments);
  }

  //  Upload file locally
  async uploadLocal(file: Express.Multer.File, folder = 'uploads') {
    const uploadPath = this.resolvePath(folder);

    if (!fs.existsSync(uploadPath))
      fs.mkdirSync(uploadPath, { recursive: true });

    const filename = `${Date.now()}-${file.originalname}`;
    const filepath = path.join(uploadPath, filename);

    fs.writeFileSync(filepath, file.buffer);

    return {
      storage: 'local',
      path: filepath,
    };
  }

  //  Upload to user folder
  async uploadToUserFolder(
    userId: string,
    file: Express.Multer.File,
    type: 'general' | 'images' | 'documents' = 'general',
  ) {
    const folder = `user-uploads/${userId}/${type}`;
    return this.uploadLocal(file, folder);
  }

  // Delete file from local storage
  async deleteLocal(filepath: string) {
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException('File not found');
    }

    fs.unlinkSync(filepath);
    return { deleted: true };
  }

  // Delete user folder
   async deleteUserFolder(userId: string, type?: string) {
    const folder = type
      ? this.resolvePath(`user-uploads/${userId}/${type}`)
      : this.resolvePath(`user-uploads/${userId}`);

    if (!fs.existsSync(folder)) {
      throw new NotFoundException('Folder not found');
    }

    fs.rmSync(folder, { recursive: true, force: true });
    return { deleted: true };
  }
}
