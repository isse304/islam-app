import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, '../db/sql');
const MIGRATIONS_TABLE = 'applied_migrations';

async function getClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }
  
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  return pool.connect();
}

async function ensureMigrationsTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client: any): Promise<Set<string>> {
  const result = await client.query(`SELECT filename FROM ${MIGRATIONS_TABLE};`);
  return new Set(result.rows.map((r: { filename: string }) => r.filename));
}

async function runMigration(client: any, file: string) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  const sql = await fs.readFile(filePath, 'utf-8');
  
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(`INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES ($1);`, [file]);
    await client.query('COMMIT');
    console.log(`✅ Applied migration: ${file}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Failed to apply migration ${file}:`, err);
    throw err;
  }
}

async function main() {
  let client;
  try {
    client = await getClient();
    await ensureMigrationsTable(client);

    const appliedMigrations = await getAppliedMigrations(client);
    const migrationFiles = (await fs.readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();

    for (const file of migrationFiles) {
      if (!appliedMigrations.has(file)) {
        await runMigration(client, file);
      } else {
        console.log(`🔷 Skipping already applied migration: ${file}`);
      }
    }

    console.log('✨ All migrations applied successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.release();
    }
  }
}

main();
