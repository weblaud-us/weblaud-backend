import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Get,
  UseGuards,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateTeamMemberDto } from './dto/create-team.dto';
import { UpdateTeamMemberDto } from './dto/update-team.dto';
import { UploadService } from '@weblaud/upload-pro';

@Controller('team')
export class TeamController {
  constructor(
    private readonly service: TeamService,
    private readonly uploadService: UploadService,
  ) {}

  // Public
  @Public()
  @Get()
  getPublic() {
    return this.service.findPublic();
  }

  // Admin
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  getAdmin() {
    return this.service.findAdmin();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  @UseInterceptors(FileInterceptor('avatar'))
  async create(
    @Body() dto: CreateTeamMemberDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.service.createWithAvatar(dto, avatar);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('avatar'))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.service.update(id, dto, avatar);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
