import { MiddlewareConsumer, Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { ConfigModule } from '@nestjs/config';
import { LocalService } from './service/local.service';
import { S3Service } from './service/s3.service';
import { UploadValidationMiddleware } from './upload.validation';

@Module({
  imports: [ConfigModule],
  controllers: [UploadController],
  providers: [UploadService, S3Service, LocalService],
  exports: [UploadService],
})
export class UploadModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UploadValidationMiddleware).forRoutes(UploadController);
  }
}
