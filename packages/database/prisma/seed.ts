import "dotenv/config";
import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, SystemComponent, PermissionScope } from "../generated/prisma/client.js";
import bcrypt from "bcrypt";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) throw new Error("DATABASE_URL is required");

const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

// ─── Deterministic UUIDs ───────────────────────────────────────────────────
// Stabili tra deploy. Referenziabili direttamente da seed.private.sql senza lookup.
const ROLE_IDS = {
  GUEST:     "a0000000-0000-0000-0000-000000000001",
  OPERATOR:  "a0000000-0000-0000-0000-000000000002",
  TEAM_LEAD: "a0000000-0000-0000-0000-000000000003",
  ADMIN:     "a0000000-0000-0000-0000-000000000004",
  // Runbook Automation: ruolo minimo del service principal (solo write su AUTOMATIC_RUNBOOK_EXECUTION).
  AUTOMATION_WORKER: "a0000000-0000-0000-0000-000000000005",
} as const;

// Prefisso "00" = entità di sistema, non confligge con gli UUID del seed privato
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";
// Service principal Runbook Automation (utente tecnico SERVICE).
const AUTOMATION_WORKER_USER_ID = "00000000-0000-0000-0000-000000000002";

// ─── Permission matrix ─────────────────────────────────────────────────────
const { NONE, OWN, ALL } = PermissionScope;
type Tuple = [PermissionScope, PermissionScope, PermissionScope];

