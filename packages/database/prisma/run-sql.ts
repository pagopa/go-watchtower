/**
 * Generic SQL file runner.
 * Usage: tsx prisma/run-sql.ts <path-to-file.sql>
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import pg from "pg";

const [, , filePath] = process.argv;

if (!filePath) {
  console.error("Usage: tsx prisma/run-sql.ts <file.sql>");
  process.exit(1);
}

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is required");

const absolutePath = resolve(filePath);
const sql = readFileSync(absolutePath, "utf-8");

const pool = new pg.Pool({ connectionString });

try {
  console.log(`▶  Running ${absolutePath}...`);
  await pool.query(sql);
  console.log("✨ Done.");
} finally {
  await pool.end();
}
