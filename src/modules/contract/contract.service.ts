import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { UploadService } from '@weblaud/upload-pro';
import {
  Contract,
  ContractDocument,
  ContractStatus,
} from './schemas/contract.schema';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { AcceptContractDto } from './dto/accept-contract.dto';
import { UsersService } from 'src/modules/users/users.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { AuditLogService } from 'src/modules/audit-log/audit-log.service';
import { ClientProjectService } from 'src/modules/client-project/client-project.service';
import { Role } from 'src/common/enum/user.role.enum';
import { OrgRole } from 'src/common/enum/org-role.enum';
import {
  hasProjectAccess,
  idsMatch,
} from 'src/common/utils/project-access.util';
import { streamStoredFile } from 'src/common/utils/stored-file-streamer.util';
import { portalProjectLink } from 'src/common/utils/portal-links.util';

interface PortalActor {
  _id: string;
  role: Role;
  organization?: string;
  orgRole?: OrgRole;
}

@Injectable()
export class ContractService {
  private readonly logger = new Logger(ContractService.name);

  constructor(
    @InjectModel(Contract.name) private readonly model: Model<ContractDocument>,
    private readonly uploadService: UploadService,
    private readonly users: UsersService,
    private readonly notifications: NotificationService,
    private readonly auditLog: AuditLogService,
    private readonly projects: ClientProjectService,
    private readonly config: ConfigService,
  ) {}

  // ================================
  //     AGENCY SIDE (admin CRUD)
  // ================================

  async create(
    dto: CreateContractDto,
    file: Express.Multer.File | undefined,
    userId: string,
  ) {
    const documentUrl = file ? await this.uploadFile(file) : undefined;
    return this.model.create({ ...dto, documentUrl, createdBy: userId });
  }

  async findAll() {
    return this.model
      .find()
      .sort({ createdAt: -1 })
      .populate('organization', 'name')
      .populate('project', 'name')
      .lean();
  }

  async findOne(id: string) {
    const contract = await this.model
      .findById(id)
      .populate('organization', 'name')
      .populate('project', 'name');
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async update(id: string, dto: UpdateContractDto, file?: Express.Multer.File) {
    const contract = await this.model.findById(id);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status === ContractStatus.ACCEPTED) {
      throw new BadRequestException(
        'This contract has already been accepted and cannot be edited — void it and create a new version instead',
      );
    }

    const update: Record<string, unknown> = { ...dto };
    if (file) {
      if (contract.documentUrl) await this.deleteFile(contract.documentUrl);
      update.documentUrl = await this.uploadFile(file);
      update.version = contract.version + 1;
    }

    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  /** Draft → sent. Notifies the org's client admins that a contract is waiting on them. */
  async send(id: string, actorId: string) {
    const contract = await this.model.findById(id);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== ContractStatus.DRAFT) {
      throw new BadRequestException('Only a draft contract can be sent');
    }
    if (!contract.documentUrl) {
      throw new BadRequestException(
        'Upload the contract document before sending it',
      );
    }

    contract.status = ContractStatus.SENT;
    await contract.save();

    const clientAdmins = await this.users.findClientAdmins(
      contract.organization.toString(),
    );
    await this.notifications.notifyMany(
      clientAdmins.map((u) => u._id),
      {
        type: 'contract_sent',
        title: `New contract to review: ${contract.title}`,
        // The portal has no contracts index page — a contract is reviewed on
        // its project's Contract tab. Org-level contracts (no project) can
        // only be pointed at the portal home.
        link: contract.project
          ? portalProjectLink(contract.project.toString(), 'contract')
          : '/portal',
        email: {
          category: 'contracts',
          subject: `New contract to review: ${contract.title}`,
          template: 'contract-sent',
          context: { contractTitle: contract.title },
        },
      },
    );

    await this.auditLog.record({
      actor: actorId,
      action: 'contract.sent',
      entityType: 'Contract',
      entityId: id,
    });

    return contract;
  }

  /** Draft/sent → void. Accepted contracts cannot be voided — the acceptance record is permanent. */
  async void(id: string, actorId: string) {
    const contract = await this.model.findById(id);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status === ContractStatus.ACCEPTED) {
      throw new BadRequestException('An accepted contract cannot be voided');
    }

    contract.status = ContractStatus.VOID;
    await contract.save();

    await this.auditLog.record({
      actor: actorId,
      action: 'contract.voided',
      entityType: 'Contract',
      entityId: id,
    });

