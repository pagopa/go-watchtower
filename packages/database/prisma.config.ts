import dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

dotenv.config({ path: path.join(import.meta.dirname, ".env") });

export default defineConfig({
  schema: path.join(import.meta.dirname, "prisma/schema.prisma"),
  datasource: {
    url: process.env["DATABASE_URL"] || "postgresql://dummy:dummy@localhost:5432/dummy",
  },
});
