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
import { clientContextMiddleware } from './common/utils/client-context.util';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // 1. Pass NestExpressApplication generic to access Express specific methods.
  // rawBody: true populates request.rawBody (a Buffer) on every request
  // alongside the normal parsed body — the Stripe webhook handler needs the
  // exact raw bytes to verify the signature; a re-serialized JSON body would
  // not byte-match what Stripe signed and every event would be rejected.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const environment = configService.get('NODE_ENV', 'development');
  const port = configService.get('PORT', 3000);
  const isProduction = environment === 'production';

  logger.log(`Environment: ${environment}`);
  logger.log(`Is Production: ${isProduction}`);

  // 2. Trust Proxy (CRITICAL for Nginx + Cloudflare)
  // This tells NestJS to trust the 'X-Forwarded-For' header set by Nginx
  if (isProduction) {
    app.set('trust proxy', 1);
  }

  // Stamps req.clientIp / req.clientUa — the real visitor behind the
  // website's server-to-server calls. Must run before any guard (the
  // throttler keys on it). See client-context.util.ts.
  const internalSecret = configService.get<string>('internal.apiSecret');
  if (isProduction && !internalSecret) {
    logger.warn(
      'INTERNAL_API_SECRET is not set — forwarded visitor IPs are ignored, so rate limits and contract-acceptance records see the website server instead of the visitor.',
    );
  }
  app.use(clientContextMiddleware(internalSecret));

  if (isProduction) {
    app.use(helmet());
  } else {
    // Relax helmet in development
    app.use(
      helmet({
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: false,
      }),
    );
  }

  // 3. CORS
  if (!isProduction) {
    app.enableCors({
      origin: true, // Allow all origins in development
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
      ],
      exposedHeaders: ['Authorization'],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });
    logger.log('Running in Development mode - CORS fully enabled');
  } else {
    // Empty entries are filtered out: ''.split(',') yields [''], which would
    // otherwise read as a configured-but-unmatchable allowlist. validateEnv
    // guarantees this is non-empty in production.
    const allowedOrigins = (configService.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    logger.log(`CORS allowlist: ${allowedOrigins.join(', ')}`);

    app.enableCors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
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
  app.useGlobalFilters(new HttpExceptionFilter(isProduction));
  app.useGlobalInterceptors(new ResponseInterceptor());

  // API prefix
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  // await app.listen(port);
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 Application is running on: ${await app.getUrl()}/api/v1`);
}

bootstrap();
