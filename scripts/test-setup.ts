import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TestSchema {
  databaseUrl: string;
  schema: string;
}

/**
 * Crea un schema limpio en la DB existente y devuelve una URL con search_path
 * apuntando a ese schema. Las migraciones SQL se corren manualmente después
 * usando `runSqlMigrations()`.
 */
export async function setupTestSchema(
  baseDatabaseUrl: string,
  schema: string,
): Promise<TestSchema> {
  const pool = new Pool({ connectionString: baseDatabaseUrl });
  try {
    // Limpia cualquier leftover de corridas anteriores
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query(`CREATE SCHEMA "${schema}"`);
  } finally {
    await pool.end();
  }

  // Devuelve la URL con search_path apuntando al schema de test
  // El options= de postgres se pasa via query string
  const url = new URL(baseDatabaseUrl);
  url.searchParams.set('options', `-c search_path=${schema}`);
  return { databaseUrl: url.toString(), schema };
}

export async function teardownTestSchema(
  baseDatabaseUrl: string,
  schema: string,
): Promise<void> {
  const pool = new Pool({ connectionString: baseDatabaseUrl });
  try {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await pool.end();
  }
}

/**
 * Aplica todos los archivos .sql de una carpeta de migraciones,
 * en orden, contra la URL provista (que ya tiene search_path
 * apuntando al schema de test).
 */
export async function runSqlMigrations(
  databaseUrl: string,
  migrationsFolder: string,
): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const files = fs
      .readdirSync(migrationsFolder)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsFolder, file), 'utf8');
      // Cada archivo puede tener varios statements separados por --> statement-breakpoint
      const statements = sql
        .split(/-->\s*statement-breakpoint/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await pool.query(stmt);
      }
    }
  } finally {
    await pool.end();
  }
}

/**
 * Crea un schema de test + corre las migraciones en un solo paso.
 * Útil para los globalSetup/globalTeardown de Jest.
 */
export async function setupTestDatabase(
  baseDatabaseUrl: string,
  schema: string,
  migrationsFolder: string,
): Promise<TestSchema> {
  const result = await setupTestSchema(baseDatabaseUrl, schema);
  await runSqlMigrations(result.databaseUrl, migrationsFolder);
  return result;
}
