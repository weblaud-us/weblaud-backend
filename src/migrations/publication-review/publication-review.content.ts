/**
 * Reviewed CMS content for the 2026-10-25 publication audit. GENERATED from the
 * 2026-10-23 public CMS snapshot (weblaud-site/content/live-review/2026-10-23)
 * plus the reviewed copy, so every `before` value is the exact live text the
 * migration guards on. Edit the copy here only together with the snapshot
 * review; the planner refuses to touch a field whose current value matches
 * neither `before` nor `after`.
 */
/* eslint-disable prettier/prettier */

export interface FieldEdit<T = unknown> {
  before: T;
  after: T;
}

export interface ProjectReview {
  slug: string;
  publicationStatus: 'draft' | 'illustrative';
  evidenceNotes: string;
  fields: Record<string, FieldEdit>;
}

export interface FaqReview {
  /** The question as it stood in the snapshot (the match key). */
  question: string;
  fields: Record<string, FieldEdit<string>>;
}

/** Replaces `before` inside the string at `field` (a dot path). */
export interface TextEdit {
  slug: string;
  field: string;
  before: string;
  after: string;
}

export interface CalculatorTextEdit {
  speedId: string;
  field: string;
  before: string;
  after: string;
}

export const AUDIT_DATE = '2026-10-25';

