import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';

/** Admin-only check that error reporting reaches Sentry. */
@Module({ controllers: [MonitoringController] })
export class MonitoringModule {}
