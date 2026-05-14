#!/usr/bin/env node
import { readFileSync } from "node:fs";
import "dotenv/config";
import pg from "pg";

const SQL_FILE = process.argv[2] || "data/installers-cleaned.sql";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("Missing DIRECT_URL or DATABASE_URL in env");
  process.exit(1);
}

const sqlText = readFileSync(SQL_FILE, "utf8");
// Strip the outer BEGIN/COMMIT — we'll manage the transaction ourselves
const body = sqlText
  .replace(/^\s*BEGIN;\s*$/m, "")
  .replace(/^\s*COMMIT;\s*$/m, "")
  .trim();

// Count UPDATE statements in the file
const updateCount = (body.match(/^UPDATE /gm) || []).length;
const ids = [...body.matchAll(/WHERE id = '([^']+)'/g)].map((m) => m[1]);

console.log(`Source: ${SQL_FILE}`);
console.log(`UPDATE statements: ${updateCount}`);
console.log(`Target IDs: ${ids.length}`);
console.log("");

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("BEGIN");

  // Snapshot a few rows BEFORE the update
  const before = await client.query(
    `SELECT id, name, region, service_areas, capabilities, aqara_app_capability, has_aqara_hub_inventory
     FROM installers WHERE id = ANY($1::text[]) ORDER BY name LIMIT 3`,
    [ids],
  );
  console.log("=== BEFORE (sample 3) ===");
  for (const r of before.rows) console.log(JSON.stringify(r));
  console.log("");

  await client.query(body);

  const after = await client.query(
    `SELECT id, name, region, service_areas, capabilities, aqara_app_capability, has_aqara_hub_inventory
     FROM installers WHERE id = ANY($1::text[]) ORDER BY name LIMIT 3`,
    [ids],
  );
  console.log("=== AFTER (same 3) ===");
  for (const r of after.rows) console.log(JSON.stringify(r));
  console.log("");

  const updatedCount = await client.query(
    `SELECT COUNT(*)::int AS n FROM installers
     WHERE id = ANY($1::text[]) AND updated_at >= NOW() - interval '5 minutes'`,
    [ids],
  );
  console.log(`Rows touched (updated_at within 5min): ${updatedCount.rows[0].n} / ${ids.length}`);

  await client.query("COMMIT");
  console.log("");
  console.log(`✓ Committed ${updateCount} UPDATEs`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("✗ Failed, rolled back:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
