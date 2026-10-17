import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadModule } from '@weblaud/upload-pro';
import { FileController } from './file.controller';
import { FileProjectController } from './file-project.controller';
import { FileService } from './file.service';
import { ProjectFile, ProjectFileSchema } from './schemas/project-file.schema';
import { ClientProjectModule } from 'src/modules/client-project/client-project.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProjectFile.name, schema: ProjectFileSchema },
    ]),
    UploadModule,
    ClientProjectModule,
  ],
  controllers: [FileController, FileProjectController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
