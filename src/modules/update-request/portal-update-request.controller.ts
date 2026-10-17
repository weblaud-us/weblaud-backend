import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { UpdateRequestService } from './update-request.service';
import { CloseUpdateRequestDto } from './dto/close-update-request.dto';

@Controller('portal/update-requests')
export class PortalUpdateRequestController {
  constructor(private readonly service: UpdateRequestService) {}

  @Post(':id/close')
  close(
    @Param('id') id: string,
    @Body() dto: CloseUpdateRequestDto,
    @Req() req,
  ) {
    return this.service.close(id, dto, req.user);
  }
}
