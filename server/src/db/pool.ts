// PostgreSQL connection pool. `pg` is an optional dependency: only needed when STORE=postgres.
import { config } from "../config.ts";

let pool: any = null;

export async function getPool(): Promise<any> {
  if (pool) return pool;
  let pg: any;
  try {
    const name = "pg"; // optional dependency, resolved at runtime only
    pg = await import(name);
  } catch {
    throw new Error("STORE=postgres needs the 'pg' package. Run: npm install");
  }
  const Pool = pg.default?.Pool ?? pg.Pool;
  pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  return pool;
}
