import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface RecordAuditEntryInput {
  actor: string | Types.ObjectId;
  action: string;
  entityType: string;
  entityId: string | Types.ObjectId;
  meta?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name) private readonly model: Model<AuditLogDocument>,
  ) {}

  /**
   * Never rejects — mirrors DashboardNotifierService.notifyNew. The caller
   * has already committed the real write (the payment, the approval, the
   * invite); an audit-log outage must not turn that into a failed request.
   */
  async record(input: RecordAuditEntryInput): Promise<void> {
    try {
      await this.model.create(input);
    } catch (err) {
      this.logger.error(
        `Failed to record audit entry ${input.action} for ${input.entityType} ${input.entityId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async findForEntity(entityType: string, entityId: string) {
    return this.model
      .find({ entityType, entityId })
      .sort({ at: -1 })
      .populate('actor', 'firstName lastName email role')
      .lean();
  }

  /** Single entry for the admin detail view — full meta, ip, populated actor. */
  async findOne(id: string) {
    const entry = await this.model
      .findById(id)
      .populate('actor', 'firstName lastName email role')
      .lean();
    if (!entry) {
      throw new NotFoundException('Audit entry not found');
    }
    return entry;
  }

  async findRecent(limit = 100) {
    return this.model
      .find()
      .sort({ at: -1 })
      .limit(limit)
      .populate('actor', 'firstName lastName email role')
      .lean();
  }
}
