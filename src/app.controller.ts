import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { DatabaseService } from './modules/database/database.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  healthCheck() {
    const memoryUsage = process.memoryUsage();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: this.databaseService.health(),
      system: {
        uptime: process.uptime(),
        memory: {
          rss: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100 + ' MB',
          heapTotal:
            Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100 +
            ' MB',
          heapUsed:
            Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100 +
            ' MB',
        },
      },
    };
  }
}
