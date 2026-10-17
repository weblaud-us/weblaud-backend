import { Controller, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enum/user.role.enum';

/**
 * Lets an admin prove error monitoring works end to end: this always
 * fails with a 500, which HttpExceptionFilter reports to Sentry (when
 * SENTRY_DSN is set). Triggered from the site's /cpadmin/sentry-test page.
 */
@Controller('monitoring')
export class MonitoringController {
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('test-error')
  testError(): never {
    throw new Error(
      'Sentry test error from the backend — sent on purpose from /cpadmin/sentry-test',
    );
  }
}
