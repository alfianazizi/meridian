import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { openDatabase } from '../db/connection.js';
import { currentSchemaVersion } from '../db/schema.js';

const databasePath = resolve(process.env.DASHBOARD_DB ?? 'data/analytics.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
const db = openDatabase(databasePath);
console.log(JSON.stringify({ database: databasePath, schema_version: currentSchemaVersion(db) }));
db.close();
