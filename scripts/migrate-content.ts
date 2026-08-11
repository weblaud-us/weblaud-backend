/**
 * One-off content migration: moves the hardcoded copy/images that used to
 * live in weblaud-site (app/data/*.ts + inline component arrays) into
 * MongoDB + Cloudinary, through the real backend modules/UploadService.
 *
 * Run manually (never on app boot): `npm run migrate:content`
 * Safe to re-run — collections with a natural key (project/insights) upsert
 * by slug; collections without one (services/team/testimonials/faq) skip
 * entirely if already populated, so admin edits are never clobbered.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { UploadService } from '@weblaud/upload-pro';
import { Service } from '../src/modules/services/schemas/service.schema';
import { Project } from '../src/modules/project/schema/project.schema';
import { Insight } from '../src/modules/insights/schemas/insight.schema';
import { TeamMember } from '../src/modules/team/schemas/team-member.schema';
import { Testimonial } from '../src/modules/testimonial/schemas/testimonial.schema';
import { AboutInfo } from '../src/modules/about/schemas/about-info.schema';
import { ContactInfo } from '../src/modules/contact-info/schemas/contact-info.schema';
import { CalculatorConfig } from '../src/modules/calculator-config/schemas/calculator-config.schema';
import { Faq } from '../src/modules/faq/schemas/faq.schema';

const logger = new Logger('MigrateContent');

const ASSET_SOURCE_DIR = process.env.ASSET_SOURCE_DIR
  ? path.resolve(process.env.ASSET_SOURCE_DIR)
  : path.resolve(__dirname, '../../weblaud-site/app/assets');

const DATA_SOURCE_DIR = path.resolve(ASSET_SOURCE_DIR, '../data');

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function readAssetFile(relPath: string) {
  const fullPath = path.join(ASSET_SOURCE_DIR, relPath);
  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  return {
    buffer,
    originalname: path.basename(fullPath),
    mimetype: MIME_TYPES[ext] ?? 'application/octet-stream',
  } as unknown as Express.Multer.File;
}

async function uploadAsset(
  uploadService: UploadService,
  relPath: string,
  folder: string,
): Promise<string> {
  try {
    const file = readAssetFile(relPath);
    const uploaded = await uploadService.upload(file, { folder });
    return uploaded.url ?? uploaded.path ?? '';
  } catch (err) {
    logger.error(`Failed to upload asset "${relPath}" (folder: ${folder})`, err as Error);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Literal content, transcribed verbatim from:
//   weblaud-site/app/data/{services,projects}.ts
//   weblaud-site/app/components/aboutUs/{theTeam,ourMissionAndStory,ourTrack}.tsx
//   weblaud-site/app/components/home/{ourSay,faq}.tsx
//   weblaud-site/app/components/ui/contact-info.tsx
//   weblaud-site/app/components/calculator/projectCalculator.tsx
// Image fields are relative paths under ASSET_SOURCE_DIR.
// insights.ts (21 full articles, 800+ lines) is loaded programmatically
// instead of transcribed — see loadInsightsModule() below.
// ---------------------------------------------------------------------------

const SERVICES_SEED = [
  {
    title: 'Custom Operations Platforms & ERPs',
    description:
      'We build the core back-office software your business runs on — automating billing, inventory, multi-branch reporting, and fine-grained access control.',
    features: [
      'Automated invoicing, payment workflows & PDF docs',
      'Role-Based Access Control (RBAC) & audit logging',
      'Real-time executive reporting & financial dashboards',
    ],
    imageAsset: 'retail-ecommerce.png',
  },
  {
    title: 'Scalable Web App & SaaS Engineering',
    description:
      'High-performance web apps built to scale from day one — blazing fast response times, SEO-optimized frontends, and resilient database architectures.',
    features: [
      'Full-Stack Architecture (React / Next.js + Node / Go)',
      'Secure multi-tenant auth & subscription billing',
      'Production CI/CD pipelines & zero-downtime deploys',
    ],
    imageAsset: 'web-app.png',
  },
  {
    title: 'Cross-Platform Mobile & API Systems',
    description:
      'Native-performing iOS & Android apps built from a unified codebase, bundled with robust cloud APIs and administrative backends.',
    features: [
      'Single Flutter codebase for iOS, Android & Web',
      'Offline-first sync, push notifications & payments',
      'Turnkey App Store & Google Play deployment',
    ],
    imageAsset: 'mobile-app.png',
  },
  {
    title: 'Production AI & LLM Integration',
    description:
      'Embed production-ready AI models into your software in a 2 to 4 week fixed-scope sprint — measurable output with zero hype.',
    features: [
      'Custom RAG & LLM Workflows (OpenAI, Claude, Gemini)',
      'AI assistants trained securely on your private data',
      'Rigorous evaluation frameworks & full ownership',
    ],
    imageAsset: 'ai-app.png',
  },
  {
    title: 'Real-Time Infrastructure & Streaming',
    description:
      'Self-hosted voice, video, and messaging infrastructure on your own cloud — eliminating expensive per-minute SaaS vendor billing.',
    features: [
      'Custom WebRTC / LiveKit video & real-time chat',
      'Automated DevOps, CI/CD, backups & 99.9% uptime',
      'Load-tested, fully documented & zero vendor lock-in',
    ],
    imageAsset: 'algorithm-trading.png',
  },
  {
    title: 'Dedicated Senior Engineering Pods',
    description:
      'Embed senior engineers directly into your sprints. We adapt to your toolchain, culture, and cadence with elite engineering velocity.',
    features: [
      'Full-stack senior engineers (Node, Python, Flutter)',
      'Direct Slack/Teams integration & daily standups',
      'Transparent sprint billing & weekly milestone demos',
    ],
    imageAsset: 'custom-design.png',
  },
];

const PROJECTS_SEED = [
  {
    slug: 'enterprise-operations-erp-platform',
    name: 'Enterprise Operations & ERP Platform',
    description:
      'Custom back-office ERP unifying billing, inventory, and multi-branch reporting into a single platform with granular role-based access control.',
    features: [
      'Automated invoicing, payment workflows & PDF generation',
      'Role-based access control (RBAC) & full audit logging',
      'Real-time executive reporting & financial dashboards',
    ],
    imageAsset: 'pimg-05.png',
    imageAlt: 'Enterprise Operations & ERP Dashboard',
    problem:
      'A multi-branch retail operator ran finance, inventory, and staff permissions across six disconnected spreadsheets and a legacy desktop accounting tool, forcing manual reconciliation every month and giving branch managers no real-time visibility into cash position or stock levels.',
    solution:
      'We built a unified operations platform with automated invoicing and payment workflows, granular role-based access control down to the branch level, and live executive dashboards pulling directly from the transaction database — replacing the manual reconciliation process entirely.',
    techStack: ['React', 'Node.js', 'PostgreSQL', 'Redis', 'AWS', 'Stripe'],
    businessImpact:
      'Cut month-end close from 5 days to same-day, eliminated manual reconciliation errors across all 6 branches, and gave leadership real-time cash and inventory visibility for the first time.',
  },
  {
    slug: 'b2b-saas-subscription-platform',
    name: 'B2B SaaS Subscription Platform',
    description:
      'Multi-tenant SaaS platform built for scale from day one — subscription billing, secure tenant isolation, and zero-downtime deploys.',
    features: [
      'Multi-tenant architecture with secure data isolation',
      'Stripe-powered subscription billing & plan management',
      'Zero-downtime CI/CD pipeline with automated testing',
    ],
    imageAsset: 'pimg-04.png',
    imageAlt: 'B2B SaaS Subscription Platform',
    problem:
      "An early-stage SaaS startup had validated demand with a single-tenant prototype, but the codebase couldn't support paying customers — no subscription billing, no tenant isolation, and every deploy required a maintenance window.",
    solution:
      'We re-architected the application into a secure multi-tenant platform, integrated Stripe for self-serve subscription billing and plan upgrades, and built a CI/CD pipeline with automated test gates enabling zero-downtime deploys multiple times a week.',
    techStack: ['React', 'Next.js', 'Node.js', 'PostgreSQL', 'Stripe', 'Docker'],
    businessImpact:
      'Went from zero to 40 paying tenants in the first quarter post-launch with zero billing incidents, and cut average deploy time from a 2-hour maintenance window to under 10 minutes with no downtime.',
  },
  {
    slug: 'offline-first-field-service-app',
    name: 'Offline-First Field Service Mobile App',
    description:
      'Cross-platform Flutter app and API backend giving field technicians full functionality in zero-connectivity environments, with automatic background sync.',
    features: [
      'Single Flutter codebase for iOS, Android & Web',
      'Offline-first local storage with background sync',
      'Push notifications & in-app payment collection',
    ],
    imageAsset: 'pimg-02.png',
    imageAlt: 'Offline-First Field Service Mobile App',
    problem:
      "A field services company's technicians regularly lost work orders and photo documentation when cellular signal dropped in basements, rural sites, and metal-frame buildings, forcing them to redo paperwork back at the office.",
    solution:
      'We built a single Flutter codebase for iOS and Android backed by local-first storage, so technicians can complete work orders, capture photos, and collect payment entirely offline. A background sync queue pushes everything to the cloud API the moment connectivity returns.',
    techStack: ['Flutter', 'SQLite', 'Node.js', 'PostgreSQL', 'Firebase Cloud Messaging'],
    businessImpact:
      'Eliminated redone paperwork from lost connectivity, cut average job completion time by 25%, and gave dispatch real-time visibility into technician status even in low-signal areas.',
  },
  {
    slug: 'ai-support-assistant-rag-pipeline',
    name: 'AI Support Assistant & RAG Pipeline',
    description:
      "Production RAG pipeline and AI assistant trained securely on a company's private documentation, deployed as a support-deflection tool for its customer success team.",
    features: [
      'Custom RAG pipeline over a private knowledge base',
      'AI assistant secured to company data, zero data leakage',
      'Evaluation framework tracking accuracy & hallucination rate',
    ],
    imageAsset: 'pimg-01.png',
    imageAlt: 'AI Support Assistant & RAG Pipeline',
    problem:
      "A B2B software company's support team was drowning in repetitive tickets that were already answered somewhere in their 400-page internal documentation, but agents couldn't search it fast enough to keep up with ticket volume.",
    solution:
      "We built a production RAG pipeline that indexes the company's private documentation into a vector database, paired with an AI assistant that answers support agents' questions with cited sources in seconds. A rigorous evaluation framework tracks accuracy and flags low-confidence answers for human review before they reach a customer.",
    techStack: ['Python', 'FastAPI', 'OpenAI API', 'Pinecone', 'PostgreSQL'],
    businessImpact:
      'Cut average ticket resolution time by 45% within the first 6 weeks and reduced escalations to senior support staff by a third, with no drop in customer satisfaction scores.',
  },
  {
    slug: 'self-hosted-video-voice-infrastructure',
    name: 'Self-Hosted Video & Voice Infrastructure',
    description:
      'Self-hosted WebRTC video, voice, and messaging infrastructure replacing per-minute third-party vendor billing for a telehealth platform.',
    features: [
      'Custom WebRTC / LiveKit video & voice infrastructure',
      'Real-time session quality & uptime monitoring',
      'Automated DevOps, CI/CD & 99.9% uptime SLA',
    ],
    imageAsset: 'pimg-03.png',
    imageAlt: 'Real-Time Video & Voice Infrastructure Monitoring',
    problem:
      'A telehealth startup was paying a third-party video SaaS vendor per-minute fees that scaled directly with patient visit volume, eating an increasing share of revenue as the platform grew, with no control over call quality or uptime.',
    solution:
      'We deployed self-hosted LiveKit/WebRTC infrastructure on the company\'s own cloud, giving them full ownership of video and voice sessions. A real-time monitoring dashboard tracks call quality and infrastructure health, backed by automated CI/CD and a 99.9% uptime SLA.',
    techStack: ['LiveKit', 'WebRTC', 'Node.js', 'Redis', 'Docker', 'AWS'],
    businessImpact:
      'Eliminated per-minute vendor billing entirely, cutting video infrastructure costs by 65% at current volume, while maintaining 99.9% uptime with full control over call quality and data residency.',
  },
  {
    slug: 'dedicated-engineering-pod-scaling-sprint',
    name: 'Dedicated Engineering Pod for a Scaling SaaS Team',
    description:
      "Embedded senior full-stack pod integrated directly into a scaling SaaS company's existing sprints to clear a critical product backlog without a 3-to-6 month hiring cycle.",
    features: [
      "Senior full-stack engineers embedded in client's toolchain",
      'Direct Slack integration & daily standups from week one',
      'Transparent sprint billing & weekly milestone demos',
    ],
    imageAsset: 'pimg-06.png',
    imageAlt: 'Dedicated Engineering Pod for a Scaling SaaS Team',
    problem:
      "A venture-backed SaaS company had a roadmap it couldn't ship — its 4-person engineering team was already at capacity, and a 3-to-6 month hiring cycle would have meant missing its next funding milestone.",
    solution:
      "We embedded a 3-engineer senior pod directly into the client's existing sprints and toolchain within 48 hours, working from their backlog and attending their daily standups as if we were internal hires, with zero onboarding drag on their core team.",
    techStack: ['Node.js', 'React', 'Python', 'PostgreSQL', 'AWS'],
    businessImpact:
      'Shipped the delayed roadmap 10 weeks ahead of the original in-house hiring timeline, directly supporting the company\'s next funding round, with zero net increase to permanent headcount.',
  },
];

const TEAM_SEED = [
  { name: 'Sakib Al Jaber', title: 'Lead Software Engineer', imageAsset: 'team/sakib_w.png' },
  { name: 'Manirul Islam', title: 'Business Development', imageAsset: 'team/manirul.png' },
  { name: 'Kazi Arif Ishtique', title: 'Senior Software Engineer', imageAsset: 'team/ishtique.png' },
  { name: 'Shoaib Al Jayed', title: 'Software Engineer', imageAsset: 'team/shoaib_weblaud.png' },
  { name: 'Ruhul Amin', title: 'Full Stack Engineer', imageAsset: 'team/ruhul_w.png' },
  { name: 'Jubayed Islam', title: 'Software Engineer', imageAsset: 'team/Jubayed.png' },
  { name: 'Shuvo Chandra', title: 'Software Engineer', imageAsset: 'team/shuvo.png' },
];

const TESTIMONIALS_SEED = [
  {
    quote:
      'Weblaud rebuilt our customer portal into a clean, scalable architecture in 8 weeks. They delivered the project on time and under budget with zero surprises.',
    authorName: 'Mohamed Sinai',
    authorTitle: '',
  },
  {
    quote:
      'Their team integrated an ML recommendation engine into our platform within two sprints. They understood our data pipeline immediately and shipped clean, well-documented code.',
    authorName: 'Jay Smith',
    authorTitle: '',
  },
  {
    quote:
      'What stood out was their technical honesty. They pushed back on one of our feature ideas and explained clearly why it would hurt performance. That kind of judgment is rare in agencies.',
    authorName: 'Ahamed Sabri',
    authorTitle: '',
  },
  {
    quote:
      'Weblaud set up our entire CI/CD pipeline on AWS in two weeks. Deployment time dropped from hours of manual work to 12 minutes automated. That alone justified the engagement.',
    authorName: 'Kayode Okunubi',
    authorTitle: '',
  },
  {
    quote:
      'They delivered our high-performance dashboard with real-time WebSocket feeds and full risk visualization. Complex scope, executed cleanly and shipped on schedule.',
    authorName: 'Oliver Preisler',
    authorTitle: '',
  },
];

// TIMELINE/SAVINGS values inlined from weblaud-site/app/lib/constants.ts
const FAQ_SEED = [
  {
    question: 'What services does Weblaud LLC offer?',
    answer:
      'Weblaud LLC provides end-to-end software engineering including custom operations platforms, B2B SaaS web applications, cross-platform mobile apps (React Native & Flutter), production AI/LLM integrations, real-time WebSocket infrastructure, and cloud DevOps management.',
  },
  {
    question: 'How long does a software project take to ship?',
    answer:
      'We operate on focused, fixed-scope agile sprint cycles. Simple builds typically ship in 4 to 6 weeks, while full enterprise systems complete within 14 weeks. We provide detailed milestone roadmaps during discovery and host bi-weekly sprint reviews.',
  },
  {
    question: "What is Weblaud LLC's pricing model?",
    answer:
      'We operate on transparent, fixed-fee sprint pricing starting at $4,500 for MVP projects up to $18,500 for full enterprise platforms. You receive 100% IP source code ownership with zero unpredictable hourly billing or unexpected invoices.',
  },
  {
    question: 'Why hire Weblaud LLC instead of in-house software engineers?',
    answer:
      'Hiring a senior developer costs over $180,000 annually per engineer once salary, health benefits, and recruiting commissions are factored in—requiring 3 to 6 months just to hire. Weblaud LLC deploys an active senior squad instantly for a fixed sprint fee at under 30% of the cost.',
  },
  {
    question: 'Do you provide post-launch support and cloud maintenance?',
    answer:
      'Yes, we provide continuous SLA support packages including 99.9% uptime monitoring, automated database backups, security patch updates, and feature expansion as your active user base grows.',
  },
  {
    question: 'Can you integrate with our existing APIs, databases, or legacy systems?',
    answer:
      'Yes. We work with modern and legacy tech stacks, connecting directly to your existing PostgreSQL/MySQL databases, third-party APIs, and cloud services without disrupting active operational workflows.',
  },
];

const ABOUT_SEED = {
  isActive: true,
  story:
    'Weblaud started with a simple belief: great digital products begin with understanding people. We were a small team driven by curiosity and the desire to make technology feel clear and approachable. As we grew, that mindset shaped every project. We listen first, build with intention, and treat clients like partners. Today, we build reliable software and digital tools for growing businesses.',
  mission:
    'Our mission is to build technology that’s practical, human, and built to last. We aim to simplify complex challenges through honest communication, clean development, and solutions that support real business growth. Whether it’s AI, mobile apps, or cloud systems, we focus on making the process feel smooth and supportive at every step. We’re here to help you move forward with clarity and confidence.',
  trackRecord: [
    {
      title: '75+',
      subtitle: 'Projects Delivered',
      description: 'Enterprise systems, mobile apps, and custom software successfully shipped',
    },
    {
      title: '99%',
      subtitle: 'Client Satisfaction',
      description: 'Long-term partnerships built on transparency, quality, and proven results',
    },
    {
      title: '95%',
      subtitle: 'On-Time Delivery',
      description:
        'Milestone-driven sprints and transparent communication that keep projects on schedule',
    },
    {
      title: '8+',
      subtitle: 'Countries Served',
      description: 'Trusted by clients across North America, Europe, Asia, and the Middle East',
    },
  ],
};

const CONTACT_INFO_SEED = {
  email: 'info@weblaud.com',
  phone: '+1 (307) 220 9766',
  address: '1621 Central Ave, Cheyenne, WY 82001, USA',
};

const CALCULATOR_CONFIG_SEED = {
  baseCost: 4500,
  rangeSpreadPct: 0.28,
  roundToNearest: 500,
  projectTypes: [
    {
      id: 'operations',
      title: 'Operations Platform / Admin Portal',
      desc: 'Custom internal dashboards, RBAC workflows, data management to replace spreadsheets.',
      weeks: 6,
      costMultiplier: 1.0,
    },
    {
      id: 'webapp',
      title: 'SaaS & Web Application',
      desc: 'Customer-facing portal, subscription engine, high-concurrency cloud web app.',
      weeks: 8,
      costMultiplier: 1.25,
    },
    {
      id: 'mobile',
      title: 'Mobile App & Backend',
      desc: 'iOS & Android mobile apps paired with scalable cloud microservices.',
      weeks: 8,
      costMultiplier: 1.3,
    },
    {
      id: 'ai',
      title: 'AI & Machine Learning Engine',
      desc: 'Custom RAG pipelines, predictive analytics, automated decision-making models.',
      weeks: 10,
      costMultiplier: 1.5,
    },
  ],
  features: [
    { id: 'auth', title: 'User Auth & Multi-Role RBAC', desc: 'SSO, OAuth, granular permissions', weeks: 1, costMultiplier: 0.1 },
    { id: 'payments', title: 'Stripe / Payment Billing', desc: 'Subscriptions, invoicing, webhooks', weeks: 1, costMultiplier: 0.15 },
    { id: 'ai_integration', title: 'Custom AI / LLM Feature', desc: 'Smart search, automated summaries, predictions', weeks: 2, costMultiplier: 0.25 },
    { id: 'realtime', title: 'Real-time Sync & WebSockets', desc: 'Live chat, notifications, live data updates', weeks: 1.5, costMultiplier: 0.2 },
    { id: 'integrations', title: 'Third-Party API Integrations', desc: 'CRM, ERP, Quickbooks, Zapier connections', weeks: 1.5, costMultiplier: 0.15 },
    { id: 'mobile_sync', title: 'Offline Storage & Mobile Sync', desc: 'Offline capability for field workers', weeks: 2, costMultiplier: 0.2 },
  ],
  timelineSpeeds: [
    {
      id: 'standard',
      label: 'Standard Sprint Pace',
      multiplier: 1.0,
      desc: 'Regular agile iterations (4–14 weeks total)',
      weeksOffset: 0,
    },
    {
      id: 'expedited',
      label: 'Expedited Launch Pace',
      multiplier: 1.25,
      desc: 'Dedicated multi-engineer squad for accelerated delivery',
      weeksOffset: -2,
    },
  ],
};

// ---------------------------------------------------------------------------
// insights.ts is loaded programmatically (not transcribed) so the 21 full
// articles and their computed "N days ago" publish dates stay byte-accurate
// with what the site currently shows, instead of being hand-retyped.
// ---------------------------------------------------------------------------

interface RawInsight {
  slug: string;
  title: string;
  summary: string;
  category: string;
  readTime: string;
  date: string;
  author: { name: string; role: string; avatar: string };
  directAnswer: string;
  keyTakeaways: string[];
  content: { heading: string; text: string }[];
}

function loadInsightsModule(): {
  insights: RawInsight[];
  articleISODate: (d: string) => string;
} {
  const filePath = path.join(DATA_SOURCE_DIR, 'insights.ts');
  let src = fs.readFileSync(filePath, 'utf-8');

  // Inline the one cross-package import this file makes, using the values
  // in weblaud-site/app/lib/constants.ts, so this can run standalone.
  src = src.replace(
    /import\s*\{\s*TIMELINE,\s*SAVINGS\s*\}\s*from\s*["']~\/lib\/constants["'];?/,
    `const TIMELINE = ${JSON.stringify({
      min: 4,
      max: 14,
      range: '4 to 14 weeks',
      rangeShort: '4–14 weeks',
      mvp: '4 to 6 weeks',
      enterprise: 'within 14 weeks',
    })};\nconst SAVINGS = ${JSON.stringify({
      shareOfCost: 'under 30% of the cost',
      lowerCost: '70%+ lower cost',
      percent: '70%',
    })};`,
  );

  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
    },
  });

  const mod = { exports: {} as any };
  const fn = new Function('module', 'exports', 'require', outputText);
  fn(mod, mod.exports, require);
  return mod.exports;
}

// ---------------------------------------------------------------------------
// Seed steps
// ---------------------------------------------------------------------------

async function seedServices(model: Model<any>, uploadService: UploadService) {
  const count = await model.countDocuments();
  if (count > 0) {
    logger.log(`services: ${count} document(s) already present, skipping`);
    return;
  }
  for (const s of SERVICES_SEED) {
    const image = await uploadAsset(uploadService, s.imageAsset, 'services');
    await model.create({
      title: s.title,
      description: s.description,
      features: s.features,
      image,
    });
  }
  logger.log(`services: inserted ${SERVICES_SEED.length}`);
}

async function seedProjects(model: Model<any>, uploadService: UploadService) {
  let count = 0;
  for (const p of PROJECTS_SEED) {
    const existing = await model.findOne({ slug: p.slug });
    const coverImage = existing?.coverImage
      ? existing.coverImage
      : await uploadAsset(uploadService, p.imageAsset, 'projects');

    await model.findOneAndUpdate(
      { slug: p.slug },
      {
        slug: p.slug,
        name: p.name,
        description: p.description,
        featureList: p.features,
        coverImage,
        coverImageAlt: p.imageAlt,
        problem: p.problem,
        solution: p.solution,
        techStack: p.techStack,
        businessImpact: p.businessImpact,
      },
      { upsert: true, new: true },
    );
    count += 1;
  }
  logger.log(`projects: upserted ${count}`);
}

async function seedTeam(model: Model<any>, uploadService: UploadService) {
  const count = await model.countDocuments();
  if (count > 0) {
    logger.log(`team: ${count} document(s) already present, skipping`);
    return model.find().lean();
  }
  const created: any[] = [];
  for (let i = 0; i < TEAM_SEED.length; i++) {
    const t = TEAM_SEED[i];
    const avatar = await uploadAsset(uploadService, t.imageAsset, 'team-avatars');
    created.push(
      await model.create({
        name: t.name,
        title: t.title,
        avatar,
        order: i,
        isActive: true,
      }),
    );
  }
  logger.log(`team: inserted ${created.length}`);
  return created;
}

async function seedTestimonials(model: Model<any>) {
  const count = await model.countDocuments();
  if (count > 0) {
    logger.log(`testimonials: ${count} document(s) already present, skipping`);
    return;
  }
  for (const t of TESTIMONIALS_SEED) {
    await model.create({ ...t, isActive: true });
  }
  logger.log(`testimonials: inserted ${TESTIMONIALS_SEED.length}`);
}

async function seedFaqs(model: Model<any>) {
  const count = await model.countDocuments();
  if (count > 0) {
    logger.log(`faqs: ${count} document(s) already present, skipping`);
    return;
  }
  for (let i = 0; i < FAQ_SEED.length; i++) {
    await model.create({ ...FAQ_SEED[i], order: i, isActive: true });
  }
  logger.log(`faqs: inserted ${FAQ_SEED.length}`);
}

async function seedAbout(model: Model<any>) {
  const existing = await model.findOne();
  if (existing) {
    existing.isActive = ABOUT_SEED.isActive;
    existing.story = ABOUT_SEED.story;
    existing.mission = ABOUT_SEED.mission;
    existing.trackRecord = ABOUT_SEED.trackRecord;
    await existing.save();
    logger.log('about: updated existing singleton document');
  } else {
    await model.create(ABOUT_SEED);
    logger.log('about: created singleton document');
  }
}

async function seedContactInfo(model: Model<any>) {
  const existing = await model.findOne();
  if (existing) {
    existing.email = CONTACT_INFO_SEED.email;
    existing.phone = CONTACT_INFO_SEED.phone;
    existing.address = CONTACT_INFO_SEED.address;
    await existing.save();
    logger.log('contact-info: updated existing singleton document');
  } else {
    await model.create(CONTACT_INFO_SEED);
    logger.log('contact-info: created singleton document');
  }
}

async function seedCalculatorConfig(model: Model<any>) {
  const existing = await model.findOne();
  if (existing) {
    existing.baseCost = CALCULATOR_CONFIG_SEED.baseCost;
    existing.projectTypes = CALCULATOR_CONFIG_SEED.projectTypes;
    existing.features = CALCULATOR_CONFIG_SEED.features;
    existing.timelineSpeeds = CALCULATOR_CONFIG_SEED.timelineSpeeds;
    await existing.save();
    logger.log('calculator-config: updated existing singleton document');
  } else {
    await model.create(CALCULATOR_CONFIG_SEED);
    logger.log('calculator-config: created singleton document');
  }
}

async function seedInsights(model: Model<any>, teamDocs: any[]) {
  const { insights, articleISODate } = loadInsightsModule();
  const avatarByName = new Map<string, string>(
    teamDocs.map((t) => [t.name, t.avatar]),
  );

  let inserted = 0;
  let skipped = 0;
  for (const a of insights) {
    const existing = await model.findOne({ slug: a.slug });
    if (existing) {
      skipped += 1;
      continue;
    }

    const isoDate = articleISODate(a.date);
    const publishedAt = new Date(isoDate || a.date);

    await model.create({
      slug: a.slug,
      title: a.title,
      summary: a.summary,
      category: a.category,
      readTime: a.readTime,
      publishedAt,
      author: {
        name: a.author.name,
        role: a.author.role,
        avatarUrl: avatarByName.get(a.author.name) || undefined,
      },
      directAnswer: a.directAnswer,
      keyTakeaways: a.keyTakeaways,
      content: a.content,
      isActive: true,
    });
    inserted += 1;
  }
  logger.log(`insights: inserted ${inserted}, skipped ${skipped} (already existed)`);
}

// ---------------------------------------------------------------------------

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const uploadService = app.get(UploadService);

    const serviceModel = app.get<Model<any>>(getModelToken(Service.name));
    const projectModel = app.get<Model<any>>(getModelToken(Project.name));
    const insightModel = app.get<Model<any>>(getModelToken(Insight.name));
    const teamModel = app.get<Model<any>>(getModelToken(TeamMember.name));
    const testimonialModel = app.get<Model<any>>(getModelToken(Testimonial.name));
    const aboutModel = app.get<Model<any>>(getModelToken(AboutInfo.name));
    const contactInfoModel = app.get<Model<any>>(getModelToken(ContactInfo.name));
    const calculatorConfigModel = app.get<Model<any>>(
      getModelToken(CalculatorConfig.name),
    );
    const faqModel = app.get<Model<any>>(getModelToken(Faq.name));

    await seedServices(serviceModel, uploadService);
    await seedProjects(projectModel, uploadService);
    const teamDocs = await seedTeam(teamModel, uploadService);
    await seedTestimonials(testimonialModel);
    await seedFaqs(faqModel);
    await seedAbout(aboutModel);
    await seedContactInfo(contactInfoModel);
    await seedCalculatorConfig(calculatorConfigModel);
    await seedInsights(insightModel, teamDocs);

    logger.log('Migration complete.');
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  logger.error('Migration failed', err instanceof Error ? err.stack : err);
  process.exit(1);
});
