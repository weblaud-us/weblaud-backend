import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express'; // Import this
import { AppModule } from './app.module';
import helmet from 'helmet';
import compression from 'compression';
import { HttpExceptionFilter } from './common/exceptions/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // 1. Pass NestExpressApplication generic to access Express specific methods
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const environment = configService.get('NODE_ENV', 'development');
  const port = configService.get('PORT', 3000);
  const isProduction = environment === 'production';

  // 2. Trust Proxy (CRITICAL for Nginx + Cloudflare)
  // This tells NestJS to trust the 'X-Forwarded-For' header set by Nginx
  if (isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());

  // 3. CORS
  if (!isProduction) {
    app.enableCors({ origin: true, credentials: true });
    logger.log('⚠️  Running in Development mode - CORS Open');
  } else {
    const allowedOrigins = configService
      .get<string>('CORS_ORIGINS')
      ?.split(',')
      .map((o) => o.trim());

    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins?.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn(`🚫 Blocked CORS request from: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      maxAge: 3600,
    });
  }

  // Compression
  app.use(compression());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      disableErrorMessages: isProduction,
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map((error) => ({
          property: error.property,
          constraints: error.constraints,
          children: isProduction ? undefined : error.children,
        }));
        return new HttpException(
          { message: formattedErrors, error: 'Bad Request' },
          HttpStatus.BAD_REQUEST,
        );
      },
    }),
  );

  // Global filters and interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // API prefix
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`🚀 Application is running on: ${await app.getUrl()}/api/v1`);
}

bootstrap();
