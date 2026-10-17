/**
 * One-off reconciliation for ClientProject.budget.spent — the denormalized
 * "sum of paid invoices" running total (see the schema comment on
 * ProjectBudget.spent).
 *
 * ClientProjectService.update() used to write `budget` as a whole nested
 * object, which Mongoose replaces wholesale — so any admin edit to a
 * project's name/status/team/etc. that also carried `budget: {amount,
 * currency}` (the admin form always sends both) silently reset `spent`
 * back to 0, discarding every payment recorded up to that point. That's
 * fixed now (update() flattens the write into `budget.amount`/
 * `budget.currency` dot-paths instead), but existing data may already be
 * wrong from before the fix.
 *
 * Recomputes the true figure — Σ succeeded Payments across every Invoice
 * belonging to each project — and compares it against the stored value.
 *
 * Defaults to a dry run (log only, no writes). Pass --commit to actually
 * correct budget.spent to the recomputed figure.
 *
 * Run manually (never on app boot):
 *   npx ts-node -r tsconfig-paths/register scripts/reconcile-budget-spent.ts
 *   npx ts-node -r tsconfig-paths/register scripts/reconcile-budget-spent.ts --commit
 *   (or: npm run reconcile:budget-spent -- --commit)
 *
 * Safe to re-run — a second dry run (or commit) after everything already
 * matches simply finds nothing left to correct.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { Payment, PaymentStatus } from '../src/modules/payment/schemas/payment.schema';
import { ClientProject } from '../src/modules/client-project/schemas/client-project.schema';

const logger = new Logger('ReconcileBudgetSpent');

interface PaidByProject {
  _id: string; // project id
  totalPaid: number;
}

async function bootstrap() {
  const commit = process.argv.includes('--commit');

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const paymentModel = app.get<Model<any>>(getModelToken(Payment.name));
    const projectModel = app.get<Model<any>>(getModelToken(ClientProject.name));

    const paidRows = await paymentModel.aggregate<PaidByProject>([
      { $match: { status: PaymentStatus.SUCCEEDED } },
      {
        $lookup: {
          from: 'invoices',
          localField: 'invoice',
          foreignField: '_id',
          as: 'inv',
        },
      },
      { $unwind: '$inv' },
      { $group: { _id: '$inv.project', totalPaid: { $sum: '$amount' } } },
    ]);
    const totalPaidByProject = new Map(paidRows.map((r) => [r._id.toString(), r.totalPaid]));

    const projects = await projectModel
      .find()
      .select('name budget.spent')
      .lean();

    const mismatches = projects
      .map((project) => {
        const correct = Math.round((totalPaidByProject.get(project._id.toString()) ?? 0) * 100) / 100;
        const current = project.budget?.spent ?? 0;
        return { project, current, correct };
      })
      .filter(({ current, correct }) => Math.abs(current - correct) > 0.005);

    if (mismatches.length === 0) {
      logger.log(`Checked ${projects.length} projects — budget.spent already matches Σ succeeded payments for all of them.`);
      return;
    }

    logger.log(`Found ${mismatches.length} of ${projects.length} projects with a stale budget.spent:`);
    for (const { project, current, correct } of mismatches) {
      logger.log(`  ${project.name} (${project._id}) — stored ${current}, should be ${correct}`);
    }

    if (!commit) {
      logger.log('');
      logger.log('Dry run — no writes made. Re-run with --commit to correct these.');
      return;
    }

    for (const { project, correct } of mismatches) {
      await projectModel.updateOne({ _id: project._id }, { $set: { 'budget.spent': correct } });
    }
    logger.log('');
    logger.log(`Corrected budget.spent on ${mismatches.length} projects.`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  logger.error('Reconciliation failed', err instanceof Error ? err.stack : err);
  process.exit(1);
});