export const PROJECT_REVIEW: ProjectReview[] = [
  {
    slug: 'ai-document-intelligence-claims-processing',
    publicationStatus: 'illustrative',
    evidenceNotes:
      'Publication audit 2026-10-25: published as an illustrative architecture example. This is not presented as delivered client work. The former outcome figures and client narrative were removed because no supporting evidence or publication permission is on file. Move to "verified" only with written evidence and the client\'s permission recorded here.',
    fields: {
      description: {
        before:
          'A production document intelligence pipeline that reads insurance claim PDFs and scans with OCR and an LLM, auto-processing 71% of claims end to end and cutting average handling time from 22 minutes to 3.',
        after:
          'An illustrative architecture for reading claim documents with OCR and a language model, extracting structured fields with confidence scores and routing uncertain cases to people for review.',
      },
      featureList: {
        before: [
          'OCR + LLM extraction of 40+ structured fields from PDFs and scans',
          'Field-level confidence scoring with a human review queue',
          'Evaluation harness over 5,000 labeled claims tracking accuracy & drift',
        ],
        after: [
          'OCR and LLM extraction of structured fields from PDFs and scans',
          'Field-level confidence scoring with a human review queue',
          'Evaluation harness over labelled historical documents, rerun on every model or prompt change',
        ],
      },
      problem: {
        before:
          'A third-party insurance administrator received claims as PDFs, faxes, and phone-camera photos, and adjusters keyed more than 40 fields per claim into the policy system by hand. At 22 minutes per claim the team could not keep pace with intake, and a multi-week backlog was pushing the administrator past its contractual turnaround times.',
        after:
          'Claims arrive as PDFs, faxes and phone photos, and adjusters re-key dozens of fields into the policy system by hand. Manual entry is slow, varies between people and makes intake backlogs difficult to clear.',
      },
      solution: {
        before:
          'We built a pipeline that runs every inbound document through OCR, extracts the structured claim fields with an LLM, and attaches a confidence score to each individual field. Claims where every field clears the threshold post straight to the policy system, while anything uncertain routes to a human review queue with the low-confidence fields highlighted against the source page. A separate evaluation harness replays 5,000 labeled historical claims on each model or prompt change so per-field accuracy and drift are measured before anything reaches production.',
        after:
          'Every inbound document runs through OCR, a language model extracts the structured claim fields and each field receives a confidence score. Claims that clear agreed thresholds can post to the policy system; anything uncertain goes to a review queue with the low-confidence fields highlighted against the source page. An evaluation harness replays a labelled set of historical claims on each model or prompt change, so accuracy and drift are measured before release.',
      },
      businessImpact: {
        before:
          'Cut average claim handling time from 22 minutes to 3, auto-processed 71% of claims with no human touch at 98.4% field-level accuracy on the evaluation set, and cleared the entire backlog within 5 weeks of go-live.',
        after:
          'Agree a baseline before a pilot, then measure handling time per claim, the share of claims completed without manual correction, field-level accuracy on a labelled evaluation set, reviewer workload and cost per processed claim, including human review.',
      },
    },
  },
  {
    slug: 'multi-warehouse-inventory-logistics-erp',
    publicationStatus: 'illustrative',
    evidenceNotes:
      'Publication audit 2026-10-25: published as an illustrative architecture example. This is not presented as delivered client work. The former outcome figures and client narrative were removed because no supporting evidence or publication permission is on file. Move to "verified" only with written evidence and the client\'s permission recorded here.',
    fields: {
      description: {
        before:
          'A custom warehouse management and logistics ERP that replaced nightly spreadsheet stock counts with real-time inventory, barcode scanning, and automated purchase orders across a distributor’s four distribution centers.',
        after:
          'An illustrative warehouse and logistics platform: live inventory from barcode scanning, reorder rules that draft purchase orders for approval, and a dispatch board with proof of delivery.',
      },
      featureList: {
        before: [
          'Real-time multi-warehouse inventory with barcode & QR scanning',
          'Automated reorder points, purchase orders & supplier workflows',
          'Delivery dispatch board with driver routing & proof-of-delivery',
        ],
        after: [
          'Live multi-warehouse inventory with barcode and QR scanning',
          'Reorder points that draft supplier purchase orders for approval',
          'Delivery dispatch board with driver assignment and proof of delivery',
        ],
      },
      problem: {
        before:
          'A regional distributor tracked stock across four distribution centers in spreadsheets that were only reconciled overnight, so the sales team routinely sold inventory that had already shipped, purchasing had no reliable reorder signal, and slow-moving stock sat undetected for months.',
        after:
          'When stock across several sites is reconciled from spreadsheets overnight, sales can promise inventory that has already shipped, purchasing lacks a reliable reorder signal and slow-moving stock goes unnoticed.',
      },
      solution: {
        before:
          'We built a single warehouse management platform with live inventory synced from handheld barcode scanners at every put-away, pick, and transfer, automated reorder points that generate supplier purchase orders without manual review, and a dispatch board that assigns deliveries to drivers and captures proof-of-delivery in the field.',
        after:
          'A single platform records every put-away, pick and transfer from handheld scanners, so stock levels update as the work happens. Reorder points generate draft purchase orders for approval, and a dispatch board assigns deliveries to drivers and captures proof of delivery in the field.',
      },
      businessImpact: {
        before:
          'Cut stock-count discrepancies by 92%, eliminated oversold orders entirely across all four warehouses, and reduced average pick-and-pack time by 40% in the first quarter after rollout.',
        after:
          'Agree a baseline before rollout, then measure stock-count discrepancies, oversold orders, pick-and-pack time and the time spent reconciling stock by hand.',
      },
    },
  },
  {
    slug: 'ai-support-assistant-rag-pipeline',
    publicationStatus: 'illustrative',
    evidenceNotes:
      'Publication audit 2026-10-25: published as an illustrative architecture example. This is not presented as delivered client work. The former outcome figures and client narrative were removed because no supporting evidence or publication permission is on file. Move to "verified" only with written evidence and the client\'s permission recorded here.',
    fields: {
      description: {
        before:
          "Production RAG pipeline and AI assistant trained securely on a company's private documentation, deployed as a support-deflection tool for its customer success team.",
        after:
          "An illustrative retrieval-augmented assistant that answers support agents' questions from a company's private documentation, citing its sources and routing low-confidence answers to human review.",
      },
      featureList: {
        before: [
          'Custom RAG pipeline over a private knowledge base',
          'AI assistant secured to company data, zero data leakage',
          'Evaluation framework tracking accuracy & hallucination rate',
        ],
        after: [
          'Retrieval pipeline over a private knowledge base',
          'Cited answers, with access limited to documents the agent may see',
          'Evaluation set tracking answer accuracy and unsupported answers',
        ],
      },
      problem: {
        before:
          "A B2B software company's support team was drowning in repetitive tickets that were already answered somewhere in their 400-page internal documentation, but agents couldn't search it fast enough to keep up with ticket volume.",
        after:
          'Support agents handle repetitive questions whose answers already exist somewhere in long internal documentation, but finding the right passage quickly becomes harder as ticket volume grows.',
      },
      solution: {
        before:
          "We built a production RAG pipeline that indexes the company's private documentation into a vector database, paired with an AI assistant that answers support agents' questions with cited sources in seconds. A rigorous evaluation framework tracks accuracy and flags low-confidence answers for human review before they reach a customer.",
        after:
          "The documentation is indexed into a vector store, and an assistant answers agents' questions with citations to the passages it used. An evaluation framework checks accuracy on representative questions and flags low-confidence answers for human review before they reach a customer.",
      },
      businessImpact: {
        before:
          'Cut average ticket resolution time by 45% within the first 6 weeks and reduced escalations to senior support staff by a third, with no drop in customer satisfaction scores.',
        after:
          'Agree a baseline before a pilot, then measure resolution time, escalation rate, the share of answers agents accept without correction, the rate of unsupported answers and cost per resolved ticket.',
      },
    },
  },
  {
    slug: 'b2b-saas-subscription-platform',
    publicationStatus: 'illustrative',
    evidenceNotes:
      'Publication audit 2026-10-25: published as an illustrative architecture example. This is not presented as delivered client work. The former outcome figures and client narrative were removed because no supporting evidence or publication permission is on file. Move to "verified" only with written evidence and the client\'s permission recorded here.',
    fields: {
      description: {
        before:
          'Multi-tenant SaaS platform built for scale from day one — subscription billing, secure tenant isolation, and zero-downtime deploys.',
        after:
          'An illustrative multi-tenant SaaS architecture with tenant data isolation, Stripe subscription billing and an automated release pipeline.',
      },
      featureList: {
        before: [
          'Multi-tenant architecture with secure data isolation',
          'Stripe-powered subscription billing & plan management',
          'Zero-downtime CI/CD pipeline with automated testing',
        ],
        after: [
          'Multi-tenant architecture with tenant data isolation',
          'Stripe subscription billing and plan management',
          'CI/CD pipeline with automated test gates',
        ],
      },
      problem: {
        before:
          "An early-stage SaaS startup had validated demand with a single-tenant prototype, but the codebase couldn't support paying customers — no subscription billing, no tenant isolation, and every deploy required a maintenance window.",
        after:
          'A single-tenant prototype can show interest in a product, but it rarely supports paying customers: subscription billing and tenant isolation are missing, and each release may need a maintenance window.',
      },
      solution: {
        before:
          'We re-architected the application into a secure multi-tenant platform, integrated Stripe for self-serve subscription billing and plan upgrades, and built a CI/CD pipeline with automated test gates enabling zero-downtime deploys multiple times a week.',
        after:
          'The application is restructured into a multi-tenant platform with isolation enforced at the data layer. Stripe handles self-serve subscriptions and plan changes, and a CI/CD pipeline with automated test gates supports frequent releases designed to avoid maintenance windows.',
      },
      businessImpact: {
        before:
          'Went from zero to 40 paying tenants in the first quarter post-launch with zero billing incidents, and cut average deploy time from a 2-hour maintenance window to under 10 minutes with no downtime.',
        after:
          'Measure completion of the core user task, sign-up-to-paid conversion through the billing flow, billing errors, release frequency and failed deployments. A working product is evidence for the next product decision, not proof of demand.',
      },
    },
  },
  {
    slug: 'offline-first-field-service-app',
    publicationStatus: 'illustrative',
    evidenceNotes:
      'Publication audit 2026-10-25: published as an illustrative architecture example. This is not presented as delivered client work. The former outcome figures and client narrative were removed because no supporting evidence or publication permission is on file. Move to "verified" only with written evidence and the client\'s permission recorded here.',
    fields: {
      description: {
        before:
          'Cross-platform Flutter app and API backend giving field technicians full functionality in zero-connectivity environments, with automatic background sync.',
        after:
          'An illustrative cross-platform field app that lets technicians complete work orders, photos and payments without a connection, syncing in the background when signal returns.',
      },
      featureList: {
        before: [
          'Single Flutter codebase for iOS, Android & Web',
          'Offline-first local storage with background sync',
          'Push notifications & in-app payment collection',
        ],
        after: [
          'Single Flutter codebase for iOS and Android',
          'Offline-first local storage with background sync',
          'Push notifications and in-app payment collection',
        ],
      },
      problem: {
        before:
          "A field services company's technicians regularly lost work orders and photo documentation when cellular signal dropped in basements, rural sites, and metal-frame buildings, forcing them to redo paperwork back at the office.",
        after:
          'Technicians working in basements, rural sites or metal-framed buildings can lose work orders and photos when the signal drops, and then redo paperwork back at the office.',
      },
      solution: {
        before:
          'We built a single Flutter codebase for iOS and Android backed by local-first storage, so technicians can complete work orders, capture photos, and collect payment entirely offline. A background sync queue pushes everything to the cloud API the moment connectivity returns.',
        after:
          'A single Flutter codebase for iOS and Android stores work locally first, so technicians can complete work orders, capture photos and collect payment offline. A background sync queue sends everything to the cloud API when connectivity returns, with agreed rules for records edited in two places.',
      },
      businessImpact: {
        before:
          'Eliminated redone paperwork from lost connectivity, cut average job completion time by 25%, and gave dispatch real-time visibility into technician status even in low-signal areas.',
        after:
          'Measure jobs completed without re-entry, sync failures and conflicts, the time between job completion and office visibility, and technician adoption.',
      },
    },
  },
  {
    slug: 'legacy-monolith-modernization-engineering-pod',
    publicationStatus: 'illustrative',
    evidenceNotes:
      'Publication audit 2026-10-25: published as an illustrative architecture example. This is not presented as delivered client work. The former outcome figures and client narrative were removed because no supporting evidence or publication permission is on file. Move to "verified" only with written evidence and the client\'s permission recorded here.',
    fields: {
      name: {
        before:
          'Legacy Monolith Modernization with an Embedded Engineering Pod',
        after: 'Incremental Legacy Monolith Modernization',
      },
      coverImageAlt: {
        before:
          'Embedded engineering pod modernizing a legacy monolith alongside an in-house team',
        after:
          'Engineers reviewing code during an incremental legacy monolith modernization',
      },
      description: {
        before:
          'An embedded senior engineering pod that carved a 12-year-old PHP monolith into deployable services alongside the client’s own team, taking releases from quarterly to daily with no feature freeze and no rewrite from scratch.',
        after:
          'An illustrative strangler-fig approach to modernizing a legacy monolith: characterization tests first, then high-change areas moved into separately deployable services alongside the in-house team.',
      },
      featureList: {
        before: [
          'Strangler-fig migration with zero-downtime cutover, service by service',
          'Automated test harness & CI/CD replacing manual quarterly releases',
          'Pair programming and handover so the in-house team owns the result',
        ],
        after: [
          'Strangler-fig migration with incremental cutover and a rollback path',
          'Characterization tests and CI/CD replacing manual regression releases',
          'Pairing and handover so the in-house team owns the result',
        ],
      },
      problem: {
        before:
          'A logistics software company depended on a 12-year-old PHP monolith with no automated tests, a release process that took a weekend of manual regression checks, and a handful of original authors who had long since left. Shipping had slowed to roughly one release a quarter, onboarding a new engineer took two months, and leadership had been quoted an 18-month full rewrite that would have frozen the product roadmap for the duration.',
        after:
          'An older monolith with no automated tests, a manual regression process and few remaining original authors slows both releases and onboarding. A full rewrite can freeze the product roadmap for a long time.',
      },
      solution: {
        before:
          'Instead of a rewrite we embedded a three-engineer senior pod into the client’s existing sprints and applied a strangler-fig migration: characterization tests first to pin down current behavior, then the highest-churn areas extracted one at a time into independently deployable services behind a routing layer, each cut over with traffic shifting and an instant rollback path. CI/CD with automated test gates replaced the manual regression weekend. Every extraction was paired with a client engineer, so the in-house team owns and extends the new services rather than depending on us.',
        after:
          'Characterization tests first pin down current behavior. The highest-change areas are then extracted one at a time into independently deployable services behind a routing layer, each cut over gradually with a rollback path. CI/CD with automated test gates replaces manual regression checks, and each extraction is paired with an in-house engineer.',
      },
      businessImpact: {
        before:
          'Took releases from quarterly to daily with no feature freeze, cut new-engineer onboarding from 8 weeks to under 2, and avoided the 18-month rewrite entirely — the roadmap kept shipping throughout the migration.',
        after:
          'Agree a pre-migration baseline, then measure release frequency, change failure rate, time to restore service, regression defects and onboarding time for new engineers.',
      },
    },
  },
  {
    slug: 'enterprise-operations-erp-platform',
    publicationStatus: 'draft',
    evidenceNotes:
      'Publication audit 2026-10-25: set to draft. It overlaps the multi-warehouse operations example. The outcome figures and client narrative have no supporting evidence or publication permission on file. Keep unpublished until both are recorded here, or rewrite as an illustrative example without outcome claims.',
    fields: {},
  },
  {
    slug: 'programmatic-seo-aeo-content-platform',
    publicationStatus: 'draft',
    evidenceNotes:
      'Publication audit 2026-10-25: set to draft. It falls outside the current positioning, and its traffic and AI-citation figures are unverified. The outcome figures and client narrative have no supporting evidence or publication permission on file. Keep unpublished until both are recorded here, or rewrite as an illustrative example without outcome claims.',
    fields: {},
  },
  {
    slug: 'fintech-wallet-kyc-mobile-app',
    publicationStatus: 'draft',
    evidenceNotes:
      'Publication audit 2026-10-25: set to draft. Its compliance, onboarding and volume claims would need evidence. The outcome figures and client narrative have no supporting evidence or publication permission on file. Keep unpublished until both are recorded here, or rewrite as an illustrative example without outcome claims.',
    fields: {},
  },
  {
    slug: 'realtime-auction-live-bidding-platform',
    publicationStatus: 'draft',
    evidenceNotes:
      'Publication audit 2026-10-25: set to draft. Its concurrency, latency and dispute figures are unverified. The outcome figures and client narrative have no supporting evidence or publication permission on file. Keep unpublished until both are recorded here, or rewrite as an illustrative example without outcome claims.',
    fields: {},
  },
  {
    slug: 'headless-ecommerce-storefront-checkout-rebuild',
    publicationStatus: 'draft',
    evidenceNotes:
      'Publication audit 2026-10-25: set to draft. Its conversion and performance figures are unverified. The outcome figures and client narrative have no supporting evidence or publication permission on file. Keep unpublished until both are recorded here, or rewrite as an illustrative example without outcome claims.',
    fields: {},
  },
  {
    slug: 'fleet-telematics-live-delivery-tracking-platform',
    publicationStatus: 'draft',
    evidenceNotes:
      'Publication audit 2026-10-25: set to draft. Its support-call and on-time delivery figures are unverified. The outcome figures and client narrative have no supporting evidence or publication permission on file. Keep unpublished until both are recorded here, or rewrite as an illustrative example without outcome claims.',
    fields: {},
  },
  {
    slug: 'hipaa-clinic-management-patient-portal',
    publicationStatus: 'draft',
    evidenceNotes:
      'Publication audit 2026-10-25: set to draft. Its HIPAA and business associate agreement claims would need evidence and legal review. The outcome figures and client narrative have no supporting evidence or publication permission on file. Keep unpublished until both are recorded here, or rewrite as an illustrative example without outcome claims.',
    fields: {},
  },
  {
    slug: 'self-hosted-video-voice-infrastructure',
    publicationStatus: 'draft',
    evidenceNotes:
      'Publication audit 2026-10-25: set to draft. It claims a 99.9% uptime SLA and cost savings without evidence. The outcome figures and client narrative have no supporting evidence or publication permission on file. Keep unpublished until both are recorded here, or rewrite as an illustrative example without outcome claims.',
    fields: {},
  },
  {
    slug: 'dedicated-engineering-pod-scaling-sprint',
    publicationStatus: 'draft',
    evidenceNotes:
      'Publication audit 2026-10-25: set to draft. Its staffing (a senior pod within 48 hours) and timeline claims are unverified. The outcome figures and client narrative have no supporting evidence or publication permission on file. Keep unpublished until both are recorded here, or rewrite as an illustrative example without outcome claims.',
    fields: {},
  },
];

