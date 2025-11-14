import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UploadService } from '../upload/upload.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly uploadService: UploadService,
  ) {}

  // Extract URL or path safely
  private getFileUrl(result: any): string | undefined {
    if (!result) return undefined;
    if (result.url) return result.url; // S3
    if (result.path) return result.path; // Local
    return undefined;
  }

  // CREATE SERVICE WITH IMAGE
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  @UseInterceptors(FileInterceptor('image'))
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateServiceDto,
  ) {
    let uploadedImage: string | undefined;

    if (file) {
      const result = await this.uploadService.upload(file);
      uploadedImage = this.getFileUrl(result);
    }

    return this.servicesService.create({
      ...dto,
      image: uploadedImage ?? dto.image, // no null
    });
  }

  // GET ALL SERVICES
  @Public()
  @Get()
  findAll() {
    return this.servicesService.findAll();
  }

  // GET ONE SERVICE
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  // UPDATE SERVICE WITH OPTIONAL NEW IMAGE
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Put(':id')
  @UseInterceptors(FileInterceptor('image'))
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const existing = await this.servicesService.findOne(id);

    let newImage: string | undefined = dto.image;

    if (file) {
      const result = await this.uploadService.upload(file);
      newImage = this.getFileUrl(result);

      // delete previous image if exists
      if (existing.image) {
        this.uploadService.delete(existing.image).catch(() => {});
      }
    }

    return this.servicesService.update(id, {
      ...dto,
      image: newImage,
    });
  }

  // DELETE SERVICE + DELETE IMAGE
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.servicesService.findOne(id);

    const response = await this.servicesService.remove(id);

    if (existing.image) {
      this.uploadService.delete(existing.image).catch(() => {});
    }

    return response;
  }
}
