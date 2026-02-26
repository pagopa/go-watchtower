import { prisma, Resource } from "@go-watchtower/database";

export type PermissionAction = "read" | "write" | "delete";

export interface UserPermissions {
  [resource: string]: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
  };
}

/**
 * Get effective permissions for a user.
 * Combines role permissions with user-specific overrides.
 */
export async function getUserPermissions(userId: string): Promise<UserPermissions> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: true,
        },
      },
      permissionOverrides: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const permissions: UserPermissions = {};

  // Start with role permissions
  for (const rolePermission of user.role.permissions) {
    permissions[rolePermission.resource] = {
      canRead: rolePermission.canRead,
      canWrite: rolePermission.canWrite,
      canDelete: rolePermission.canDelete,
    };
  }

  // Apply user-specific overrides
  for (const override of user.permissionOverrides) {
    let resourcePerm = permissions[override.resource];
    if (!resourcePerm) {
      resourcePerm = {
        canRead: false,
        canWrite: false,
        canDelete: false,
      };
      permissions[override.resource] = resourcePerm;
    }

    // Only override if explicitly set (not null)
    if (override.canRead !== null) {
      resourcePerm.canRead = override.canRead;
    }
    if (override.canWrite !== null) {
      resourcePerm.canWrite = override.canWrite;
    }
    if (override.canDelete !== null) {
      resourcePerm.canDelete = override.canDelete;
    }
  }

  return permissions;
}

/**
 * Check if a user has a specific permission on a resource.
 */
export async function hasPermission(
  userId: string,
  resource: Resource,
  action: PermissionAction
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);
  const resourcePermissions = permissions[resource];

  if (!resourcePermissions) {
    return false;
  }

  switch (action) {
    case "read":
      return resourcePermissions.canRead;
    case "write":
      return resourcePermissions.canWrite;
    case "delete":
      return resourcePermissions.canDelete;
    default:
      return false;
  }
}

/**
 * Grant or revoke a specific permission for a user.
 * This creates or updates a permission override.
 */
export async function setUserPermissionOverride(
  userId: string,
  resource: Resource,
  permissions: {
    canRead?: boolean | null;
    canWrite?: boolean | null;
    canDelete?: boolean | null;
  },
  grantedBy?: string,
  reason?: string
): Promise<void> {
  await prisma.userPermissionOverride.upsert({
    where: {
      userId_resource: {
        userId,
        resource,
      },
    },
    update: {
      canRead: permissions.canRead,
      canWrite: permissions.canWrite,
      canDelete: permissions.canDelete,
      grantedBy,
      reason,
    },
    create: {
      userId,
      resource,
      canRead: permissions.canRead,
      canWrite: permissions.canWrite,
      canDelete: permissions.canDelete,
      grantedBy,
      reason,
    },
  });
}

/**
 * Remove a permission override for a user.
 * The user will then inherit permissions from their role.
 */
export async function removeUserPermissionOverride(
  userId: string,
  resource: Resource
): Promise<boolean> {
  try {
    await prisma.userPermissionOverride.delete({
      where: {
        userId_resource: {
          userId,
          resource,
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all permission overrides for a user.
 */
export async function getUserPermissionOverrides(userId: string) {
  return prisma.userPermissionOverride.findMany({
    where: { userId },
    include: {
      grantedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Change a user's role.
 */
export async function changeUserRole(
  userId: string,
  roleName: string
): Promise<void> {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
  });

  if (!role) {
    throw new Error(`Role "${roleName}" not found`);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { roleId: role.id },
  });
}

/**
 * Get all available roles.
 */
export async function getAllRoles() {
  return prisma.role.findMany({
    include: {
      permissions: true,
      _count: {
        select: { users: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Get role by name with permissions.
 */
export async function getRoleByName(name: string) {
  return prisma.role.findUnique({
    where: { name },
    include: {
      permissions: true,
    },
  });
}
