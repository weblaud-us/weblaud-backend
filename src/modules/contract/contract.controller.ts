import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ContractService } from './contract.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/** Agency-side CRUD. Admin-only — a contract binds the agency's client legally, so drafting/sending/voiding is never a staff action. */
@Controller('contracts')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class ContractController {
  constructor(private readonly service: ContractService) {}

  @Post()
  @UseInterceptors(FileInterceptor('document'))
  create(
    @Body() dto: CreateContractDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req,
  ) {
    return this.service.create(dto, file, req.user._id.toString());
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('document'))
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.service.update(id, dto, file);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @Req() req) {
    return this.service.send(id, req.user._id.toString());
  }

  @Post(':id/void')
  void(@Param('id') id: string, @Req() req) {
    return this.service.void(id, req.user._id.toString());
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
