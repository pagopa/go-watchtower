import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Resource, PermissionScope } from "../generated/prisma/client.js";
import bcrypt from "bcrypt";
import pg from "pg";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Deterministic UUIDs ───────────────────────────────────────────────────
// Stabili tra deploy. Referenziabili direttamente da seed.private.sql senza lookup.
const ROLE_IDS = {
  GUEST:     "a0000000-0000-0000-0000-000000000001",
  OPERATOR:  "a0000000-0000-0000-0000-000000000002",
  TEAM_LEAD: "a0000000-0000-0000-0000-000000000003",
  ADMIN:     "a0000000-0000-0000-0000-000000000004",
} as const;

// Prefisso "00" = entità di sistema, non confligge con gli UUID del seed privato
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";

// ─── Permission matrix ─────────────────────────────────────────────────────
const { NONE, OWN, ALL } = PermissionScope;
type Tuple = [PermissionScope, PermissionScope, PermissionScope];

const PERMISSIONS: Record<keyof typeof ROLE_IDS, Record<Resource, Tuple>> = {
  GUEST: {
    PRODUCT:        [ALL,  NONE, NONE],
    ENVIRONMENT:    [ALL,  NONE, NONE],
    MICROSERVICE:   [ALL,  NONE, NONE],
    IGNORED_ALARM:  [ALL,  NONE, NONE],
    RUNBOOK:        [ALL,  NONE, NONE],
    FINAL_ACTION:   [ALL,  NONE, NONE],
    ALARM:          [ALL,  NONE, NONE],
    ALARM_ANALYSIS: [ALL,  NONE, NONE],
    ALARM_EVENT:    [ALL,  NONE, NONE],
    DOWNSTREAM:     [ALL,  NONE, NONE],
    USER:           [NONE, NONE, NONE],
    SYSTEM_SETTING: [NONE, NONE, NONE],
  },
  OPERATOR: {
    PRODUCT:        [ALL,  NONE, NONE],
    ENVIRONMENT:    [ALL,  NONE, NONE],
    MICROSERVICE:   [ALL,  NONE, NONE],
    IGNORED_ALARM:  [ALL,  NONE, NONE],
    RUNBOOK:        [ALL,  NONE, NONE],
    FINAL_ACTION:   [ALL,  NONE, NONE],
    ALARM:          [ALL,  NONE, NONE],
    ALARM_ANALYSIS: [ALL,  OWN,  NONE],
    ALARM_EVENT:    [ALL,  NONE, NONE],
    DOWNSTREAM:     [ALL,  NONE, NONE],
    USER:           [NONE, NONE, NONE],
    SYSTEM_SETTING: [NONE, NONE, NONE],
  },
  TEAM_LEAD: {
    PRODUCT:        [ALL,  NONE, NONE],
    ENVIRONMENT:    [ALL,  NONE, NONE],
    MICROSERVICE:   [ALL,  NONE, NONE],
    IGNORED_ALARM:  [ALL,  ALL,  NONE],
    RUNBOOK:        [ALL,  ALL,  NONE],
    FINAL_ACTION:   [ALL,  ALL,  NONE],
    ALARM:          [ALL,  ALL,  NONE],
    ALARM_ANALYSIS: [ALL,  ALL,  ALL],
    ALARM_EVENT:    [ALL,  ALL,  NONE],
    DOWNSTREAM:     [ALL,  ALL,  NONE],
    USER:           [ALL,  NONE, NONE],
    SYSTEM_SETTING: [NONE, NONE, NONE],
  },
  ADMIN: {
    PRODUCT:        [ALL, ALL, ALL],
    ENVIRONMENT:    [ALL, ALL, ALL],
    MICROSERVICE:   [ALL, ALL, ALL],
    IGNORED_ALARM:  [ALL, ALL, ALL],
    RUNBOOK:        [ALL, ALL, ALL],
    FINAL_ACTION:   [ALL, ALL, ALL],
    ALARM:          [ALL, ALL, ALL],
    ALARM_ANALYSIS: [ALL, ALL, ALL],
    ALARM_EVENT:    [ALL, ALL, ALL],
    DOWNSTREAM:     [ALL, ALL, ALL],
    USER:           [ALL, ALL, ALL],
    SYSTEM_SETTING: [ALL, ALL, ALL],
  },
};

// ─── Seeders ───────────────────────────────────────────────────────────────

async function seedRoles() {
  console.log("🔐 Seeding roles...");

  const roles = [
    { id: ROLE_IDS.GUEST,     name: "GUEST",     description: "Default role for new users. Read-only access to most resources.", isDefault: true  },
    { id: ROLE_IDS.OPERATOR,  name: "OPERATOR",  description: "Can create and edit alarm analyses.",                             isDefault: false },
    { id: ROLE_IDS.TEAM_LEAD, name: "TEAM_LEAD", description: "Can manage configurations and delete analyses.",                  isDefault: false },
    { id: ROLE_IDS.ADMIN,     name: "ADMIN",     description: "Full access to all resources including user management.",         isDefault: false },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: { description: role.description, isDefault: role.isDefault },
      create: role,
    });
    console.log(`  ✅ ${role.name}${role.isDefault ? " (default)" : ""}`);
  }
}

