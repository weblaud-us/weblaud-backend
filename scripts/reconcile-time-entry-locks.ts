/**
 * One-off backfill for TimeEntry rows stuck locked by invoices that no
 * longer exist to bill against.
 *
 * TimeEntryService.generateInvoice flips `invoiced: true` the moment an
 * invoice is created from a batch of entries — see the schema comment on
 * TimeEntry.invoiced. InvoiceService.void()/delete() now unlock those
 * entries automatically when the invoice is voided/deleted (added in the
 * same change as this script), but that fix is forward-only: any entry
 * already locked against an invoice that was voided or deleted *before*
 * that fix shipped has no other code path that will ever free it.
 *
 * Finds every TimeEntry with `invoiced: true` whose `invoiceId` points at
 * either a VOID invoice or an invoice that no longer exists at all, and
 * resets it to `invoiced: false` (clearing `invoiceId`) — the same state
 * InvoiceService.void()/delete() now produce going forward.
 *
 * Defaults to a dry run (log only, no writes). Pass --commit to actually
 * write the reset.
 *
 * Run manually (never on app boot):
 *   npx ts-node -r tsconfig-paths/register scripts/reconcile-time-entry-locks.ts
 *   npx ts-node -r tsconfig-paths/register scripts/reconcile-time-entry-locks.ts --commit
 *   (or: npm run reconcile:time-entry-locks -- --commit)
 *
 * Safe to re-run — a second dry run (or commit) after everything's already
 * reconciled simply finds nothing left to do.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { TimeEntry } from '../src/modules/time-entry/schemas/time-entry.schema';
import { Invoice, InvoiceStatus } from '../src/modules/invoice/schemas/invoice.schema';

const logger = new Logger('ReconcileTimeEntryLocks');

async function bootstrap() {
  const commit = process.argv.includes('--commit');

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const timeEntryModel = app.get<Model<any>>(getModelToken(TimeEntry.name));
    const invoiceModel = app.get<Model<any>>(getModelToken(Invoice.name));

    const lockedEntries = await timeEntryModel
      .find({ invoiced: true, invoiceId: { $exists: true } })
      .select('project user date minutes invoiceId')
      .lean();

    if (lockedEntries.length === 0) {
      logger.log('No invoiced time entries found — nothing to check.');
      return;
    }

    const invoiceIds = [...new Set(lockedEntries.map((e) => e.invoiceId.toString()))];
    const invoices = await invoiceModel
      .find({ _id: { $in: invoiceIds } })
      .select('status')
      .lean();
    const statusById = new Map(invoices.map((inv) => [inv._id.toString(), inv.status]));

    const stale = lockedEntries.filter((entry) => {
      const status = statusById.get(entry.invoiceId.toString());
      return status === undefined || status === InvoiceStatus.VOID;
    });

    if (stale.length === 0) {
      logger.log(
        `Checked ${lockedEntries.length} invoiced time ${lockedEntries.length === 1 ? 'entry' : 'entries'} — all point at a live invoice. Nothing to reconcile.`,
      );
      return;
    }

    logger.log(
      `Found ${stale.length} of ${lockedEntries.length} invoiced time ${lockedEntries.length === 1 ? 'entry' : 'entries'} locked against an invoice that's gone or voided:`,
    );
    for (const entry of stale) {
      const status = statusById.get(entry.invoiceId.toString());
      const reason = status === undefined ? 'invoice no longer exists' : `invoice is ${status}`;
      logger.log(
        `  entry ${entry._id} — project ${entry.project}, user ${entry.user}, ${entry.minutes}min on ${new Date(entry.date).toDateString()} — invoice ${entry.invoiceId} (${reason})`,
      );
    }

    if (!commit) {
      logger.log('');
      logger.log('Dry run — no writes made. Re-run with --commit to unlock these entries.');
      return;
    }

    const result = await timeEntryModel.updateMany(
      { _id: { $in: stale.map((e) => e._id) } },
      { invoiced: false, $unset: { invoiceId: 1 } },
    );
    logger.log('');
    logger.log(`Unlocked ${result.modifiedCount} time ${result.modifiedCount === 1 ? 'entry' : 'entries'}.`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  logger.error('Reconciliation failed', err instanceof Error ? err.stack : err);
  process.exit(1);
});
