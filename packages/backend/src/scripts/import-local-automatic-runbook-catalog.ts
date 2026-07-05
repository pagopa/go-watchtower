import "dotenv/config";
import { readFile } from "node:fs/promises";
import {
  prisma,
  upsertVerifiedCapabilityCatalog,
} from "@go-watchtower/database";
import {
  parseLocalCatalogImportOptions,
  prepareLocalCatalogImport,
} from "../services/automation/local-catalog-import.js";

async function main(): Promise<void> {
  const options = parseLocalCatalogImportOptions(process.argv.slice(2), {
    nodeEnv: process.env["NODE_ENV"],
    defaultEnvironment:
      process.env["AUTOMATIC_RUNBOOK_CATALOG_ENVIRONMENT"],
  });
  const prepared = prepareLocalCatalogImport(
    await readFile(options.file),
    options.environment,
  );
  const row = await upsertVerifiedCapabilityCatalog({
    catalog: prepared.catalog,
    sourceVersionId: prepared.sourceVersionId,
    sourceETag: prepared.sourceETag,
    validitySeconds: options.validitySeconds,
  });
  console.log(
    JSON.stringify(
      {
        status: "IMPORTED",
        file: options.file,
        environment: prepared.catalog.environment,
        revision: prepared.catalog.revision,
        runbooks: prepared.catalog.runbooks.length,
        sourceVersionId: row.sourceVersionId,
        validUntil: row.validUntil?.toISOString() ?? null,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
