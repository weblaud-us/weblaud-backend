/**
 * Local-dev-only demo data for the client portal: two organizations, an
 * admin, a PM who works across both, a team member on only one project, a
 * staff member assigned to nothing, a client admin + client viewer on one
 * org, and a client admin on the other — plus one populated project per
 * organization.
 *
 * The two-organization, cross-assigned-PM shape is deliberate: it's the
 * minimum setup that actually exercises every access rule in
 * ClientProjectService (see project-access.util.ts) rather than just
 * rendering a UI with one project in it. See TESTING.md for the full
 * walkthrough of what to check with each account.
 *
 * Run manually (never on app boot, and never in production):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-portal-demo.ts
 *   (or: pnpm seed:portal-demo)
 *
 * Safe to re-run — everything is upserted by email/name, so running it twice
 * just resets the demo data back to its seeded state rather than
 * duplicating records.
 *
 * Users here get a real password directly (mirrors how SeedService seeds the
 * admin user), not the invite-link flow — the point is to skip clicking
 * through an email while testing the portal locally. The invite flow itself
 * is exercised separately, through the real /cpadmin UI — see TESTING.md.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { Organization } from '../src/modules/organization/schemas/organization.schema';
import { User } from '../src/modules/users/schemas/user.schema';
import {
  ClientProject,
  ClientProjectStatus,
  MilestoneStatus,
} from '../src/modules/client-project/schemas/client-project.schema';
import { Feature, FeatureStatus } from '../src/modules/feature/schemas/feature.schema';
import { Task, TaskStatus } from '../src/modules/task/schemas/task.schema';
import { Contract, ContractStatus } from '../src/modules/contract/schemas/contract.schema';
import {
  ChangeRequest,
  ChangeRequestStatus,
} from '../src/modules/change-request/schemas/change-request.schema';
import { Approval, ApprovalStatus, ApprovalSubjectType } from '../src/modules/approval/schemas/approval.schema';
import { Invoice, InvoiceStatus, InvoiceType } from '../src/modules/invoice/schemas/invoice.schema';
import { Role } from '../src/common/enum/user.role.enum';
import { OrgRole } from '../src/common/enum/org-role.enum';

const logger = new Logger('SeedPortalDemo');

const DEMO_PASSWORD = 'Demo1234!';
const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production');
  }

  // createApplicationContext, not create() — this is a script, not an HTTP
  // server, so there's no reason to instantiate the Express adapter (mirrors
  // scripts/migrate-content.ts).
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const orgModel = app.get<Model<any>>(getModelToken(Organization.name));
    const userModel = app.get<Model<any>>(getModelToken(User.name));
    const projectModel = app.get<Model<any>>(getModelToken(ClientProject.name));
    const featureModel = app.get<Model<any>>(getModelToken(Feature.name));
    const taskModel = app.get<Model<any>>(getModelToken(Task.name));
    const contractModel = app.get<Model<any>>(getModelToken(Contract.name));
    const changeRequestModel = app.get<Model<any>>(getModelToken(ChangeRequest.name));
    const approvalModel = app.get<Model<any>>(getModelToken(Approval.name));
    const invoiceModel = app.get<Model<any>>(getModelToken(Invoice.name));

    async function upsertOrg(fields: Record<string, unknown>) {
      return orgModel.findOneAndUpdate(
        { name: fields.name },
        { ...fields, isActive: true },
        { upsert: true, new: true },
      );
    }

    const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);

    async function upsertUser(fields: Record<string, unknown>) {
      return userModel.findOneAndUpdate(
        { email: fields.email },
        { ...fields, password: hashedPassword, isActive: true },
        { upsert: true, new: true },
      );
    }

    async function upsertProject(name: string, fields: Record<string, unknown>) {
      return projectModel.findOneAndUpdate(
        { name, organization: fields.organization },
        { name, ...fields },
        { upsert: true, new: true },
      );
    }

    /** Features live in their own collection now (see feature.module.ts) — upserted by (project, title) so re-running the seed doesn't duplicate them. */
    async function upsertFeature(projectId: unknown, order: number, fields: Record<string, unknown>) {
      return featureModel.findOneAndUpdate(
        { project: projectId, title: fields.title },
        { project: projectId, order, ...fields },
        { upsert: true, new: true },
      );
    }

    async function upsertTask(projectId: unknown, fields: Record<string, unknown>) {
      return taskModel.findOneAndUpdate(
        { project: projectId, title: fields.title },
        { project: projectId, ...fields },
        { upsert: true, new: true },
      );
    }

    // ---------------- Organizations ----------------

    const acme = await upsertOrg({
      name: 'Acme Inc',
      billingEmail: 'billing@acme.demo',
      defaultCurrency: 'USD',
      address: '123 Market St, San Francisco, CA',
    });
    logger.log(`Organization: ${acme.name} (${acme._id})`);

    const globex = await upsertOrg({
      name: 'Globex Corp',
      billingEmail: 'billing@globex.demo',
      defaultCurrency: 'USD',
      address: '1 Industrial Way, Austin, TX',
    });
    logger.log(`Organization: ${globex.name} (${globex._id})`);

    // ---------------- Staff (Role.MANAGER / Role.ADMIN) ----------------

    const admin = await upsertUser({
      firstName: 'Ada',
      lastName: 'Admin',
      email: 'admin@demo.weblaud.local',
      role: Role.ADMIN,
      title: 'Agency Admin',
    });
    logger.log(`Admin: ${admin.email} (${admin._id})`);

    // PM on BOTH projects, across BOTH organizations — proves staff
    // visibility is assignment-based, not organization-based.
    const pm = await upsertUser({
      firstName: 'Pat',
      lastName: 'Manager',
      email: 'pm@demo.weblaud.local',
      role: Role.MANAGER,
      title: 'Project Manager',
    });
    logger.log(`PM (cross-org): ${pm.email} (${pm._id})`);

    // Team member on Acme's project only.
    const teamMember = await upsertUser({
      firstName: 'Jordan',
      lastName: 'Dev',
      email: 'dev@demo.weblaud.local',
      role: Role.MANAGER,
      title: 'Senior Engineer',
    });
    logger.log(`Team member (Acme only): ${teamMember.email} (${teamMember._id})`);

    // Staff assigned to nothing — proves MANAGER role alone grants no
    // visibility; the portal project list must come back empty for this user.
    const unassigned = await upsertUser({
      firstName: 'Sam',
      lastName: 'Bench',
      email: 'unassigned@demo.weblaud.local',
      role: Role.MANAGER,
      title: 'Designer',
    });
    logger.log(`Unassigned staff: ${unassigned.email} (${unassigned._id})`);

    // ---------------- Clients (Role.USER) ----------------

    const acmeClientAdmin = await upsertUser({
      firstName: 'Alex',
      lastName: 'Client',
      email: 'client@demo.weblaud.local',
      role: Role.USER,
      organization: acme._id,
      orgRole: OrgRole.CLIENT_ADMIN,
      title: 'Founder',
    });
    logger.log(`Client admin (Acme): ${acmeClientAdmin.email} (${acmeClientAdmin._id})`);

    const acmeClientViewer = await upsertUser({
      firstName: 'Val',
      lastName: 'Viewer',
      email: 'viewer@demo.weblaud.local',
      role: Role.USER,
      organization: acme._id,
      orgRole: OrgRole.CLIENT_VIEWER,
      title: 'Marketing Lead',
    });
    logger.log(`Client viewer (Acme): ${acmeClientViewer.email} (${acmeClientViewer._id})`);

    // Different organization entirely — proves org-scoped visibility: this
    // user must see Globex's project and must NOT see Acme's.
    const globexClientAdmin = await upsertUser({
      firstName: 'Gale',
      lastName: 'Globex',
      email: 'client2@demo.weblaud.local',
      role: Role.USER,
      organization: globex._id,
      orgRole: OrgRole.CLIENT_ADMIN,
      title: 'Ops Director',
    });
    logger.log(`Client admin (Globex): ${globexClientAdmin.email} (${globexClientAdmin._id})`);

    // ---------------- Projects ----------------

    const acmeProject = await upsertProject('Acme Website Revamp', {
      description:
        'Full redesign and rebuild of the Acme marketing site, plus a self-serve pricing calculator.',
      status: ClientProjectStatus.ACTIVE,
      organization: acme._id,
      projectManager: pm._id,
      team: [teamMember._id],
      budget: { amount: 24000, currency: 'USD', spent: 9600 },
      timeline: {
        startDate: new Date(now - 20 * DAY),
        endDate: new Date(now + 40 * DAY),
        milestones: [
          {
            title: 'Design approved',
            dueDate: new Date(now - 10 * DAY),
            status: MilestoneStatus.DONE,
            completedAt: new Date(now - 9 * DAY),
          },
          {
            title: 'Homepage live',
            dueDate: new Date(now - 2 * DAY),
            status: MilestoneStatus.DONE,
            completedAt: new Date(now - 1 * DAY),
          },
          {
            title: 'Calculator launch',
            dueDate: new Date(now + 14 * DAY),
            status: MilestoneStatus.IN_PROGRESS,
          },
          {
            title: 'Full site handover',
            dueDate: new Date(now + 40 * DAY),
            status: MilestoneStatus.PENDING,
          },
        ],
      },
      progress: 45,
      createdBy: pm._id,
    });
    logger.log(`Project: ${acmeProject.name} (${acmeProject._id})`);

    // Deliberately early-stage and team-less: contrasts with Acme's project
    // so the two don't look like copies of each other in the UI, and proves
    // "team: []" renders fine (no crash on an empty assignee list).
    const globexProject = await upsertProject('Globex Marketing Launch', {
      description: 'Landing page, campaign tracking, and CRM integration for the Q4 product launch.',
      status: ClientProjectStatus.PLANNING,
      organization: globex._id,
      projectManager: pm._id,
      team: [],
      budget: { amount: 12000, currency: 'USD', spent: 800 },
      timeline: {
        startDate: new Date(now - 3 * DAY),
        endDate: new Date(now + 60 * DAY),
        milestones: [
          {
            title: 'Kickoff',
            dueDate: new Date(now - 3 * DAY),
            status: MilestoneStatus.DONE,
            completedAt: new Date(now - 3 * DAY),
          },
          {
            title: 'Landing page live',
            dueDate: new Date(now + 20 * DAY),
            status: MilestoneStatus.PENDING,
          },
        ],
      },
      progress: 10,
      createdBy: pm._id,
    });
    logger.log(`Project: ${globexProject.name} (${globexProject._id})`);

    // ---------------- Features (own collection — see feature.module.ts) ----------------

    const [homepageFeature, calculatorFeature] = await Promise.all([
      upsertFeature(acmeProject._id, 0, { title: 'New homepage design', status: FeatureStatus.DONE }),
      upsertFeature(acmeProject._id, 1, { title: 'Pricing calculator', status: FeatureStatus.IN_PROGRESS }),
    ]);
    await upsertFeature(acmeProject._id, 2, {
      title: 'Blog / insights section',
      status: FeatureStatus.IN_PROGRESS,
    });
    await upsertFeature(acmeProject._id, 3, {
      title: 'Client portal integration',
      status: FeatureStatus.PLANNED,
    });
    logger.log(`Features seeded for ${acmeProject.name}`);

    await upsertFeature(globexProject._id, 0, { title: 'Landing page', status: FeatureStatus.IN_PROGRESS });
    await upsertFeature(globexProject._id, 1, { title: 'CRM integration', status: FeatureStatus.PLANNED });
    await upsertFeature(globexProject._id, 2, {
      title: 'Campaign analytics dashboard',
      status: FeatureStatus.PLANNED,
    });
    logger.log(`Features seeded for ${globexProject.name}`);

    // ---------------- Task board (Milestone 3) ----------------
    // One card in each column, on the project with a real team, so
    // dev@demo... has something assigned and the board isn't empty on
    // first login.

    await upsertTask(acmeProject._id, {
      title: 'Wire up homepage hero section',
      status: TaskStatus.DONE,
      feature: homepageFeature._id,
      assignee: teamMember._id,
      estimateHours: 6,
      clientVisible: true,
      createdBy: pm._id,
    });
    await upsertTask(acmeProject._id, {
      title: 'Build calculator pricing engine',
      status: TaskStatus.IN_PROGRESS,
      feature: calculatorFeature._id,
      assignee: teamMember._id,
      dueDate: new Date(now + 5 * DAY),
      estimateHours: 10,
      clientVisible: true,
      createdBy: pm._id,
    });
    await upsertTask(acmeProject._id, {
      title: 'Calculator UI review',
      status: TaskStatus.IN_REVIEW,
      feature: calculatorFeature._id,
      assignee: pm._id,
      estimateHours: 2,
      clientVisible: true,
      createdBy: pm._id,
    });
    await upsertTask(acmeProject._id, {
      title: 'Draft blog section wireframes',
      status: TaskStatus.TODO,
      estimateHours: 4,
      clientVisible: true,
      createdBy: pm._id,
    });
    await upsertTask(acmeProject._id, {
      title: 'Investigate CMS options for blog',
      status: TaskStatus.BACKLOG,
      clientVisible: false, // internal exploration — not something to show Acme yet
      createdBy: pm._id,
    });
    logger.log(`Tasks seeded for ${acmeProject.name}`);

    // ---------------- Get-paid & protect-scope (Milestone 2) ----------------
    // One of each, sitting in the state a real one most often waits in
    // (sent/quoted/pending) rather than already resolved — so every new
    // portal tab has something actionable to click on the first login,
    // not just history.

    const contract = await contractModel.findOneAndUpdate(
      { title: 'Acme Website Revamp — SOW', organization: acme._id },
      {
        title: 'Acme Website Revamp — SOW',
        organization: acme._id,
        project: acmeProject._id,
        documentUrl: 'https://example.com/demo-sow.pdf',
        version: 1,
        status: ContractStatus.SENT,
        createdBy: admin._id,
      },
      { upsert: true, new: true },
    );
    logger.log(`Contract: ${contract.title} (${contract._id})`);

    const changeRequest = await changeRequestModel.findOneAndUpdate(
      { title: 'Add live chat widget', project: acmeProject._id },
      {
        title: 'Add live chat widget',
        description: 'Client asked for an Intercom-style chat bubble on every page.',
        project: acmeProject._id,
        priceAmount: 1500,
        currency: 'USD',
        status: ChangeRequestStatus.QUOTED,
        requestedBy: pm._id,
      },
      { upsert: true, new: true },
    );
    logger.log(`Change request: ${changeRequest.title} (${changeRequest._id})`);

    const approval = await approvalModel.findOneAndUpdate(
      { title: 'Homepage design v2', project: acmeProject._id },
      {
        title: 'Homepage design v2',
        description: 'Final homepage design, ready for client sign-off before development starts.',
        project: acmeProject._id,
        subjectType: ApprovalSubjectType.DELIVERABLE,
        status: ApprovalStatus.PENDING,
        requestedBy: pm._id,
      },
      { upsert: true, new: true },
    );
    logger.log(`Approval: ${approval.title} (${approval._id})`);

    const invoiceLineItems = [{ description: 'Design phase — 50% milestone', qty: 1, unitPrice: 2000 }];
    const invoice = await invoiceModel.findOneAndUpdate(
      { number: 'INV-DEMO-0001' },
      {
        number: 'INV-DEMO-0001',
        organization: acme._id,
        project: acmeProject._id,
        type: InvoiceType.MILESTONE,
        lineItems: invoiceLineItems,
        subtotal: 2000,
        tax: 0,
        total: 2000,
        currency: 'USD',
        status: InvoiceStatus.SENT,
        issueDate: new Date(now - 5 * DAY),
        dueDate: new Date(now + 10 * DAY),
        createdBy: admin._id,
      },
      { upsert: true, new: true },
    );
    logger.log(`Invoice: ${invoice.number} (${invoice._id})`);

    logger.log('');
    logger.log('Demo data ready — see TESTING.md for what to check with each account.');
    logger.log(`  Admin              — admin@demo.weblaud.local / ${DEMO_PASSWORD}`);
    logger.log(`  PM (both projects) — pm@demo.weblaud.local / ${DEMO_PASSWORD}`);
    logger.log(`  Staff (Acme only)  — dev@demo.weblaud.local / ${DEMO_PASSWORD}`);
    logger.log(`  Staff (unassigned) — unassigned@demo.weblaud.local / ${DEMO_PASSWORD}`);
    logger.log(`  Client admin (Acme)   — client@demo.weblaud.local / ${DEMO_PASSWORD}`);
    logger.log(`  Client viewer (Acme)  — viewer@demo.weblaud.local / ${DEMO_PASSWORD}`);
    logger.log(`  Client admin (Globex) — client2@demo.weblaud.local / ${DEMO_PASSWORD}`);
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  logger.error('Seeding failed', err instanceof Error ? err.stack : err);
  process.exit(1);
});