export const FAQ_REVIEW: FaqReview[] = [
  {
    question: 'How long does a software project take to ship?',
    fields: {
      answer: {
        before:
          'We operate on focused, fixed-scope agile sprint cycles. Simple builds typically ship in 4 to 6 weeks, while full enterprise systems complete within 14 weeks. We provide detailed milestone roadmaps during discovery and host bi-weekly sprint reviews.',
        after:
          'It depends on scope, integrations, data readiness and how quickly access and decisions are available. A focused pilot or first product milestone is planned around a small, testable scope. Larger production work is planned in milestones once the requirements have been reviewed. We agree the milestone plan after discovery rather than promising a standard delivery window.',
      },
    },
  },
  {
    question: "What is Weblaud LLC's pricing model?",
    fields: {
      answer: {
        before:
          'We operate on transparent, fixed-fee sprint pricing starting at $4,500 for MVP projects up to $18,500 for full enterprise platforms. You receive 100% IP source code ownership with zero unpredictable hourly billing or unexpected invoices.',
        after:
          'Pricing follows the agreed scope. A focused pilot or first product milestone is priced for a defined, testable outcome. Production implementation is proposed once the pilot or milestone has been reviewed, and ongoing engineering or support is scoped as a separate agreement. Each proposal identifies exclusions, dependencies, and hosting, third-party and AI usage costs. The online estimator gives an indicative starting point, not a quote.',
      },
    },
  },
  {
    question: 'Why hire Weblaud LLC instead of in-house software engineers?',
    fields: {
      answer: {
        before:
          'Hiring a senior developer costs over $180,000 annually per engineer once salary, health benefits, and recruiting commissions are factored in—requiring 3 to 6 months just to hire. Weblaud LLC deploys an active senior squad instantly for a fixed sprint fee at under 30% of the cost.',
        after:
          'It depends on how long you need the capability. An in-house team suits long-term ownership of a core product. An external team can help when you need a defined outcome, specialist experience or extra capacity before hiring makes sense. Compare the total cost, ramp-up time, knowledge transfer and who will maintain the system afterwards.',
      },
      question: {
        before: 'Why hire Weblaud LLC instead of in-house software engineers?',
        after:
          'When does working with Weblaud make more sense than hiring in-house?',
      },
    },
  },
  {
    question: 'Do you provide post-launch support and cloud maintenance?',
    fields: {
      answer: {
        before:
          'Yes, we provide continuous SLA support packages including 99.9% uptime monitoring, automated database backups, security patch updates, and feature expansion as your active user base grows.',
        after:
          'Yes, as a separately scoped agreement. It can include monitoring, backups, security updates and improvements. Coverage, response expectations, hosting and third-party costs are agreed explicitly rather than assumed.',
      },
    },
  },
  {
    question:
      'Can you integrate with our existing APIs, databases, or legacy systems?',
    fields: {
      answer: {
        before:
          'Yes. We work with modern and legacy tech stacks, connecting directly to your existing PostgreSQL/MySQL databases, third-party APIs, and cloud services without disrupting active operational workflows.',
        after:
          'Yes. We plan integrations with existing databases, third-party APIs and cloud services. Access, data quality and the cutover approach are reviewed during discovery, so changes to live workflows are planned and tested before release.',
      },
    },
  },
];

