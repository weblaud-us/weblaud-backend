/**
 * Sends the weekly client digest right now, instead of waiting for Monday
 * 08:00 UTC — for checking the email locally (it lands in Mailpit).
 *
 *   pnpm digest:local            # same rules as the real run (once per week)
 *   pnpm digest:local -- --force # forget this week's run first, so it sends again
 *
 * Local only: refuses unless MONGODB_URI is on this machine, the same guard
 * as scripts/local.js.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { ProjectDigestService } from '../src/modules/digest/project-digest.service';
import { ClientProject } from '../src/modules/client-project/schemas/client-project.schema';

const logger = new Logger('SendDigestNow');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const uri = String(process.env.MONGODB_URI ?? '');
    if (!/^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(uri)) {
      throw new Error('Refusing to send digests from a non-local database');
    }

    if (process.argv.includes('--force')) {
      const projects = app.get<Model<any>>(getModelToken(ClientProject.name));
      const { modifiedCount } = await projects.updateMany(
        {},
        { $unset: { lastDigestAt: 1 } },
      );
      logger.log(`--force: cleared lastDigestAt on ${modifiedCount} project(s)`);
    }

    const sent = await app.get(ProjectDigestService).sendWeeklyDigests();
    logger.log(`Sent ${sent} digest email(s) — open http://localhost:8025 to read them.`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  logger.error('Digest run failed', err instanceof Error ? err.stack : err);
  process.exit(1);
});
