import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import {
  ProjectUpdate,
  ProjectUpdateDocument,
  ProjectUpdateStatus,
} from 'src/modules/project-update/schemas/project-update.schema';
import {
  FileVisibility,
  ProjectFile,
  ProjectFileDocument,
} from 'src/modules/file/schemas/project-file.schema';
import {
  Approval,
  ApprovalDocument,
  ApprovalStatus,
} from 'src/modules/approval/schemas/approval.schema';
import {
  Invoice,
  InvoiceDocument,
  InvoiceStatus,
} from 'src/modules/invoice/schemas/invoice.schema';
import {
  assertProjectAccess,
  ProjectAccessActor,
} from 'src/common/utils/project-access.util';
import { portalProjectLink } from 'src/common/utils/portal-links.util';
import { Role } from 'src/common/enum/user.role.enum';

export type ActivityType =
  | 'update_published'
  | 'file_shared'
  | 'approval_decided'
  | 'invoice_paid';

export interface ActivityItem {
  _id: string;
  type: ActivityType;
  title: string;
  at: Date;
  link: string;
}

/** How many events the Overview shows. */
export const ACTIVITY_LIMIT = 10;

/**
 * "What happened lately" for one project — the Overview's recent-activity
 * list. Merges the newest rows from four collections instead of reading the
 * notifications table, which is per-user and would differ between two
 * people on the same project. Read-only; a client only ever sees what the
 * client can already see elsewhere (published updates, client-visible files).
 */
@Injectable()
export class ProjectActivityService {
  constructor(
    @InjectModel(ProjectUpdate.name)
    private readonly updates: Model<ProjectUpdateDocument>,
    @InjectModel(ProjectFile.name)
    private readonly files: Model<ProjectFileDocument>,
    @InjectModel(Approval.name)
    private readonly approvals: Model<ApprovalDocument>,
    @InjectModel(Invoice.name)
    private readonly invoices: Model<InvoiceDocument>,
    private readonly projects: ClientProjectService,
  ) {}

  async recent(
    projectId: string,
    actor: ProjectAccessActor,
  ): Promise<ActivityItem[]> {
    const subject = await this.projects.findAccessSubject(projectId);
    assertProjectAccess(subject, actor);
    const isClient = actor.role === Role.USER;

    const fileQuery: Record<string, unknown> = { project: projectId };
    if (isClient) fileQuery.visibility = FileVisibility.CLIENT;

    const [updates, files, approvals, invoices] = await Promise.all([
      this.updates
        .find({ project: projectId, status: ProjectUpdateStatus.PUBLISHED })
        .sort({ publishedAt: -1 })
        .limit(ACTIVITY_LIMIT)
        .select('title publishedAt createdAt')
        .lean(),
      this.files
        .find(fileQuery)
        .sort({ createdAt: -1 })
        .limit(ACTIVITY_LIMIT)
        .select('name createdAt')
        .lean(),
      this.approvals
        .find({
          project: projectId,
          status: { $in: [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED] },
        })
        .sort({ decidedAt: -1 })
        .limit(ACTIVITY_LIMIT)
        .select('title status decidedAt updatedAt')
        .lean(),
      this.invoices
        .find({ project: projectId, status: InvoiceStatus.PAID })
        .sort({ paidAt: -1 })
        .limit(ACTIVITY_LIMIT)
        .select('number paidAt updatedAt')
        .lean(),
    ]);

    const items: ActivityItem[] = [
      ...updates.map((u: any) => ({
        _id: String(u._id),
        type: 'update_published' as const,
        title: `Update posted: ${u.title}`,
        at: u.publishedAt ?? u.createdAt,
        link: portalProjectLink(projectId, 'updates'),
      })),
      ...files.map((f: any) => ({
        _id: String(f._id),
        type: 'file_shared' as const,
        title: `${isClient ? 'File shared' : 'File uploaded'}: ${f.name}`,
        at: f.createdAt,
        link: portalProjectLink(projectId, 'files'),
      })),
      ...approvals.map((a: any) => ({
        _id: String(a._id),
        type: 'approval_decided' as const,
        title: `${a.status === ApprovalStatus.APPROVED ? 'Approved' : 'Changes requested'}: ${a.title}`,
        at: a.decidedAt ?? a.updatedAt,
        link: portalProjectLink(projectId, 'approvals'),
      })),
      ...invoices.map((i: any) => ({
        _id: String(i._id),
        type: 'invoice_paid' as const,
        title: `Invoice ${i.number} paid`,
        at: i.paidAt ?? i.updatedAt,
        link: portalProjectLink(projectId, 'invoices'),
      })),
    ];

    return items
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, ACTIVITY_LIMIT);
  }
}
