import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ContactInfoService } from './contact-info.service';
import { UpdateContactInfoDto } from './dto/update-contact-info.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';

@Controller('contact-info')
export class ContactInfoController {
  constructor(private readonly service: ContactInfoService) {}

  // PUBLIC — frontend contact section
  @Public()
  @Get()
  getPublicInfo() {
    return this.service.getInfo();
  }

  // ADMIN — update contact info
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch()
  update(@Body() dto: UpdateContactInfoDto) {
    return this.service.updateInfo(dto);
  }
}
