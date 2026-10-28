/** Separate text-only revision. Uses the publication runner's guarded writes,
 * dry-run, snapshot and rollback engine. Apply the publication audit first.
 * pnpm migrate:editorial [--snapshot=<cms dir> --snapshot-out=<new dir>]
 * Database writes require --apply --confirm=<database name>.
 */
process.argv.push('--editorial');
require('./migrate-publication');
export {};
