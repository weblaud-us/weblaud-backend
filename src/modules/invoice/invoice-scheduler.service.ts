import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceService } from './invoice.service';

/**
 * Thin orchestration layer — the actual business logic (what counts as
 * overdue, how a retainer clone is built) lives on InvoiceService so it's
 * unit-testable without a fake clock/cron trigger. This class only owns
 * "when do these run".
 */
@Injectable()
export class InvoiceSchedulerService {
  private readonly logger = new Logger(InvoiceSchedulerService.name);

  constructor(private readonly invoices: InvoiceService) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleOverdueReminders() {
    try {
      const count = await this.invoices.sendOverdueReminders();
      if (count)
        this.logger.log(`Sent overdue reminders for ${count} invoice(s)`);
    } catch (err) {
      this.logger.error(
        'Overdue reminder job failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleRetainerGeneration() {
    try {
      const count = await this.invoices.generateDueRetainers();
      if (count) this.logger.log(`Generated ${count} retainer invoice(s)`);
    } catch (err) {
      this.logger.error(
        'Retainer generation job failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