    return contract;
  }

  async delete(id: string) {
    const contract = await this.model.findById(id);
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== ContractStatus.DRAFT) {
      throw new BadRequestException(
        'Only a draft contract can be deleted — void it instead',
      );
    }
    if (contract.documentUrl) await this.deleteFile(contract.documentUrl);
    await contract.deleteOne();
    return { deleted: true };
  }

  // ================================
  //     PORTAL SIDE (membership-scoped)
  // ================================

  /**
   * ADMIN: always. USER (client): their own organization. MANAGER (staff):
   * only via the linked project (PM/team on it) — a contract with no
   * `project` is a pure org-level document (e.g. a master agreement) staff
   * have no reason to see; that's a client/admin-only conversation.
   */
  private async assertAccess(contract: ContractDocument, user: PortalActor) {
    if (user.role === Role.ADMIN) return;
    if (
      user.role === Role.USER &&
      idsMatch(contract.organization, user.organization)
    )
      return;
    if (user.role === Role.MANAGER && contract.project) {
      const subject = await this.projects.findAccessSubject(
        contract.project.toString(),
      );
      if (hasProjectAccess(subject, user)) return;
    }
    throw new ForbiddenException('You do not have access to this contract');
  }

  async findForPortalUser(user: PortalActor) {
    let query: Record<string, unknown> = {};

    if (user.role === Role.USER) {
      query = { organization: user.organization };
    } else if (user.role !== Role.ADMIN) {
      // Staff — and any other non-admin role, e.g. EDITOR — only see their
      // own projects; never fall through to the unfiltered admin query.
      const myProjects = await this.projects.findForPortalUser(user);
      query = { project: { $in: myProjects.map((p) => p._id) } };
    }
    // ADMIN: no filter.

    const contracts = await this.model
      .find(query)
      .sort({ createdAt: -1 })
      .populate('organization', 'name')
      .populate('project', 'name')
      .lean();

    return contracts.map((c) => this.stripDocumentUrl(c));
  }

  async findForProject(projectId: string, user: PortalActor) {
    const subject = await this.projects.findAccessSubject(projectId);
    if (!hasProjectAccess(subject, user)) {
      throw new ForbiddenException('You do not have access to this project');
    }
    const contracts = await this.model
      .find({ project: projectId })
      .sort({ createdAt: -1 })
      .populate('organization', 'name')
      .lean();

    return contracts.map((c) => this.stripDocumentUrl(c));
  }

  async findOneForPortalUser(id: string, user: PortalActor) {
    const contract = await this.model.findById(id);
    if (!contract) throw new NotFoundException('Contract not found');
    await this.assertAccess(contract, user);

    const populated = await this.model
      .findById(id)
      .populate('organization', 'name')
      .populate('project', 'name');
    if (!populated) throw new NotFoundException('Contract not found');

    return this.stripDocumentUrl(populated.toObject());
  }

  /**
   * The raw storage URL (S3 or local path) is never sent to a portal
   * caller — it used to be, and the frontend rendered it as a plain
   * clickable link with no auth check, no expiry, and no audit trail on the
   * most confidential document in the system. `hasDocument` is what the UI
   * needs to know whether to show a link at all; the link itself points at
   * GET /portal/contracts/:id/document, which re-checks access and streams
   * the bytes server-side. See streamDocument below.
   */
  private stripDocumentUrl<T extends { documentUrl?: string }>(
    doc: T,
  ): Omit<T, 'documentUrl'> & { hasDocument: boolean } {
    const { documentUrl, ...rest } = doc;
    return { ...rest, hasDocument: !!documentUrl };
  }

  /**
   * Only a client_admin can bind their organization to a contract —
   * client_viewer is read-only by design (see OrgRole doc comment).
   */
  async accept(
    id: string,
    dto: AcceptContractDto,
    user: PortalActor,
    ip: string,
    userAgent: string,
  ) {
    const contract = await this.model.findById(id);
    if (!contract) throw new NotFoundException('Contract not found');
    await this.assertAccess(contract, user);

    if (user.role !== Role.ADMIN && user.orgRole !== OrgRole.CLIENT_ADMIN) {
      throw new ForbiddenException('Only a client admin can accept a contract');
    }
    if (contract.status !== ContractStatus.SENT) {
      throw new BadRequestException('Only a sent contract can be accepted');
    }

    contract.status = ContractStatus.ACCEPTED;
    contract.acceptance = {
      name: dto.name,
      signatureImage: dto.signatureImage,
      acceptedAt: new Date(),
      ip,
      userAgent,
    };
    await contract.save();

    await this.auditLog.record({
      actor: user._id,
      action: 'contract.accepted',
      entityType: 'Contract',
      entityId: id,
      meta: { name: dto.name, ip },
      ip,
    });

    return contract;
  }

  /**
   * Streams a one-page PDF proving acceptance: who signed, when, from where.
   * This is deliberately separate from the uploaded SOW document — it's
   * generated fresh every time from the immutable acceptance record, so it
   * can never drift from what's actually stored.
   */
  async streamAcceptanceCertificate(
    id: string,
    user: PortalActor,
    res: NodeJS.WritableStream,
  ) {
    // Access checked against the RAW (unpopulated) document first — see the
    // warning on assertProjectAccess in project-access.util.ts. Checking
    // against an already-populated `organization` compares a Mongoose
    // document's default Object.prototype toString() ("[object Object]")
    // against a real id string, which never matches: a legitimate client
    // gets a false 403 instead of their certificate.
    const raw = await this.model.findById(id);
    if (!raw) throw new NotFoundException('Contract not found');
    await this.assertAccess(raw, user);

    const contract = await this.model
      .findById(id)
      .populate('organization', 'name');
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== ContractStatus.ACCEPTED || !contract.acceptance) {
      throw new BadRequestException('This contract has not been accepted yet');
    }

    const org = contract.organization as unknown as { name: string };
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    doc.pipe(res);

    doc.fontSize(20).text('Certificate of Acceptance', { align: 'left' });
    doc.moveDown();
    doc.fontSize(11).fillColor('#444').text(`Contract: ${contract.title}`);
    doc.text(`Organization: ${org?.name ?? ''}`);
    doc.text(`Version: ${contract.version}`);
    doc.moveDown();

    doc.fillColor('#000').fontSize(13).text('Acceptance record');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#444');
    doc.text(`Accepted by: ${contract.acceptance.name}`);
    doc.text(`Accepted at: ${contract.acceptance.acceptedAt.toUTCString()}`);
    doc.text(`IP address: ${contract.acceptance.ip}`);
    doc.text(`User agent: ${contract.acceptance.userAgent}`);

    if (contract.acceptance.signatureImage?.startsWith('data:image/')) {
      doc.moveDown();
      doc.fontSize(11).fillColor('#000').text('Signature:');
      try {
        const base64 = contract.acceptance.signatureImage.split(',')[1];
        doc.image(Buffer.from(base64, 'base64'), { fit: [240, 100] });
      } catch {
        // Malformed signature data shouldn't break certificate generation —
        // the typed name above is still legally the acceptance record.
      }
    }

    doc.moveDown(2);
    doc
      .fontSize(9)
      .fillColor('#888')
      .text(
        'This certificate was generated automatically by the WebLaud client portal from the stored acceptance record and cannot be edited.',
      );

    doc.end();
  }

  /**
   * Streams the uploaded SOW/contract document itself — the fix for the
   * document being served over a bare, unauthenticated storage URL. Access
   * is checked exactly like every other portal read here (RAW subject
   * first, same reasoning as streamAcceptanceCertificate above); the bytes
   * are then fetched server-side and piped through this response, so the
   * browser only ever talks to this authenticated endpoint and never
   * receives — or can bookmark, forward, or leak — a direct link to the
   * file itself.
   */
  async streamDocument(
    id: string,
    user: PortalActor,
    res: NodeJS.WritableStream,
  ) {
    const raw = await this.model.findById(id);
    if (!raw) throw new NotFoundException('Contract not found');
    await this.assertAccess(raw, user);

    if (!raw.documentUrl) {
      throw new NotFoundException('This contract has no document uploaded yet');
    }

    await streamStoredFile(
      raw.documentUrl,
      res,
      this.config,
      this.logger,
      'Contract document',
    );
  }

  // ================================
  //     FILE HELPERS
  // ================================

  private async uploadFile(file: Express.Multer.File): Promise<string> {
    const uploaded = await this.uploadService.upload(file, {
      folder: 'contracts',
    });
    return uploaded.url ?? uploaded.path ?? '';
  }

  private async deleteFile(urlOrPath: string) {
    if (!urlOrPath) return;
    const identifier = urlOrPath.includes('amazonaws.com')
      ? urlOrPath.split('.com/')[1]
      : urlOrPath;
    if (identifier) await this.uploadService.delete(identifier);
  }
}
