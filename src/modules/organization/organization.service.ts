import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Organization,
  OrganizationDocument,
} from './schemas/organization.schema';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectModel(Organization.name)
    private readonly orgModel: Model<OrganizationDocument>,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateOrganizationDto, actorId: string) {
    const org = await this.orgModel.create(dto);
    await this.auditLog.record({
      actor: actorId,
      action: 'organization.create',
      entityType: 'Organization',
      entityId: String(org._id),
      meta: { name: org.name },
    });
    return org;
  }

  async findAll() {
    return this.orgModel.find().sort({ createdAt: -1 }).lean();
  }

  async findOne(id: string) {
    const org = await this.orgModel.findById(id).lean();
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto, actorId: string) {
    const updated = await this.orgModel.findByIdAndUpdate(id, dto, {
      new: true,
    });
    if (!updated) throw new NotFoundException('Organization not found');
    await this.auditLog.record({
      actor: actorId,
      action: 'organization.update',
      entityType: 'Organization',
      entityId: id,
      meta: { fields: Object.keys(dto) },
    });
    return updated;
  }

  async delete(id: string, actorId: string) {
    const deleted = await this.orgModel.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('Organization not found');
    await this.auditLog.record({
      actor: actorId,
      action: 'organization.delete',
      entityType: 'Organization',
      entityId: id,
      meta: { name: deleted.name },
    });
    return { deleted: true };
  }
}
