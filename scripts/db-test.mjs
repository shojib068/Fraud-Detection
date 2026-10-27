// Runs the pgTAP files in supabase/tests/database against the migrations,
// using PGlite (Postgres compiled to WebAssembly) instead of Docker.
// Each test file gets a fresh database: stub -> migrations -> test.
//
// Usage: npm run db:test [-- <file-filter>]
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stub = readFileSync(join(root, 'supabase/tests/supabase-stub.sql'), 'utf8');
const migrationDir = join(root, 'supabase/migrations');
const testDir = join(root, 'supabase/tests/database');
const filter = process.argv[2] ?? '';

const migrations = readdirSync(migrationDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => [f, readFileSync(join(migrationDir, f), 'utf8')]);

const testFiles = readdirSync(testDir)
  .filter((f) => f.endsWith('.test.sql') && f.includes(filter))
  .sort();

let failed = 0;
let passed = 0;

for (const file of testFiles) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(stub);
  for (const [name, sql] of migrations) {
    try {
      await db.exec(sql);
    } catch (error) {
      console.error(`Migration ${name} failed: ${error.message}`);
      process.exit(2);
    }
  }

  // pgTAP is stubbed in the extensions schema, so drop the real extension line.
  const sql = readFileSync(join(testDir, file), 'utf8').replace(
    /create extension if not exists pgtap[^;]*;/i,
    '',
  );

  console.log(`# ${file}`);
  let planned = 0;
  let ran = 0;
  try {
    for (const result of await db.exec(sql)) {
      for (const row of result.rows) {
        const line = Object.values(row)[0];
        if (typeof line !== 'string') continue;
        if (line.startsWith('1..')) planned = Number(line.slice(3));
        if (/^(not )?ok /.test(line)) {
          ran++;
          if (line.startsWith('not ok')) {
            failed++;
            console.log(line);
          } else {
            passed++;
          }
        }
      }
    }
    if (planned !== ran) {
      failed++;
      console.log(`not ok - planned ${planned} tests but ran ${ran}`);
    }
  } catch (error) {
    failed++;
    console.log(`not ok - ${file} aborted: ${error.message}`);
  }
  console.log(`  ${ran} tests`);
  await db.close();
}

console.log(
  failed ? `\nFAILED: ${failed} failing, ${passed} passing` : `\nAll ${passed} tests passed`,
);
process.exit(failed ? 1 : 0);
