import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('database')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get('health')
  @Public()
  async healthCheck() {
    return await this.databaseService.health();
  }
}
