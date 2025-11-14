import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Post('submit')
  submit(@Body() dto: CreateContactDto) {
    return this.contactService.submit(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  getAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.contactService.findAll(page, limit);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/read')
  markRead(@Param('id') id: string) {
    return this.contactService.markRead(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/:id')
  delete(@Param('id') id: string) {
    return this.contactService.delete(id);
  }
}