async function seedPermissions() {
  console.log("\n🛡️  Seeding permissions...");

  for (const [roleName, matrix] of Object.entries(PERMISSIONS) as [keyof typeof ROLE_IDS, Record<Resource, Tuple>][]) {
    const roleId = ROLE_IDS[roleName];
    for (const [resource, [canRead, canWrite, canDelete]] of Object.entries(matrix) as [Resource, Tuple][]) {
      await prisma.rolePermission.upsert({
        where: { roleId_resource: { roleId, resource } },
        update: { canRead, canWrite, canDelete },
        create: { roleId, resource, canRead, canWrite, canDelete },
      });
    }
    console.log(`  ✅ ${roleName} (${Object.keys(matrix).length} resources)`);
  }
}

async function seedIgnoreReasons() {
  console.log("\n🚫 Seeding ignore reasons...");

  const reasons = [
    {
      code: "LISTED",
      label: "Allarme catalogato",
      description: "Allarme già noto e presente in ignore list.",
      sortOrder: 1,
      detailsSchema: null,
    },
    {
      code: "EXTERNAL",
      label: "Gestito da team esterno",
      description: "Allarme gestito da un team o soggetto esterno al nostro team.",
      sortOrder: 2,
      detailsSchema: {
        type: "object",
        properties: {
          handler: {
            type: "string",
            title: "Gestito da",
            description: "Nome del team o persona che ha gestito l'allarme",
            minLength: 1,
          },
        },
        required: ["handler"],
      },
    },
    {
      code: "RELEASE",
      label: "Causato da release",
      description: "Allarme scaturito da un'attività di rilascio in produzione.",
      sortOrder: 3,
      detailsSchema: {
        type: "object",
        properties: {
          version: {
            type: "string",
            title: "Versione",
            description: "Versione del software rilasciato (es. 1.4.2)",
            minLength: 1,
          },
        },
        required: ["version"],
      },
    },
    {
      code: "MAINTENANCE",
      label: "Manutenzione pianificata",
      description: "Allarme atteso durante una finestra di manutenzione pianificata.",
      sortOrder: 4,
      detailsSchema: {
        type: "object",
        properties: {
          activity: {
            type: "string",
            title: "Attività",
            description: "Descrizione dell'attività di manutenzione",
            "x-ui": "textarea",
            minLength: 1,
          },
          performedBy: {
            type: "string",
            title: "Eseguita da",
            description: "Team o persona che ha eseguito la manutenzione",
          },
        },
        required: ["activity"],
      },
    },
  ];

  for (const reason of reasons) {
    await prisma.ignoreReason.upsert({
      where:  { code: reason.code },
      update: { label: reason.label, description: reason.description, sortOrder: reason.sortOrder, detailsSchema: reason.detailsSchema },
      create: reason,
    });
    console.log(`  ✅ ${reason.code} — ${reason.label}`);
  }
}

async function seedAdmin() {
  console.log("\n👤 Seeding default admin user...");

  const email    = process.env["SEED_ADMIN_EMAIL"]    ?? "admin@example.com";
  const password = process.env["SEED_ADMIN_PASSWORD"] ?? "changeme";
  const name     = process.env["SEED_ADMIN_NAME"]     ?? "Admin";

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where:  { email },
    update: {},
    create: {
      id:           ADMIN_USER_ID,
      email,
      name,
      passwordHash,
      roleId:   ROLE_IDS.ADMIN,
      provider: "LOCAL",
    },
  });

  console.log(`  ✅ ${email} (password: ${password === "changeme" ? "⚠️  default — change on first login" : "***"})`);
}

async function seedSystemSettings() {
  console.log("\n⚙️  Seeding system settings...");

  const settings = [
    {
      key:         "default_google_role_id",
      value:       ROLE_IDS.GUEST,
      type:        "STRING",
      format:      "FK_ROLE",
      category:    "AUTH",
      label:       "Ruolo predefinito Google",
      description: "Ruolo assegnato automaticamente ai nuovi utenti che accedono per la prima volta tramite Google OAuth",
    },
    {
      key:         "analysis_edit_lock_days",
      value:       7,
      type:        "NUMBER",
      format:      null,
      category:    "ANALYSIS",
      label:       "Giorni blocco modifica analisi",
      description: "Numero di giorni dopo i quali un operatore non può più modificare la propria analisi",
    },
    {
      key:         "working_hours",
      value:       { start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
      type:        "JSON",
      format:      "WORKING_HOURS",
      category:    "SYSTEM",
      label:       "Orari lavorativi",
      description: "Finestra oraria e giorni lavorativi usati per il calcolo delle KPI",
    },
    {
      key:         "on_call_hours",
      value:       {
        timezone:  "Europe/Rome",
        overnight: { start: "18:00", end: "09:00", days: [1, 2, 3, 4, 5] },
        allDay:    { startDay: 6, endDay: 1, endTime: "09:00" },
      },
      type:        "JSON",
      format:      "ON_CALL_HOURS",
      category:    "SYSTEM",
      label:       "Orari di reperibilità",
      description: "Finestra oraria di reperibilità: notturna feriale (18:00–09:00) e weekend completo fino a lunedì 09:00",
    },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where:  { key: setting.key },
      update: { format: setting.format },
      create: setting,
    });
    console.log(`  ✅ ${setting.key}`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 System seed\n");
  await seedRoles();
  await seedPermissions();
  await seedIgnoreReasons();
  await seedAdmin();
  await seedSystemSettings();
  console.log("\n✨ Done.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
