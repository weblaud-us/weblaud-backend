import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { envConfig } from './config/env.config';
import { validateEnv } from './config/env.validation';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { DomainModule } from 'src/modules/domain.module';
import { DatabaseModule } from './modules/database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    //  Global environment config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
      envFilePath: '.env',
      // Refuses to boot on missing, placeholder or contradictory config
      // rather than failing later at request time. See env.validation.ts.
      validate: validateEnv,
    }),

    //  Centralized DatabaseModule (MongoDB connection)
    DatabaseModule,

    // Rate limiting. Reads THROTTLE_TTL / THROTTLE_LIMIT, which were previously
    // parsed into config and then ignored in favour of hardcoded values — so
    // tuning them had no effect. Individual routes tighten this with @Throttle;
    // this is only the ceiling for everything else.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('throttle.ttl', 60000),
          limit: config.get<number>('throttle.limit', 100),
        },
      ],
    }),

    //  Main domain module (your app's endpoints)
    DomainModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    //  Global JWT Auth Guard
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    //  Global Rate Limit Guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
