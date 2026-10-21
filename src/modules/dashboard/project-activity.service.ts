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
  Comment,
  CommentDocument,
  CommentSubjectType,
} from 'src/modules/comment/schemas/comment.schema';
import {
  Contract,
  ContractDocument,
  ContractStatus,
} from 'src/modules/contract/schemas/contract.schema';
import {
  ChangeRequest,
  ChangeRequestDocument,
  ChangeRequestStatus,
} from 'src/modules/change-request/schemas/change-request.schema';
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
  | 'invoice_paid'
  | 'comment_posted'
  | 'contract_signed'
  | 'change_request_approved';

export interface ActivityItem {
  _id: string;
  type: ActivityType;
  title: string;
  at: Date;
  link: string;
  excerpt?: string;
  actor?: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
}

/** How many events each collection contributes before the merge is trimmed. */
export const ACTIVITY_LIMIT = 10;

/**
 * "What happened lately" for one project — the Overview's recent-activity
 * list and the full-page Activity tab. Merges the newest rows from seven
 * collections (updates, files, approvals, invoices, comments, contracts,
 * change requests) instead of reading the notifications table, which is
 * per-user and would differ between two people on the same project.
 * Read-only; a client only ever sees what the client can already see
 * elsewhere — published updates, client-visible files, and non-internal
 * comments (see the isClient guards in recent()).
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
    @InjectModel(Comment.name)
    private readonly comments: Model<CommentDocument>,
    @InjectModel(Contract.name)
    private readonly contracts: Model<ContractDocument>,
    @InjectModel(ChangeRequest.name)
    private readonly changeRequests: Model<ChangeRequestDocument>,
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

    const commentQuery: Record<string, unknown> = {
      project: projectId,
      subjectType: CommentSubjectType.PROJECT,
    };
    if (isClient) commentQuery.internal = false;

    const AUTHOR_PICK = 'firstName lastName avatar';

    const [updates, files, approvals, invoices, comments, contracts, changes] =
      await Promise.all([
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
        this.comments
          .find(commentQuery)
          .sort({ createdAt: -1 })
          .limit(ACTIVITY_LIMIT)
          .select('body createdAt author')
          .populate('author', AUTHOR_PICK)
          .lean(),
        this.contracts
          .find({ project: projectId, status: ContractStatus.ACCEPTED })
          .sort({ 'acceptance.acceptedAt': -1 })
          .limit(ACTIVITY_LIMIT)
          .select('title acceptance')
          .lean(),
        this.changeRequests
          .find({
            project: projectId,
            status: {
              $in: [
                ChangeRequestStatus.CLIENT_APPROVED,
                ChangeRequestStatus.INVOICED,
              ],
            },
          })
          .sort({ approvedAt: -1 })
          .limit(ACTIVITY_LIMIT)
          .select('title priceAmount currency approvedAt updatedAt')
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
      ...comments.map((c: any) => ({
        _id: String(c._id),
        type: 'comment_posted' as const,
        title: 'New comment in discussion',
        excerpt: c.body?.slice(0, 120),
        at: c.createdAt,
        link: portalProjectLink(projectId, 'discussion'),
        actor: c.author
          ? {
              _id: String(c.author._id),
              firstName: c.author.firstName,
              lastName: c.author.lastName,
              avatar: c.author.avatar,
            }
          : undefined,
      })),
      ...contracts.map((ct: any) => ({
        _id: String(ct._id),
        type: 'contract_signed' as const,
        title: `Contract signed: ${ct.title}`,
        at: ct.acceptance?.acceptedAt,
        link: portalProjectLink(projectId, 'contract'),
      })),
      ...changes.map((cr: any) => ({
        _id: String(cr._id),
        type: 'change_request_approved' as const,
        title: `Change approved: ${cr.title}`,
        at: cr.approvedAt ?? cr.updatedAt,
        link: portalProjectLink(projectId, 'changes'),
      })),
    ];

    return items
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, ACTIVITY_LIMIT);
  }
}