const PERMISSIONS: Record<keyof typeof ROLE_IDS, Record<SystemComponent, Tuple>> = {
  GUEST: {
    PRODUCT:        [ALL,  NONE, NONE],
    ENVIRONMENT:    [ALL,  NONE, NONE],
    RESOURCE:       [ALL,  NONE, NONE],
    IGNORED_ALARM:  [ALL,  NONE, NONE],
    ALARM_PRIORITY_RULE: [ALL, NONE, NONE],
    PRIORITY_LEVEL: [ALL, NONE, NONE],
    RUNBOOK:        [ALL,  NONE, NONE],
    FINAL_ACTION:   [ALL,  NONE, NONE],
    ALARM:          [ALL,  NONE, NONE],
    ALARM_ANALYSIS: [ALL,  NONE, NONE],
    ALARM_EVENT:    [ALL,  NONE, NONE],
    DOWNSTREAM:     [ALL,  NONE, NONE],
    USER:           [NONE, NONE, NONE],
    SYSTEM_SETTING: [NONE, NONE, NONE],
    AUTOMATIC_RUNBOOK_EXECUTION: [ALL, NONE, NONE],
  },
  OPERATOR: {
    PRODUCT:        [ALL,  NONE, NONE],
    ENVIRONMENT:    [ALL,  NONE, NONE],
    RESOURCE:       [ALL,  NONE, NONE],
    IGNORED_ALARM:  [ALL,  NONE, NONE],
    ALARM_PRIORITY_RULE: [ALL, NONE, NONE],
    PRIORITY_LEVEL: [ALL, NONE, NONE],
    RUNBOOK:        [ALL,  NONE, NONE],
    FINAL_ACTION:   [ALL,  NONE, NONE],
    ALARM:          [ALL,  NONE, NONE],
    ALARM_ANALYSIS: [ALL,  OWN,  NONE],
    ALARM_EVENT:    [ALL,  NONE, NONE],
    DOWNSTREAM:     [ALL,  NONE, NONE],
    USER:           [NONE, NONE, NONE],
    SYSTEM_SETTING: [NONE, NONE, NONE],
    AUTOMATIC_RUNBOOK_EXECUTION: [ALL, NONE, NONE],
  },
  TEAM_LEAD: {
    PRODUCT:        [ALL,  NONE, NONE],
    ENVIRONMENT:    [ALL,  NONE, NONE],
    RESOURCE:       [ALL,  NONE, NONE],
    IGNORED_ALARM:  [ALL,  ALL,  NONE],
    ALARM_PRIORITY_RULE: [ALL, ALL, NONE],
    PRIORITY_LEVEL: [ALL, NONE, NONE],
    RUNBOOK:        [ALL,  ALL,  NONE],
    FINAL_ACTION:   [ALL,  ALL,  NONE],
    ALARM:          [ALL,  ALL,  NONE],
    ALARM_ANALYSIS: [ALL,  ALL,  ALL],
    ALARM_EVENT:    [ALL,  ALL,  NONE],
    DOWNSTREAM:     [ALL,  ALL,  NONE],
    USER:           [ALL,  NONE, NONE],
    SYSTEM_SETTING: [NONE, NONE, NONE],
    AUTOMATIC_RUNBOOK_EXECUTION: [ALL, ALL, NONE],
  },
  ADMIN: {
    PRODUCT:        [ALL, ALL, ALL],
    ENVIRONMENT:    [ALL, ALL, ALL],
    RESOURCE:       [ALL, ALL, ALL],
    IGNORED_ALARM:  [ALL, ALL, ALL],
    ALARM_PRIORITY_RULE: [ALL, ALL, ALL],
    PRIORITY_LEVEL: [ALL, ALL, ALL],
    RUNBOOK:        [ALL, ALL, ALL],
    FINAL_ACTION:   [ALL, ALL, ALL],
    ALARM:          [ALL, ALL, ALL],
    ALARM_ANALYSIS: [ALL, ALL, ALL],
    ALARM_EVENT:    [ALL, ALL, ALL],
    DOWNSTREAM:     [ALL, ALL, ALL],
    USER:           [ALL, ALL, ALL],
    SYSTEM_SETTING: [ALL, ALL, ALL],
    AUTOMATIC_RUNBOOK_EXECUTION: [ALL, ALL, ALL],
  },
  // Least privilege (§9.6): solo write su AUTOMATIC_RUNBOOK_EXECUTION; nessun
  // accesso ad analisi/CRUD/UI. Il complete applica l'analisi come operazione
  // interna trusted, senza ALARM_ANALYSIS:write sul worker.
  AUTOMATION_WORKER: {
    PRODUCT:        [NONE, NONE, NONE],
    ENVIRONMENT:    [NONE, NONE, NONE],
    RESOURCE:       [NONE, NONE, NONE],
    IGNORED_ALARM:  [NONE, NONE, NONE],
    ALARM_PRIORITY_RULE: [NONE, NONE, NONE],
    PRIORITY_LEVEL: [NONE, NONE, NONE],
    RUNBOOK:        [NONE, NONE, NONE],
    FINAL_ACTION:   [NONE, NONE, NONE],
    ALARM:          [NONE, NONE, NONE],
    ALARM_ANALYSIS: [NONE, NONE, NONE],
    ALARM_EVENT:    [NONE, NONE, NONE],
    DOWNSTREAM:     [NONE, NONE, NONE],
    USER:           [NONE, NONE, NONE],
    SYSTEM_SETTING: [NONE, NONE, NONE],
    AUTOMATIC_RUNBOOK_EXECUTION: [NONE, ALL, NONE],
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
    { id: ROLE_IDS.AUTOMATION_WORKER, name: "AUTOMATION_WORKER", description: "Service principal role: only AUTOMATIC_RUNBOOK_EXECUTION:write (lifecycle callbacks).", isDefault: false },
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

  for (const [roleName, matrix] of Object.entries(PERMISSIONS) as [keyof typeof ROLE_IDS, Record<SystemComponent, Tuple>][]) {
    const roleId = ROLE_IDS[roleName];
    for (const [resource, [canRead, canWrite, canDelete]] of Object.entries(matrix) as [SystemComponent, Tuple][]) {
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

const RESOURCE_TYPE_IDS = {
  SERVICE:     "d0000000-0000-0000-0000-000000000001",
  DEVELOPMENT: "d0000000-0000-0000-0000-000000000002",
  LAMBDA:      "d0000000-0000-0000-0000-000000000003",
  CRONJOB:     "d0000000-0000-0000-0000-000000000004",
} as const;

async function seedPriorityLevels() {
  console.log("\n🚦 Seeding priority levels...");

  const levels = [
    {
      code:           "NORMAL",
      label:          "Normale",
      description:    "Priorità operativa standard applicata quando nessuna regola specifica fa match.",
      rank:           0,
      color:          "zinc",
      icon:           "minus",
      isActive:       true,
      isDefault:      true,
      countsAsOnCall: false,
      defaultNotify:  false,
      isSystem:       true,
    },
    {
      code:           "HIGH",
      label:          "High",
      description:    "Priorità operativa elevata per allarmi che richiedono attenzione rapida.",
      rank:           50,
      color:          "amber",
      icon:           "triangle-alert",
      isActive:       true,
      isDefault:      false,
      countsAsOnCall: false,
      defaultNotify:  true,
      isSystem:       true,
    },
    {
      code:           "ON_CALL",
      label:          "On-Call",
      description:    "Priorità operativa massima per allarmi di reperibilità.",
      rank:           100,
      color:          "rose",
      icon:           "phone-call",
      isActive:       true,
      isDefault:      false,
      countsAsOnCall: true,
      defaultNotify:  true,
      isSystem:       true,
    },
  ];

  for (const level of levels) {
    await prisma.priorityLevel.upsert({
      where: { code: level.code },
      update: {
        label:          level.label,
        description:    level.description,
        rank:           level.rank,
        color:          level.color,
        icon:           level.icon,
        isActive:       level.isActive,
        isDefault:      level.isDefault,
        countsAsOnCall: level.countsAsOnCall,
        defaultNotify:  level.defaultNotify,
        isSystem:       level.isSystem,
      },
      create: level,
    });
    console.log(`  ✅ ${level.code}`);
  }
}

async function seedResourceTypes() {
  console.log("\n📦 Seeding resource types...");

  const types = [
    { id: RESOURCE_TYPE_IDS.SERVICE,     name: "Service",     sortOrder: 1 },
    { id: RESOURCE_TYPE_IDS.DEVELOPMENT, name: "Development", sortOrder: 2 },
    { id: RESOURCE_TYPE_IDS.LAMBDA,      name: "Lambda",      sortOrder: 3 },
    { id: RESOURCE_TYPE_IDS.CRONJOB,     name: "Cronjob",     sortOrder: 4 },
  ];

  for (const rt of types) {
    await prisma.resourceType.upsert({
      where:  { id: rt.id },
      update: { name: rt.name, sortOrder: rt.sortOrder },
      create: rt,
    });
    console.log(`  ✅ ${rt.name}`);
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

async function seedAutomationWorker() {
  console.log("\n🤖 Seeding Runbook Automation service principal...");

  const serviceId = "runbook-automation-worker";
  const email = "runbook-automation-worker@service.watchtower.local";
  // La password è fornita out-of-band via secret CI (CONTRACT-03 §4.4): nessun
  // plaintext nel repository. Se assente al primo seed, ne genera una casuale
  // (NON utilizzabile dal worker finché non ruotata): va impostata e ruotata.
  const envPassword = process.env["SEED_AUTOMATION_WORKER_PASSWORD"];
  const passwordToHash =
    envPassword ?? crypto.randomBytes(24).toString("base64url");
  const passwordHash = await bcrypt.hash(passwordToHash, 12);

  await prisma.user.upsert({
    where: { serviceId },
    // Aggiorna la password solo se fornita via env (rotazione esplicita);
    // altrimenti preserva l'hash esistente per idempotenza.
    update: {
      principalType: "SERVICE",
      roleId: ROLE_IDS.AUTOMATION_WORKER,
      isActive: true,
      ...(envPassword ? { passwordHash } : {}),
    },
    create: {
      id: AUTOMATION_WORKER_USER_ID,
      email,
      name: "Runbook Automation Worker",
      passwordHash,
      principalType: "SERVICE",
      serviceId,
      roleId: ROLE_IDS.AUTOMATION_WORKER,
      provider: "LOCAL",
    },
  });

  if (envPassword) {
    console.log(`  ✅ ${serviceId} (password from SEED_AUTOMATION_WORKER_PASSWORD)`);
  } else {
    console.log(
      `  ⚠️  ${serviceId} created with a RANDOM password — set SEED_AUTOMATION_WORKER_PASSWORD and re-seed (or rotate) before enabling dispatch`,
    );
  }
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
      value:       { timezone: "Europe/Rome", start: "09:00", end: "18:00", days: [1, 2, 3, 4, 5] },
      type:        "JSON",
      format:      "WORKING_HOURS",
      category:    "SYSTEM",
      label:       "Orari lavorativi",
      description: "Finestra oraria e giorni lavorativi usati per il calcolo delle KPI",
    },
    {
      key:         "analysis_date_future_offset_minutes",
      value:       15,
      type:        "NUMBER",
      format:      null,
      category:    "ANALYSIS",
      label:       "Offset massimo data analisi (minuti)",
      description: "Numero di minuti di tolleranza oltre l'ora corrente per la data di analisi. Impedisce l'inserimento di date nel futuro.",
    },
    {
      key:         "automation.defaultMode",
      value:       "SHADOW",
      type:        "STRING",
      format:      null,
      category:    "SYSTEM",
      label:       "Modo predefinito Runbook Automation",
      description: "Modo usato al LANCIO di una nuova esecuzione (default proposto in UI e valore per i lanci automatici/Slack): SHADOW (solo esecuzione), APPLY_KNOWN (crea analisi per KNOWN_CASE), APPLY_ALL (anche UNKNOWN_CASE). Cambiarlo influenza solo i nuovi lanci.",
    },
    {
      key:         "automation.modeOverride",
      value:       "",
      type:        "STRING",
      format:      null,
      category:    "SYSTEM",
      label:       "Override globale Runbook Automation (kill-switch)",
      description: "Se valorizzato, al COMPLETAMENTO sovrascrive il modo di TUTTE le esecuzioni non ancora concluse (anche quelle già avviate), ignorando il modo con cui sono state lanciate. Vuoto = disattivato. Imposta SHADOW per fermare istantaneamente la creazione/aggiornamento di analisi.",
    },
    {
      key:         "auth.cliToken.defaultTtlDays",
      value:       30,
      type:        "NUMBER",
      format:      null,
      category:    "AUTH",
      label:       "Durata predefinita token CLI",
      description: "Numero di giorni usato come scadenza predefinita dei Personal Access Token CLI.",
    },
    {
      key:         "auth.cliToken.maxTtlDays",
      value:       90,
      type:        "NUMBER",
      format:      null,
      category:    "AUTH",
      label:       "Durata massima token CLI",
      description: "Numero massimo di giorni consentito per la scadenza dei Personal Access Token CLI.",
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
  await seedPriorityLevels();
  await seedResourceTypes();
  await seedAdmin();
  await seedAutomationWorker();
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
  });
