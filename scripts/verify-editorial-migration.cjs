/** Real CLI acceptance against a unique local-only DB. Does not start Nest,
 * load production configuration or contact email/booking providers. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const root = path.resolve(__dirname, '..');
const database = 'weblaud_editorial_' + randomUUID().replaceAll('-', '');
const uri = 'mongodb://127.0.0.1:27018/' + database;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'weblaud-editorial-'));
const snapshot = path.resolve(root, '../weblaud-site/content/live-review/2026-10-23/cms');
const collections = { projects: 'projects', services: 'services', faqs: 'faqs', insights: 'insights', testimonials: 'testimonials', about: 'aboutinfos', 'calculator-config': 'calculatorconfigs' };
function run(script, args, expectFailure = false) {
  const result = spawnSync(process.execPath, ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', script, '--out=' + output, ...args], {
    cwd: root, encoding: 'utf8', timeout: 90000,
    env: { ...process.env, MONGODB_URI: uri, ENV_FILE: '__no_environment_file__' },
  });
  if (expectFailure) { assert.notEqual(result.status, 0); return; }
  if (result.status !== 0) throw Error(result.stderr || result.stdout || String(result.error));
  return result.stdout;
}
const editorial = args => run('scripts/migrate-editorial.ts', args);
const latest = suffix => path.join(output, fs.readdirSync(output).filter(f => f.endsWith(suffix)).sort().at(-1));
const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
async function main() {
  const connection = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
  const checks = [];
  const passed = text => { checks.push(text); console.log(text); };
  const all = async () => {
    const result = {};
    for (const name of Object.values(collections)) result[name] = JSON.parse(JSON.stringify(await connection.collection(name).find().toArray()));
    return result;
  };
  try {
    for (const [file, name] of Object.entries(collections)) {
      const data = json(path.join(snapshot, file + '.json')).data;
      const docs = (Array.isArray(data) ? data : [data]).map(d => ({ ...d, _id: new mongoose.Types.ObjectId(d._id) }));
      if (docs.length) await connection.collection(name).insertMany(docs);
    }
    run('scripts/migrate-publication.ts', ['--apply', '--confirm=' + database]);
    assert.equal(await connection.collection('projects').countDocuments({ publicationStatus: 'illustrative' }), 6);
    assert.equal(await connection.collection('projects').countDocuments({ publicationStatus: 'draft' }), 9);
    const before = await all();
    passed('Original audit applies before the separate editorial revision');
    editorial([]);
    assert.deepEqual(await all(), before);
    const plan = json(latest('.plan.json'));
    assert.equal(plan.skipped.length, 0);
    assert.equal(new Set(plan.changes.map(c => c.id)).size, 41);
    passed('Dry run reviews 41 records without database writes');
    run('scripts/migrate-editorial.ts', ['--apply', '--confirm=wrong-database'], true);
    assert.deepEqual(await all(), before);
    passed('Wrong database confirmation refuses writes');
    editorial(['--apply', '--confirm=' + database]);
    const appliedPath = latest('.applied.json');
    const applied = json(appliedPath);
    assert.equal(applied.status, 'complete');
    assert.equal(applied.conflicts.length, 0);
    assert.equal(applied.applied.length, plan.changes.length);
    const after = await all();
    for (let i = 0; i < before.projects.length; i++) {
      for (const key of ['publicationStatus', 'evidenceNotes', 'slug']) assert.deepEqual(after.projects[i][key], before.projects[i][key]);
    }
    assert.deepEqual(after.testimonials, before.testimonials);
    assert.deepEqual(after.aboutinfos[0].trackRecord, before.aboutinfos[0].trackRecord);
    const stripCopy = value => {
      const clone = structuredClone(value);
      for (const field of ['projectTypes', 'timelineSpeeds']) for (const option of clone[field]) { delete option.desc; delete option.label; }
      return clone;
    };
    assert.deepEqual(stripCopy(after.calculatorconfigs[0]), stripCopy(before.calculatorconfigs[0]));
    passed('Apply retains publication/evidence, quotations and calculator arithmetic; rollback data is complete');
    editorial([]);
    assert.equal(json(latest('.plan.json')).changes.length, 0);
    passed('Second editorial run is idempotent');
    const example = await connection.collection('projects').findOne({ publicationStatus: 'illustrative' });
    const article = await connection.collection('insights').findOne({});
    await connection.collection('projects').updateOne({ _id: example._id }, { $set: { publicationStatus: 'verified' } });
    await connection.collection('insights').updateOne({ _id: article._id }, { $set: { title: 'Later CMS title' } });
    editorial(['--rollback=' + appliedPath, '--apply', '--confirm=' + database]);
    const rollback = json(latest('.rollback-result.json'));
    assert(rollback.conflicts.some(c => c.id === String(example._id)));
    assert(rollback.conflicts.some(c => c.id === String(article._id)));
    assert.equal((await connection.collection('projects').findOne({ _id: example._id })).description, example.description);
    assert.equal((await connection.collection('insights').findOne({ _id: article._id })).title, 'Later CMS title');
    passed('Rollback protects later publication decisions and leaves edited articles atomic');
    await connection.collection('projects').updateOne({ _id: example._id }, { $set: { publicationStatus: 'illustrative' } });
    await connection.collection('insights').updateOne({ _id: article._id }, { $set: { title: article.title } });
    editorial(['--rollback=' + appliedPath, '--apply', '--confirm=' + database]);
    assert.deepEqual(await all(), before);
    passed('Guarded rollback restores the complete post-audit content baseline');
    await connection.collection('projects').updateOne({ _id: example._id }, { $set: { description: 'Later CMS description' } });
    editorial(['--apply', '--confirm=' + database]);
    const preserved = await connection.collection('projects').findOne({ _id: example._id });
    assert.equal(preserved.description, 'Later CMS description');
    assert.equal(preserved.solution, before.projects.find(p => p._id === String(example._id)).solution);
    passed('Apply conflict preserves the entire edited record');
    const report = path.resolve(root, '../weblaud-site/content/studio-review/2026-10-25-editorial/migration.json');
    fs.mkdirSync(path.dirname(report), { recursive: true });
    fs.writeFileSync(report, JSON.stringify({ checks, passed: checks.length, localOnly: true, artifacts: output }, null, 2) + '\n');
  } finally {
    if (connection.name === database && /^weblaud_editorial_[a-f0-9]{32}$/.test(database)) await connection.dropDatabase();
    await connection.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
