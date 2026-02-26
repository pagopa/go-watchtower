import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, AuthProvider, Resource } from "../generated/prisma/client.js";
import bcrypt from "bcrypt";
import pg from "pg";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Permission matrix: [canRead, canWrite, canDelete]
type PermissionTuple = [boolean, boolean, boolean];
type RolePermissions = Record<Resource, PermissionTuple>;

const ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  GUEST: {
    PRODUCT: [true, false, false],
    ENVIRONMENT: [true, false, false],
    MICROSERVICE: [true, false, false],
    IGNORED_ALARM: [true, false, false],
    RUNBOOK: [true, false, false],
    FINAL_ACTION: [true, false, false],
    ALARM_ANALYSIS: [true, false, false],
    USER: [false, false, false],
  },
  OPERATOR: {
    PRODUCT: [true, false, false],
    ENVIRONMENT: [true, false, false],
    MICROSERVICE: [true, false, false],
    IGNORED_ALARM: [true, false, false],
    RUNBOOK: [true, false, false],
    FINAL_ACTION: [true, false, false],
    ALARM_ANALYSIS: [true, true, false],
    USER: [false, false, false],
  },
  TEAM_LEAD: {
    PRODUCT: [true, false, false],
    ENVIRONMENT: [true, false, false],
    MICROSERVICE: [true, false, false],
    IGNORED_ALARM: [true, true, false],
    RUNBOOK: [true, true, false],
    FINAL_ACTION: [true, true, false],
    ALARM_ANALYSIS: [true, true, true],
    USER: [true, false, false],
  },
  ADMIN: {
    PRODUCT: [true, true, true],
    ENVIRONMENT: [true, true, true],
    MICROSERVICE: [true, true, true],
    IGNORED_ALARM: [true, true, true],
    RUNBOOK: [true, true, true],
    FINAL_ACTION: [true, true, true],
    ALARM_ANALYSIS: [true, true, true],
    USER: [true, true, true],
  },
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  GUEST: "Default role for new users. Read-only access to most resources.",
  OPERATOR: "Can create and edit alarm analyses.",
  TEAM_LEAD: "Can manage configurations and delete analyses.",
  ADMIN: "Full access to all resources including user management.",
};

async function seedRolesAndPermissions() {
  console.log("🔐 Seeding roles and permissions...");

  const roles: Record<string, string> = {};

  for (const [roleName, description] of Object.entries(ROLE_DESCRIPTIONS)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description },
      create: {
        name: roleName,
        description,
        isDefault: roleName === "GUEST",
      },
    });
    roles[roleName] = role.id;
    console.log(`  ✅ Role: ${roleName}${roleName === "GUEST" ? " (default)" : ""}`);

    // Create permissions for this role
    const permissions = ROLE_PERMISSIONS[roleName];
    if (permissions) {
      for (const [resource, [canRead, canWrite, canDelete]] of Object.entries(permissions)) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_resource: {
              roleId: role.id,
              resource: resource as Resource,
            },
          },
          update: { canRead, canWrite, canDelete },
          create: {
            roleId: role.id,
            resource: resource as Resource,
            canRead,
            canWrite,
            canDelete,
          },
        });
      }
    }
  }

  console.log("  └─ Permissions configured for all roles");
  return roles;
}

async function seedUsers(roles: Record<string, string>) {
  console.log("\n👤 Seeding users...");

  // Create admin user
  const adminPassword = await hashPassword("admin123!");
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { roleId: roles["ADMIN"] },
    create: {
      email: "admin@example.com",
      name: "Admin User",
      passwordHash: adminPassword,
      roleId: roles["ADMIN"],
      provider: AuthProvider.LOCAL,
    },
  });
  console.log(`  ✅ Admin user: ${admin.email}`);

  // Create test operator
  const operatorPassword = await hashPassword("operator123!");
  const operator = await prisma.user.upsert({
    where: { email: "operator@example.com" },
    update: { roleId: roles["OPERATOR"] },
    create: {
      email: "operator@example.com",
      name: "Test Operator",
      passwordHash: operatorPassword,
      roleId: roles["OPERATOR"],
      provider: AuthProvider.LOCAL,
    },
  });
  console.log(`  ✅ Operator user: ${operator.email}`);

  // Create test guest
  const guestPassword = await hashPassword("guest123!");
  const guest = await prisma.user.upsert({
    where: { email: "guest@example.com" },
    update: { roleId: roles["GUEST"] },
    create: {
      email: "guest@example.com",
      name: "Test Guest",
      passwordHash: guestPassword,
      roleId: roles["GUEST"],
      provider: AuthProvider.LOCAL,
    },
  });
  console.log(`  ✅ Guest user: ${guest.email}`);
}

async function seedProducts() {
  console.log("\n📦 Seeding products...");

  const products = [
    { name: "IO App", description: "App IO - Servizi digitali" },
    { name: "pagoPA", description: "Piattaforma pagamenti" },
    { name: "SEND", description: "Notifiche digitali" },
  ];

  for (const productData of products) {
    const product = await prisma.product.upsert({
      where: { name: productData.name },
      update: {},
      create: productData,
    });
    console.log(`  ✅ Product: ${product.name}`);

    // Create environments for each product
    const environments = [
      { name: "DEV", description: "Development", order: 1 },
      { name: "UAT", description: "User Acceptance Testing", order: 2 },
      { name: "PROD", description: "Production", order: 3 },
    ];

    for (const envData of environments) {
      await prisma.environment.upsert({
        where: {
          productId_name: { productId: product.id, name: envData.name },
        },
        update: {},
        create: {
          ...envData,
          productId: product.id,
        },
      });
    }
    console.log(`    └─ Environments: DEV, UAT, PROD`);

    // Create sample final actions
    const finalActions = [
      { name: "Risolto", description: "Problema risolto", order: 1 },
      { name: "Falso positivo", description: "Allarme non significativo", order: 2 },
      { name: "Escalation", description: "Richiede intervento team", order: 3 },
      { name: "Monitoraggio", description: "Da tenere sotto controllo", order: 4 },
      { name: "Altro", description: "Altra azione finale", order: 5, isOther: true },
    ];

    for (const finalActionData of finalActions) {
      await prisma.finalAction.upsert({
        where: {
          productId_name: { productId: product.id, name: finalActionData.name },
        },
        update: {},
        create: {
          ...finalActionData,
          productId: product.id,
        },
      });
    }
    console.log(`    └─ Final Actions: ${finalActions.length} created`);
  }
}

async function main() {
  console.log("🌱 Seeding database...\n");

  // Seed roles and permissions first
  const roles = await seedRolesAndPermissions();

  // Seed users with roles
  await seedUsers(roles);

  // Seed products and related data
  await seedProducts();

  console.log("\n✨ Seeding completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
