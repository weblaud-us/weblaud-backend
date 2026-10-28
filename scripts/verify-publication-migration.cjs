/** Exercises the real migration CLI on a uniquely named, local-only database.
 * node scripts/verify-publication-migration.cjs
 * Never loads AppModule, production environment, seeds or outbound providers.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const root = path.resolve(__dirname, '..');
const database = `weblaud_audit_migration_${randomUUID().replaceAll('-', '')}`;
const uri = `mongodb://127.0.0.1:27018/${database}`;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'weblaud-audit-migration-'));
const snapshot = path.resolve(root, '../weblaud-site/content/live-review/2026-10-23/cms');
const collections = { projects: 'projects', faqs: 'faqs', insights: 'insights', testimonials: 'testimonials', about: 'aboutinfos', 'calculator-config': 'calculatorconfigs', services: 'services' };
function run(args) {
  const result = spawnSync(process.execPath, ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'scripts/migrate-publication.ts', `--out=${output}`, ...args], {
    cwd: root, encoding: 'utf8', timeout: 90000,
    env: { ...process.env, MONGODB_URI: uri, ENV_FILE: '__no_environment_file__' },
  });
  if (result.status !== 0) throw Error(result.stderr || result.stdout || String(result.error));
  return result.stdout;
}
const files = suffix => fs.readdirSync(output).filter(name => name.endsWith(suffix)).sort();
async function main() {
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const checks = [];
  const passed = message => { checks.push(message); console.log(message); };
  try {
    const before = {};
    for (const [file, collection] of Object.entries(collections)) {
      const data = JSON.parse(fs.readFileSync(path.join(snapshot, file + '.json'), 'utf8')).data;
      const docs = (Array.isArray(data) ? data : [data]).map(doc => ({ ...doc, _id: new mongoose.Types.ObjectId(doc._id) }));
      if (docs.length) await connection.collection(collection).insertMany(docs);
      before[collection] = JSON.parse(JSON.stringify(docs));
    }
    run([]);
    for (const collection of Object.values(collections)) assert.deepEqual(JSON.parse(JSON.stringify(await connection.collection(collection).find().toArray())), before[collection]);
    passed('Dry run changes no database content');
    run(['--apply', `--confirm=${database}`]);
    const appliedPath = path.join(output, files('.applied.json').at(-1));
    const applied = JSON.parse(fs.readFileSync(appliedPath, 'utf8'));
    assert.equal(applied.conflicts.length, 0);
    assert.equal(await connection.collection('projects').countDocuments({ publicationStatus: 'illustrative' }), 6);
    assert.equal(await connection.collection('projects').countDocuments({ publicationStatus: 'draft' }), 9);
    passed('Apply publishes six reviewed examples and retains nine drafts');
    run([]);
    const again = JSON.parse(fs.readFileSync(path.join(output, files('.plan.json').at(-1)), 'utf8'));
    assert.equal(again.changes.length, 0);
    passed('Second dry run is idempotent');
    const example = await connection.collection('projects').findOne({ publicationStatus: 'illustrative' });
    await connection.collection('projects').updateOne({ _id: example._id }, { $set: { description: 'Concurrent CMS edit' } });
    run([`--rollback=${appliedPath}`, '--apply', `--confirm=${database}`]);
    const rollback = JSON.parse(fs.readFileSync(path.join(output, files('.rollback-result.json').at(-1)), 'utf8'));
    assert(rollback.conflicts.some(c => c.id === String(example._id)));
    const preserved = await connection.collection('projects').findOne({ _id: example._id });
    assert.equal(preserved.description, 'Concurrent CMS edit');
    assert.equal(preserved.publicationStatus, 'illustrative');
    assert.equal(preserved.businessImpact, example.businessImpact);
    passed('Rollback conflict leaves the entire edited project unchanged');
    await connection.collection('projects').updateOne({ _id: example._id }, { $set: { description: example.description } });
    run([`--rollback=${appliedPath}`, '--apply', `--confirm=${database}`]);
    for (const collection of Object.values(collections)) assert.deepEqual(JSON.parse(JSON.stringify(await connection.collection(collection).find().toArray())), before[collection]);
    passed('Guarded rollback restores every original field and unrelated setting');
    // A record changed since the review must not receive a publication status.
    await connection.collection('projects').updateOne({ slug: 'ai-document-intelligence-claims-processing' }, { $set: { businessImpact: 'Unreviewed new claim' } });
    run(['--apply', `--confirm=${database}`]);
    const skipped = await connection.collection('projects').findOne({ slug: 'ai-document-intelligence-claims-processing' });
    assert.equal(skipped.publicationStatus, undefined);
    assert.equal(skipped.businessImpact, 'Unreviewed new claim');
    passed('Conflicting review leaves the entire project unpublished');
    const report = path.resolve(root, '../weblaud-site/content/studio-review/2026-10-25-audit/migration.json');
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, JSON.stringify({ checks, passed: checks.length, localOnly: true, artifacts: output }, null, 2) + '\n');
    console.log(`${checks.length} migration checks passed. Report: ${report}`);
  } finally {
    if (connection.name === database && /^weblaud_audit_migration_[a-f0-9]{32}$/.test(database)) await connection.dropDatabase();
    await connection.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
