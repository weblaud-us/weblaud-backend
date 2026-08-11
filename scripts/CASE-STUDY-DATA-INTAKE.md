# Case Study Data Intake

Every `businessImpact` line currently published in `PROJECTS_SEED`
(`scripts/migrate-content.ts`) is **illustrative** — representative of typical
engagement outcomes, not measured per-client results. The site says so in one
place, `RESULTS_DISCLOSURE` in `weblaud-site/app/lib/constants.ts`, which is
rendered on `/projects`, on every `/projects/:slug`, and in `/llms-full.txt`.

The goal of this intake is to replace illustrative figures with real, sourced
ones on the studies where we actually have data. Real specifics on three
studies are worth more than invented specifics on eleven.

## The rule

A case study graduates out from under the disclosure only when **every number
in its `businessImpact` line traces to a source someone outside the company
could check** — an invoice, a dashboard export, a ticketing report, a signed
client statement. Partial sourcing does not count: one invented number in the
sentence keeps the whole study illustrative.

When a study graduates, note it in the PR so we can eventually narrow or drop
the blanket disclosure rather than leaving verified work sitting under it.

## Priority candidates

These three are ranked by how cheaply the numbers can be sourced and how
directly they support the pricing claims already on the site.

### 1. `self-hosted-video-voice-infrastructure`

The strongest ROI story we have, because both sides come off invoices.

- [ ] Prior vendor's monthly bill, 3 months before cutover (currency + amount)
- [ ] Self-hosted infrastructure cost, 3 months after cutover
- [ ] Monthly session minutes over the same period (proves like-for-like volume)
- [ ] Our one-time build fee
- [ ] Measured uptime since launch, and the source (status page? Datadog?)
- [ ] Payback period = build fee ÷ monthly saving — compute, don't estimate

### 2. `dedicated-engineering-pod-scaling-sprint`

Ties directly to the `SAVINGS` constant, so a real number here strengthens a
claim already made site-wide.

- [ ] Total sprint fees invoiced for the engagement
- [ ] Number of engineers and engagement length in weeks
- [ ] Client's loaded cost per in-house senior hire, if they'll share it
- [ ] What actually shipped, and the original roadmap date it was due
- [ ] Whether the funding-round claim is real and citable, or should be cut

### 3. `ai-document-intelligence-claims-processing`

Time savings convert to money cleanly here, given volume.

- [ ] Average handling time before, and how it was measured
- [ ] Average handling time after, same measurement method
- [ ] Claims processed per month
- [ ] Loaded hourly cost of an adjuster
- [ ] Share of claims auto-processed with no human touch
- [ ] Field-level accuracy, and the size/date of the evaluation set

## Permission

Named clients need written sign-off on the exact sentence we publish. If sign-off
isn't available, anonymize by sector and region ("a Wyoming-based logistics
distributor") — that keeps the study usable and is still a real result. What is
not acceptable is naming a client without approval, or keeping a precise figure
while dropping the name to avoid asking.

## Handing the data back

Send the filled-in numbers and I'll rewrite the `businessImpact` lines against
them, then re-run just the projects step:

```
cd backend && npm run migrate:content -- --only=projects
```

The `--only` flag matters: a full run also overwrites the `about`,
`contact-info`, and `calculator-config` singletons with seed values, reverting
any edits made through the admin CMS.
