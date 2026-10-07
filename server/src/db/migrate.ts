// Runs every SQL file in db/migrations in name order. Each file is idempotent.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate(): Promise<void> {
  const pool = await getPool();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(path.join(dir, file), "utf8"));
    console.log(`migrated ${file}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(async () => { (await getPool()).end(); }).catch((e) => { console.error(e.message); process.exit(1); });
}
