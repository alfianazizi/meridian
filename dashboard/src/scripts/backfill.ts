import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openDatabase } from '../db/connection.js';
import { backfill } from '../ingest/backfill.js';

const databasePath = resolve(process.env.DASHBOARD_DB ?? 'data/analytics.sqlite');
const repositoryRoot = resolve(process.env.MERIDIAN_ROOT ?? '..');
mkdirSync(dirname(databasePath), { recursive: true });
const db = openDatabase(databasePath);
const summary = backfill(db, repositoryRoot);
console.log(JSON.stringify({ database: databasePath, repository_root: repositoryRoot, ...summary }, null, 2));
db.close();
