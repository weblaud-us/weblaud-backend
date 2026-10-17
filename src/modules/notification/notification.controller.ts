import { Controller, Get, Patch, Param, Query, Req } from '@nestjs/common';
import { NotificationService } from './notification.service';

/** Portal in-app notification center. Every logged-in user (client or staff) reads only their own — scoped by req.user._id, not by role. */
@Controller('portal/notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  findMine(@Req() req, @Query('unread') unread?: string) {
    return this.service.findForUser(req.user._id.toString(), unread === 'true');
  }

  /** Cheap poll target for the bell badge — see PortalLayout's polling effect. Avoids re-fetching all 100 rows just to know the count changed. */
  @Get('count')
  countUnread(@Req() req) {
    return this.service
      .countUnread(req.user._id.toString())
      .then((unread) => ({ unread }));
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @Req() req) {
    return this.service.markRead(req.user._id.toString(), id);
  }

  @Patch('read-all')
  markAllRead(@Req() req) {
    return this.service.markAllRead(req.user._id.toString());
  }
}
