import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CalculatorConfigService } from './calculator-config.service';
import { UpdateCalculatorConfigDto } from './dto/update-calculator-config.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

@Controller('calculator-config')
export class CalculatorConfigController {
  constructor(private readonly service: CalculatorConfigService) {}

  @Public()
  @Get()
  getPublic() {
    return this.service.getPublic();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch()
  update(@Body() dto: UpdateCalculatorConfigDto) {
    return this.service.update(dto);
  }
}
