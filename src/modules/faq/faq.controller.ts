import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';
import { FaqService } from './faq.service';
import { Public } from 'src/common/decorators/public.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

@Controller('faqs')
export class FaqController {
  constructor(private readonly service: FaqService) {}

  // PUBLIC API (for front-end FAQ section)
  @Public()
  @Get()
  getPublicFaqs() {
    return this.service.findAllPublic();
  }

  // ADMIN — paginated list
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  getAdminFaqs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findAllAdmin(page, limit);
  }

  // ADMIN — create
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateFaqDto) {
    return this.service.create(dto);
  }

  // ADMIN — update
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return this.service.update(id, dto);
  }

  // ADMIN — delete
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