export const INSIGHT_REVIEW: TextEdit[] = [
  {
    slug: 'accelerating-enterprise-time-to-market-agile-sprints',
    field: 'title',
    before:
      'How Modern Enterprises Accelerate Time-to-Market with Fixed-Scope 4-to-14 Week Agile Sprints',
    after:
      'How Modern Enterprises Accelerate Time-to-Market with Fixed-Scope Agile Milestones',
  },
  {
    slug: 'accelerating-enterprise-time-to-market-agile-sprints',
    field: 'summary',
    before:
      'Learn how fixed-scope 4-to-14 week agile sprints de-risk software investments.',
    after:
      'Learn how fixed-scope agile milestones de-risk software investments.',
  },
  {
    slug: 'accelerating-enterprise-time-to-market-agile-sprints',
    field: 'directAnswer',
    before:
      'Fixed-scope 4-to-14 week software sprints de-risk enterprise technology investments by delivering functional production software incrementally.',
    after:
      'Fixed-scope software milestones de-risk enterprise technology investments by delivering functional software incrementally.',
  },
  {
    slug: 'accelerating-enterprise-time-to-market-agile-sprints',
    field: 'keyTakeaways.0',
    before:
      'Scoping software into 4-to-14 week milestones eliminates budget overruns and scope creep.',
    after:
      'Scoping software into reviewable milestones makes budget and scope changes visible early.',
  },
  {
    slug: 'accelerating-enterprise-time-to-market-agile-sprints',
    field: 'content.1.heading',
    before: 'The 4-to-14 Week Sprint Framework',
    after: 'The Milestone Framework',
  },
  {
    slug: 'accelerating-enterprise-time-to-market-agile-sprints',
    field: 'content.1.text',
    before:
      'At Weblaud LLC, we compress technology delivery into focused, fixed-scope sprints that run 4 to 14 weeks depending on scope.',
    after:
      'At Weblaud LLC, we plan delivery as focused milestones sized to the agreed scope, so each one ends with working software that can be reviewed.',
  },
  {
    slug: 'legacy-system-modernization-roi-refactor-vs-rebuild',
    field: 'content.2.text',
    before:
      'Both paths are scoped as fixed 4 to 14 weeks sprints rather than open-ended rewrites,',
    after:
      'Both paths are scoped as defined milestones rather than open-ended rewrites,',
  },
  {
    slug: 'legacy-system-modernization-roi-refactor-vs-rebuild',
    field: 'content.2.text',
    before:
      '[How Modern Enterprises Accelerate Time-to-Market with Fixed-Scope 4 to 14 weeks Agile Sprints]',
    after:
      '[How Modern Enterprises Accelerate Time-to-Market with Fixed-Scope Agile Milestones]',
  },
  {
    slug: 'multi-tenant-saas-billing-architecture-roi-stripe-native',
    field: 'content.2.text',
    before:
      'A custom engine removes that recurring cost entirely and ships inside a 4 to 14 weeks sprint.',
    after:
      'A custom engine can remove that recurring cost, with its scope and delivery milestones agreed after discovery.',
  },
  {
    slug: 'custom-checkout-engineering-roi-owning-your-payment-stack',
    field: 'content.2.text',
    before: 'Most storefront rebuilds ship inside 4 to 14 weeks.',
    after:
      'Delivery time depends on catalog size, integrations and checkout requirements, and is planned in milestones after discovery.',
  },
  {
    slug: 'dedicated-engineering-pods-vs-freelancers-agencies-roi',
    field: 'content.2.text',
    before:
      'A dedicated pod bills transparently per sprint, joins your daily standups, and ships production code inside our standard 4 to 14 weeks delivery window — with no bench time, no recruiting cost, and no severance risk.',
    after:
      'A dedicated pod works to an agreed scope and billing schedule, joins your daily standups and ships against milestones agreed up front, without the recruiting cost or long-term commitment of a permanent hire.',
  },
{
  "slug": "devops-cicd-automation-cutting-deployment-times-15-minutes",
  "field": "content.2.text",
  "before": "Shifting to automated CI/CD enables engineering teams to deploy bug fixes and new features multiple times per day with 99.99% uptime guarantees.",
  "after": "Automated CI/CD can shorten release cycles. Availability targets depend on the system architecture, operations and support agreement; deployment automation alone does not guarantee uptime."
}
];

export const CALCULATOR_REVIEW: CalculatorTextEdit[] = [
  {
    speedId: 'standard',
    field: 'desc',
    before: 'Regular agile iterations (4–14 weeks total)',
    after:
      'Regular agile iterations; the total length follows the selected scope',
  },
];

export const SERVICE_REVIEW = [
  {
    "title": "Real-Time Infrastructure & Streaming",
    "fields": {
      "features": {
        "before": [
          "Custom WebRTC / LiveKit video & real-time chat",
          "Automated DevOps, CI/CD, backups & 99.9% uptime",
          "Load-tested, fully documented & zero vendor lock-in"
        ],
        "after": [
          "Custom WebRTC / LiveKit video & real-time chat",
          "Automated deployment, backups and monitoring; service targets agreed for each engagement",
          "Load-tested, fully documented & zero vendor lock-in"
        ]
      }
    }
  }
];
