import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const region = this.requireEnv('AWS_REGION');
    const accessKeyId = this.requireEnv('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.requireEnv('AWS_SECRET_ACCESS_KEY');
    this.bucket = this.requireEnv('AWS_S3_BUCKET');

    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  private requireEnv(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  // Upload file to S3
  async uploadFile({
    buffer,
    filename,
    mimeType,
    folder = 'uploads',
  }: {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    folder?: string;
  }) {
    const key = `${folder}/${randomUUID()}-${filename}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          // ACL: 'public-read',
        }),
      );

      return {
        storage: 's3',
        key,
        url: `https://${this.bucket}.s3.${this.config.get(
          'AWS_REGION',
        )}.amazonaws.com/${key}`,
      };
    } catch (error) {
      console.error('S3 Upload Error:', error);
      throw new InternalServerErrorException('Failed to upload to S3');
    }
  }

  /**
   * Upload file inside user-specific folder
   * e.g. user-uploads/123/images/<uuid>-file.png
   */
  async uploadToUserFolder({
    userId,
    buffer,
    filename,
    mimeType,
    type = 'general',
  }: {
    userId: string;
    buffer: Buffer;
    filename: string;
    mimeType: string;
    type?: 'images' | 'documents' | 'general';
  }) {
    const folder = `user-uploads/${userId}/${type}`;
    return this.uploadFile({
      buffer,
      filename,
      mimeType,
      folder,
    });
  }

  // Delete file from S3 bucket
  async deleteFile(key: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return { deleted: true };
    } catch (error) {
      console.error('S3 Delete Error:', error);
      throw new InternalServerErrorException('Failed to delete file');
    }
  }

  // Check if object exists before deleting
  async ensureFileExists(key: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (e) {
      throw new NotFoundException('File not found in S3');
    }
  }

  // Delete a user's folder recursively
async deleteUserFolder(userId: string, type?: string) {
  const prefix = type
    ? `user-uploads/${userId}/${type}`
    : `user-uploads/${userId}`;

  try {
    const list = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      }),
    );

    if (!list.Contents || list.Contents.length === 0) {
      return { deleted: false, message: 'Folder already empty' }; // Don't throw error
    }

    // Consider using DeleteObjectsCommand for batch deletion (more efficient)
    const deletePromises = list.Contents.map(obj => 
      this.deleteFile(obj.Key!)
    );
    
    await Promise.all(deletePromises);
    
    return { deleted: true, files: list.Contents.length };
  } catch (error) {
    console.error('S3 Delete Folder Error:', error);
    throw new InternalServerErrorException('Failed to delete folder');
  }
}
}
