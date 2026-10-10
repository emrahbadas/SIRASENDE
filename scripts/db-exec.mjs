// Dev utility: run a SQL statement against the remote DB.
// Usage: DATABASE_URL=... node scripts/db-exec.mjs "select 1"
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const query = process.argv[2];

if (!url || !query) {
  console.error("DATABASE_URL env and a SQL argument are required");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1 });
try {
  const result = await sql.unsafe(query);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end();
}
